'use strict';

const request = require('supertest');
const app = require('../../src/server');
const pool = require('../../src/db/db');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { assertTestDatabase } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');
const { authHeaderFor } = require('../helpers/auth');

const DELETE_LOCK_TIMEOUT_SECONDS = 1;
let confirmation;
let deletion;
let fixture;
let todos;
let confirmationIsolation;
let deletionLockTimeout;

beforeAll(assertTestDatabase);
beforeEach(async () => {
    confirmation = null;
    deletion = null;
    fixture = null;
    todos = [];
    confirmationIsolation = null;
    deletionLockTimeout = null;

    confirmation = await pool.getConnection();
    const [[{ isolation }]] = await confirmation.query(
        'SELECT @@SESSION.transaction_isolation AS isolation'
    );
    confirmationIsolation = isolation;
    // Ownership reads must establish a stale snapshot, regardless of pool defaults.
    await confirmation.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    deletion = await pool.getConnection();
    const [[{ lockTimeout }]] = await deletion.query(
        'SELECT @@SESSION.innodb_lock_wait_timeout AS lockTimeout'
    );
    deletionLockTimeout = lockTimeout;
    await deletion.query(`SET SESSION innodb_lock_wait_timeout = ${DELETE_LOCK_TIMEOUT_SECONDS}`);
    // Rollback can clean even a fixture that throws before returning its owner id.
    await deletion.beginTransaction();
    fixture = await createFixture(deletion);
    const first = await todosRepo.create(deletion, { projectId: fixture.project.id, text: 'First' });
    const second = await todosRepo.create(deletion, { projectId: fixture.project.id, text: 'Second' });
    todos = [first, second];
    await deletion.commit();
});

const cleanupConnection = async (connection, restore) => {
    if (!connection) return;
    let isClean = false;
    try {
        await connection.rollback();
        await restore();
        isClean = true;
    } finally {
        // Never return a transaction or altered session to the pool after failure.
        if (isClean) connection.release();
        else connection.destroy();
    }
};

afterEach(async () => {
    jest.restoreAllMocks();
    // Attempt both cleanups even if one fails; surface every cleanup error.
    const results = await Promise.allSettled([
        cleanupConnection(confirmation, async () => {
            if (confirmationIsolation !== null) {
                await confirmation.query('SET SESSION transaction_isolation = ?', [confirmationIsolation]);
            }
        }),
        cleanupConnection(deletion, async () => {
            if (fixture) await deletion.execute('DELETE FROM users WHERE id = ?', [fixture.ownerId]);
            if (deletionLockTimeout !== null) {
                await deletion.query('SET SESSION innodb_lock_wait_timeout = ?', [deletionLockTimeout]);
            }
        }),
    ]);
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Concurrency test cleanup failed');
});
afterAll(() => pool.end());

// Only scheduling is intercepted: both connections execute real MySQL queries,
// and the route uses its production BEGIN/COMMIT/ROLLBACK (no bound savepoint).
const interceptConfirmation = ({ beforeValidation, afterValidation, beforeCommit } = {}) => {
    const proxy = {
        execute: (...args) => confirmation.execute(...args),
        query: async (...args) => {
            const isValidation = args[0].includes('SELECT t.id, t.project_id, p.owner_id');
            if (isValidation && beforeValidation) await beforeValidation();
            const result = await confirmation.query(...args);
            if (isValidation && afterValidation) await afterValidation();
            return result;
        },
        beginTransaction: () => confirmation.beginTransaction(),
        commit: async () => {
            if (beforeCommit) await beforeCommit();
            return confirmation.commit();
        },
        rollback: () => confirmation.rollback(),
        release: () => {}, // The test owns the lease until cleanup.
    };
    jest.spyOn(pool, 'getConnection').mockResolvedValue(proxy);
};

const confirmPins = () => request(app)
    .put(`/api/projects/${fixture.project.id}/todos/pins`)
    .set('Authorization', authHeaderFor(fixture.ownerId))
    .send({ todoIds: todos.map((todo) => todo.id), isPinned: true });

const deleteSelected = () => deletion.execute('DELETE FROM todos WHERE id = ?', [todos[1].id]);
const deletionOutcome = () => deleteSelected().then(
    () => 'deleted',
    (error) => {
        if (error.code !== 'ER_LOCK_WAIT_TIMEOUT') throw error;
        return error.code;
    }
);

test('holds selected rows against deletion from validation through commit', async () => {
    let afterValidation;
    let beforeCommit;
    interceptConfirmation({
        afterValidation: async () => { afterValidation = await deletionOutcome(); },
        beforeCommit: async () => { beforeCommit = await deletionOutcome(); },
    });

    const response = await confirmPins();

    expect(afterValidation).toBe('ER_LOCK_WAIT_TIMEOUT');
    expect(beforeCommit).toBe('ER_LOCK_WAIT_TIMEOUT');
    expect(response.status).toBe(200);
    expect(response.body.data.todos).toEqual(todos.map((todo) =>
        expect.objectContaining({ id: todo.id, isPinned: true })));
    const rows = await todosRepo.findByIds(deletion, todos.map((todo) => todo.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => Boolean(row.is_pinned))).toBe(true);
    await deleteSelected(); // The real COMMIT released the lock.
    expect(await todosRepo.findById(deletion, todos[1].id)).toBeNull();
});

test('allows same-project FK child insertion while validation holds selected todo locks', async () => {
    let insertedLayerId;
    interceptConfirmation({
        afterValidation: async () => {
            // A second real transaction needs a shared parent lock, not a todo lock.
            // Both statements must finish BEFORE confirmation can update or commit.
            await deletion.beginTransaction();
            await deletion.execute('SELECT id FROM projects WHERE id = ? FOR SHARE', [fixture.project.id]);
            const [result] = await deletion.execute(
                'INSERT INTO layers (project_id, title, position) VALUES (?, ?, ?)',
                [fixture.project.id, 'Concurrent child', fixture.layer.position + 1]
            );
            insertedLayerId = result.insertId;
            await deletion.commit();
        },
    });

    const response = await confirmPins();

    expect(response.status).toBe(200);
    expect(response.body.data.todos).toEqual(todos.map((todo) =>
        expect.objectContaining({ id: todo.id, isPinned: true })));
    expect(insertedLayerId).toEqual(expect.any(Number));
    const [rows] = await deletion.execute('SELECT project_id FROM layers WHERE id = ?', [insertedLayerId]);
    expect(rows).toEqual([{ project_id: fixture.project.id }]);
});

test('rejects a deletion committed after the ownership snapshot without partially pinning', async () => {
    interceptConfirmation({ beforeValidation: deleteSelected });

    const response = await confirmPins();

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/To-do/);
    expect(await todosRepo.findById(deletion, todos[1].id)).toBeNull();
    expect((await todosRepo.findById(deletion, todos[0].id)).is_pinned).toBe(0);
});

test('returns current fields for an already-pinned row changed after the ownership snapshot', async () => {
    await todosRepo.setPinned(deletion, todos.map((todo) => todo.id), true);
    interceptConfirmation({ beforeValidation: () => deletion.execute(
        'UPDATE todos SET text = ? WHERE id = ?', ['Current text', todos[1].id]
    ) });

    const response = await confirmPins();

    expect(response.status).toBe(200);
    expect(response.body.data.todos).toEqual([
        expect.objectContaining({ id: todos[0].id, isPinned: true }),
        expect.objectContaining({ id: todos[1].id, text: 'Current text', isPinned: true }),
    ]);
});
