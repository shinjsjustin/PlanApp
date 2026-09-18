'use strict';

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// The E2E flow writes to a real schema through a real server, so unlike the Jest
// integration tests it cannot wrap itself in a transaction and roll back — the
// server is a separate process on its own connection.
//
// It cleans up by identity instead. Everything the run creates hangs off the one
// account it registers, and `projects.owner_id` cascades from `users`, so
// deleting that row deletes the whole tree with it (spec section 4.2).

const TEST_DB_SUFFIX = '_test';

/**
 * The same guard `tests/helpers/db.js` applies: a run that could point at a
 * development database is refused rather than allowed to delete from one.
 */
const testDatabaseName = () => {
    const dbName = process.env.DB_NAME;

    if (!dbName) {
        throw new Error(
            'DB_NAME is not set. Point the E2E run at a test database, e.g.\n' +
                '  DB_NAME=planapp_test npm run test:e2e'
        );
    }

    if (!dbName.endsWith(TEST_DB_SUFFIX)) {
        throw new Error(
            `Refusing to run E2E tests against database "${dbName}": ` +
                `the name must end in "${TEST_DB_SUFFIX}".\n` +
                '  DB_NAME=planapp_test npm run test:e2e'
        );
    }

    return dbName;
};

const connect = () =>
    mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: testDatabaseName(),
    });

const OWNED_BY = 'SELECT id FROM users WHERE email = ?';

/**
 * Removes the account the run registered and everything it created.
 *
 * The to-dos go first for the same reason `projectsRepo.remove` deletes them
 * explicitly: two paths reach `todos` — deleted with their project, set to NULL
 * when their sequence goes — and InnoDB rejects the SET NULL because it
 * revalidates `fk_todos_project` against a project row the same cascade is
 * deleting. With the to-dos gone there is nothing for it to touch, and `layers`
 * and `sequences` cascade from `projects` as usual.
 *
 * A cleanup that failed silently would leave rows behind for every future run
 * to trip over, so the error is left to propagate rather than swallowed.
 */
const deleteUserByEmail = async (email) => {
    const connection = await connect();

    try {
        await connection.execute(
            `DELETE FROM todos WHERE project_id IN
             (SELECT id FROM projects WHERE owner_id IN (${OWNED_BY}))`,
            [email]
        );
        await connection.execute(
            `DELETE FROM projects WHERE owner_id IN (${OWNED_BY})`,
            [email]
        );
        await connection.execute('DELETE FROM users WHERE email = ?', [email]);
    } finally {
        await connection.end();
    }
};

module.exports = { deleteUserByEmail, testDatabaseName };
