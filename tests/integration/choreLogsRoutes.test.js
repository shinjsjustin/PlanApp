'use strict';

const request = require('supertest');

const app = require('../../src/server');
const choresRepo = require('../../src/db/repositories/choresRepo');
const logsRepo = require('../../src/db/repositories/choreLogsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const mk = (conn, ownerId, name = 'Dishes') => choresRepo.create(conn, { ownerId, name, windowMin: 3, windowMax: 7 });
const today = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

describe('POST /api/chores/:id/done', () => {
    test('defaults on to today and by to Justin, answering 201 { log, chore }', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);

        const response = await request(app)
            .post(`/api/chores/${chore.id}/done`)
            .set(as(ownerId))
            .set('X-Time-Zone', 'UTC')
            .send({});

        expect(response.status).toBe(201);
        const { log, chore: updated } = response.body.data;
        expect(log).toMatchObject({ choreId: chore.id, on: today('UTC'), by: 'Justin' });
        expect(updated.lastDone).toEqual({ on: today('UTC'), by: 'Justin' });
    });

    test('accepts a back-dated on and a trimmed by', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);

        const response = await request(app)
            .post(`/api/chores/${chore.id}/done`)
            .set(as(ownerId))
            .send({ on: '2026-01-02', by: '  Sam ' });

        expect(response.status).toBe(201);
        expect(response.body.data.log).toMatchObject({ on: '2026-01-02', by: 'Sam' });
    });

    test.each([
        ['a future date', { on: '9999-01-01' }],
        ['an impossible date', { on: '2026-02-30' }],
        ['a malformed date', { on: 'tomorrow' }],
        ['a blank by', { by: '   ' }],
        ['a too long by', { by: 'x'.repeat(51) }],
    ])('refuses %s with 400 and writes nothing', async (_label, body) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);

        const response = await request(app).post(`/api/chores/${chore.id}/done`).set(as(ownerId)).send(body);

        expect(response.status).toBe(400);
        expect(await logsRepo.listByChore(conn, chore.id)).toEqual([]);
    });

    test('refuses an archived chore with 409', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        await choresRepo.setArchived(conn, chore.id, true);

        const response = await request(app).post(`/api/chores/${chore.id}/done`).set(as(ownerId)).send({});

        expect(response.status).toBe(409);
        expect(await logsRepo.listByChore(conn, chore.id)).toEqual([]);
    });

    test('answers 403 for another user’s chore and 404 for a missing one', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);

        const forbidden = await request(app).post(`/api/chores/${chore.id}/done`).set(as(otherId)).send({});
        const missing = await request(app).post('/api/chores/999999999/done').set(as(ownerId)).send({});

        expect(forbidden.status).toBe(403);
        expect(missing.status).toBe(404);
    });
});

describe('GET /api/chores/:id/logs', () => {
    test('lists logs newest first', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        const older = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-01', doneBy: 'A' });
        const newer = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-05', doneBy: 'B' });

        const response = await request(app).get(`/api/chores/${chore.id}/logs`).set(as(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data.logs.map((l) => l.id)).toEqual([newer.id, older.id]);
    });

    test('answers 403 for another user’s chore', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);

        const response = await request(app).get(`/api/chores/${chore.id}/logs`).set(as(otherId));

        expect(response.status).toBe(403);
    });
});

describe('PATCH /api/chores/:id/logs/:logId', () => {
    test('changes on and by and answers { log, chore } with lastDone updated', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        const log = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-01', doneBy: 'A' });

        const response = await request(app)
            .patch(`/api/chores/${chore.id}/logs/${log.id}`)
            .set(as(ownerId))
            .send({ on: '2026-01-03', by: ' Bo ' });

        expect(response.status).toBe(200);
        expect(response.body.data.log).toMatchObject({ id: log.id, on: '2026-01-03', by: 'Bo' });
        expect(response.body.data.chore.lastDone).toEqual({ on: '2026-01-03', by: 'Bo' });
    });

    test('changes one field and leaves the other', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        const log = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-01', doneBy: 'A' });

        const response = await request(app)
            .patch(`/api/chores/${chore.id}/logs/${log.id}`)
            .set(as(ownerId))
            .send({ by: 'Bo' });

        expect(response.body.data.log).toMatchObject({ on: '2026-01-01', by: 'Bo' });
    });

    test.each([
        ['an empty body', {}],
        ['a future date', { on: '9999-01-01' }],
        ['a blank by', { by: '' }],
    ])('refuses %s with 400', async (_label, body) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        const log = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-01', doneBy: 'A' });

        const response = await request(app).patch(`/api/chores/${chore.id}/logs/${log.id}`).set(as(ownerId)).send(body);

        expect(response.status).toBe(400);
    });

    test('answers 404 for a log under another chore and 403 for another user', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        const sibling = await mk(conn, ownerId, 'Sibling');
        const log = await logsRepo.create(conn, { choreId: sibling.id, doneOn: '2026-01-01', doneBy: 'A' });

        const wrongChore = await request(app).patch(`/api/chores/${chore.id}/logs/${log.id}`).set(as(ownerId)).send({ by: 'X' });
        const wrongUser = await request(app).patch(`/api/chores/${sibling.id}/logs/${log.id}`).set(as(otherId)).send({ by: 'X' });

        expect(wrongChore.status).toBe(404);
        expect(wrongUser.status).toBe(403);
        expect((await logsRepo.findById(conn, log.id)).done_by).toBe('A');
    });
});

describe('DELETE /api/chores/:id/logs/:logId', () => {
    test('removes the log and answers { id, chore } with lastDone falling back', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-01', doneBy: 'A' });
        const latest = await logsRepo.create(conn, { choreId: chore.id, doneOn: '2026-01-05', doneBy: 'B' });

        const response = await request(app).delete(`/api/chores/${chore.id}/logs/${latest.id}`).set(as(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(latest.id);
        expect(response.body.data.chore.lastDone).toEqual({ on: '2026-01-01', by: 'A' });
        expect(await logsRepo.findById(conn, latest.id)).toBeNull();
    });

    test('answers 404 for a log under another chore and 403 for another user', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const chore = await mk(conn, ownerId);
        const sibling = await mk(conn, ownerId, 'Sibling');
        const log = await logsRepo.create(conn, { choreId: sibling.id, doneOn: '2026-01-01', doneBy: 'A' });

        const wrongChore = await request(app).delete(`/api/chores/${chore.id}/logs/${log.id}`).set(as(ownerId));
        const wrongUser = await request(app).delete(`/api/chores/${sibling.id}/logs/${log.id}`).set(as(otherId));

        expect(wrongChore.status).toBe(404);
        expect(wrongUser.status).toBe(403);
        expect(await logsRepo.findById(conn, log.id)).not.toBeNull();
    });
});
