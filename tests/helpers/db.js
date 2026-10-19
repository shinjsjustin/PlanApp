'use strict';

const http = require('http');

const pool = require('../../src/db/db');
const { bindConnection, unbindConnection } = require('../../src/db/unitOfWork');

const TEST_DB_SUFFIX = '_test';

/**
 * supertest wraps `request(app)` in a brand-new `http.createServer(app)` that
 * listens on a fresh ephemeral port and is closed after the request. Over a few
 * hundred requests that churn occasionally resets, hangs or answers with
 * another process's bytes on loopback, so a random test in the full run failed
 * (ECONNRESET, "Parse Error: Expected HTTP/", ETIMEDOUT) and passed on rerun.
 *
 * Instead each app gets one server that listens up front, so supertest finds it
 * already bound and neither opens nor closes anything per request. The servers
 * are unref'd so they never hold a test process open.
 */
const SHARED_SERVERS = Symbol.for('planapp.sharedTestServers');

// `http` outlives each test file's module registry, so install the wrapper once
// per process or every file would wrap the previous wrapper.
if (!http.createServer[SHARED_SERVERS]) {
    const sharedServers = new Map();
    const createServer = http.createServer;

    http.createServer = (...args) => {
        const [handler] = args;
        if (args.length !== 1 || typeof handler !== 'function') return createServer(...args);

        if (!sharedServers.has(handler)) {
            const server = createServer(handler);
            server.listen(0);
            server.unref();
            sharedServers.set(handler, server);
        }
        return sharedServers.get(handler);
    };
    http.createServer[SHARED_SERVERS] = sharedServers;
}

/**
 * Integration tests run against a real MySQL schema. Every test body runs inside
 * a transaction that is rolled back afterwards, so the schema is left exactly as
 * it was found and tests never see each other's rows.
 *
 * The database name must end in `_test` so a stray `npm test` can never point at
 * a development database.
 */
const assertTestDatabase = () => {
    const dbName = process.env.DB_NAME;

    if (!dbName) {
        throw new Error(
            'DB_NAME is not set. Point the tests at a test database, e.g.\n' +
                '  DB_NAME=planapp_test npm test'
        );
    }

    if (!dbName.endsWith(TEST_DB_SUFFIX)) {
        throw new Error(
            `Refusing to run integration tests against database "${dbName}": ` +
                `the name must end in "${TEST_DB_SUFFIX}".\n` +
                '  DB_NAME=planapp_test npm test'
        );
    }
};

/**
 * Wires up per-test transaction isolation and returns an accessor for the
 * connection the current test should use. Repositories take that connection as
 * their first argument, so everything they write is rolled back.
 *
 * The same connection is bound into `src/db/unitOfWork`, so a request driven
 * through supertest runs on it too and is rolled back with everything else.
 */
const useTransaction = () => {
    let connection = null;

    beforeAll(() => {
        assertTestDatabase();
    });

    beforeEach(async () => {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        bindConnection(connection);
    });

    afterEach(async () => {
        unbindConnection();
        if (!connection) return;
        try {
            await connection.rollback();
        } finally {
            connection.release();
            connection = null;
        }
    });

    afterAll(async () => {
        await pool.end();
    });

    return () => {
        if (!connection) {
            throw new Error('No transactional connection is open for this test');
        }
        return connection;
    };
};

/** Inserts a throwaway user inside the current transaction and returns its id. */
const createTestUser = async (conn, overrides = {}) => {
    const user = {
        name: 'Test User',
        email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: 'not-a-real-hash',
        accessLevel: 1,
        ...overrides,
    };

    const [result] = await conn.execute(
        'INSERT INTO users (name, email, password, access_level) VALUES (?, ?, ?, ?)',
        [user.name, user.email, user.password, user.accessLevel]
    );

    return result.insertId;
};

module.exports = { assertTestDatabase, useTransaction, createTestUser };
