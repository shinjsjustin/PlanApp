'use strict';

const pool = require('./db');

/**
 * Connection and transaction boundaries for the route layer.
 *
 * Repositories take the connection to run on as their first argument, so
 * something has to own that decision. Routes call `withConnection` for reads and
 * `withTransaction` for anything that writes more than one row; both always
 * release the connection back to the pool, including on failure.
 *
 * Integration tests bind their own already-open connection (see
 * `tests/helpers/db.js`), so requests run inside the test's transaction and are
 * rolled back with it. While one is bound, `withTransaction` nests through a
 * SAVEPOINT rather than a second BEGIN, which MySQL would treat as an implicit
 * commit of the test's transaction.
 */

let boundConnection = null;

/** Test hook: run every subsequent unit of work on this connection. */
const bindConnection = (connection) => {
    boundConnection = connection;
};

const unbindConnection = () => {
    boundConnection = null;
};

const withConnection = async (fn) => {
    if (boundConnection) return fn(boundConnection);

    const connection = await pool.getConnection();
    try {
        return await fn(connection);
    } finally {
        connection.release();
    }
};

let savepointCounter = 0;

const withSavepoint = async (connection, fn) => {
    savepointCounter += 1;
    const name = `sp_${savepointCounter}`;

    await connection.query(`SAVEPOINT ${name}`);
    try {
        const result = await fn(connection);
        await connection.query(`RELEASE SAVEPOINT ${name}`);
        return result;
    } catch (err) {
        await connection.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw err;
    }
};

const withTransaction = async (fn) => {
    if (boundConnection) return withSavepoint(boundConnection, fn);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

module.exports = { bindConnection, unbindConnection, withConnection, withTransaction };
