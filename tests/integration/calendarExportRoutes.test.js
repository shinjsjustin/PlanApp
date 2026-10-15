'use strict';

const request = require('supertest');

const app = require('../../src/server');
const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const daysRepo = require('../../src/db/repositories/calendarDaysRepo');
const itemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const exportsRepo = require('../../src/db/repositories/googleExportsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { encrypt } = require('../../src/lib/tokenCrypto');
const { useTransaction } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const jsonResponse = (status, body = {}) => ({ ok: status < 400, status, json: async () => body });

let fetchMock;
let savedEnv;

beforeEach(() => {
    savedEnv = { ...process.env };
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    fetchMock.mockRestore();
    console.error.mockRestore();
    process.env = savedEnv;
});

const seedAccount = (conn, userId) =>
    googleAccountsRepo.upsert(conn, {
        userId,
        email: 'g@example.com',
        refreshTokenEnc: encrypt('the-refresh'),
        accessTokenEnc: encrypt('the-access'),
        accessExpiresAt: Date.now() + 3600_000,
        scopes: 'openid email',
    });

// A connected user with a dated day and two to-dos, only the first booked.
const setup = async (conn, { connected = true } = {}) => {
    const { ownerId, project } = await createFixture(conn);
    if (connected) await seedAccount(conn, ownerId);
    const day = await daysRepo.create(conn, { ownerId, today: '2026-10-15' });
    const first = await todosRepo.create(conn, { projectId: project.id, text: 'Write' });
    const second = await todosRepo.create(conn, { projectId: project.id, text: 'Read' });
    return { ownerId, day, first, second };
};

const book = (conn, dayId, todo, startMinutes = 600) =>
    itemsRepo.upsert(conn, { dayId, todoId: todo.id, startMinutes, durationMinutes: 30 });

const exportAs = (userId) =>
    request(app)
        .post('/api/calendar/export')
        .set('Authorization', authHeaderFor(userId))
        .set('X-Time-Zone', 'UTC')
        .send({});

const HASH = expect.stringMatching(/^[0-9a-f]{64}$/);

const calls = (method) => fetchMock.mock.calls.filter(([, init]) => init && init.method === method);
const bodyOf = (call) => JSON.parse(call[1].body);

describe('POST /api/calendar/export', () => {
    test('is 401 without a token', async () => {
        const response = await request(app).post('/api/calendar/export');
        expect(response.status).toBe(401);
    });

    test('is 409 without a Google account, with no Google call and no row change', async () => {
        const conn = getConn();
        const { ownerId, day, first } = await setup(conn, { connected: false });
        await book(conn, day.id, first);
        await exportsRepo.upsert(conn, { userId: ownerId, itemKey: 'todo:999', googleEventId: 'old' });

        const response = await exportAs(ownerId);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Google not connected');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual([
            { itemKey: 'todo:999', googleEventId: 'old', bodyHash: null },
        ]);
    });

    test('a first export inserts one event per booking and stores each mapping', async () => {
        const conn = getConn();
        const { ownerId, day, first, second } = await setup(conn);
        await book(conn, day.id, first);
        await book(conn, day.id, second, 700);
        let n = 0;
        fetchMock.mockImplementation(async () => jsonResponse(200, { id: `g${++n}` }));

        const response = await exportAs(ownerId);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ created: 2, updated: 0, deleted: 0, unchanged: 0 });
        expect(calls('POST')).toHaveLength(2);
        expect(bodyOf(calls('POST')[0])).toMatchObject({
            summary: 'Write',
            start: { dateTime: '2026-10-15T10:00:00', timeZone: 'UTC' },
            end: { dateTime: '2026-10-15T10:30:00', timeZone: 'UTC' },
            extendedProperties: { private: { shinplanKey: `todo:${first.id}` } },
        });
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual(
            expect.arrayContaining([
                { itemKey: `todo:${first.id}`, googleEventId: 'g1', bodyHash: HASH },
                { itemKey: `todo:${second.id}`, googleEventId: 'g2', bodyHash: HASH },
            ])
        );
    });

    test('a second export PATCHes a moved booking and DELETEs an unbooked one', async () => {
        const conn = getConn();
        const { ownerId, day, first, second } = await setup(conn);
        await book(conn, day.id, first);
        await exportsRepo.upsert(conn, { userId: ownerId, itemKey: `todo:${first.id}`, googleEventId: 'e1' });
        await exportsRepo.upsert(conn, { userId: ownerId, itemKey: `todo:${second.id}`, googleEventId: 'e2' });
        await book(conn, day.id, first, 660);
        fetchMock.mockImplementation(async () => jsonResponse(200, { id: 'e1' }));

        const response = await exportAs(ownerId);

        expect(response.body.data).toEqual({ created: 0, updated: 1, deleted: 1, unchanged: 0 });
        expect(calls('POST')).toHaveLength(0);
        expect(calls('PATCH')).toHaveLength(1);
        expect(calls('PATCH')[0][0]).toMatch(/\/events\/e1$/);
        expect(bodyOf(calls('PATCH')[0]).start.dateTime).toBe('2026-10-15T11:00:00');
        expect(calls('DELETE')).toHaveLength(1);
        expect(calls('DELETE')[0][0]).toMatch(/\/events\/e2$/);
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual([
            { itemKey: `todo:${first.id}`, googleEventId: 'e1', bodyHash: HASH },
        ]);
    });

    test('a second export with no booking changes makes no Google call and counts unchanged', async () => {
        const conn = getConn();
        const { ownerId, day, first, second } = await setup(conn);
        await book(conn, day.id, first);
        await book(conn, day.id, second, 700);
        let n = 0;
        fetchMock.mockImplementation(async () => jsonResponse(200, { id: `g${++n}` }));
        await exportAs(ownerId);
        const before = await exportsRepo.listByUser(conn, ownerId);
        fetchMock.mockClear();

        const response = await exportAs(ownerId);

        expect(response.body.data).toEqual({ created: 0, updated: 0, deleted: 0, unchanged: 2 });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual(before);
    });

    test('a moved booking is PATCHed once and its mapping holds the new body hash', async () => {
        const conn = getConn();
        const { ownerId, day, first } = await setup(conn);
        await book(conn, day.id, first);
        fetchMock.mockImplementation(async () => jsonResponse(200, { id: 'g1' }));
        await exportAs(ownerId);
        const [old] = await exportsRepo.listByUser(conn, ownerId);
        await book(conn, day.id, first, 660);
        fetchMock.mockClear();

        const response = await exportAs(ownerId);

        expect(response.body.data).toEqual({ created: 0, updated: 1, deleted: 0, unchanged: 0 });
        expect(calls('PATCH')).toHaveLength(1);
        const [moved] = await exportsRepo.listByUser(conn, ownerId);
        expect(moved.googleEventId).toBe('g1');
        expect(moved.bodyHash).toMatch(/^[0-9a-f]{64}$/);
        expect(moved.bodyHash).not.toBe(old.bodyHash);
    });

    test('mappings with a null body hash are PATCHed once and then hold a hash', async () => {
        const conn = getConn();
        const { ownerId, day, first } = await setup(conn);
        await book(conn, day.id, first);
        await exportsRepo.upsert(conn, { userId: ownerId, itemKey: `todo:${first.id}`, googleEventId: 'e1' });
        fetchMock.mockImplementation(async () => jsonResponse(200, { id: 'e1' }));

        const first_run = await exportAs(ownerId);
        const second_run = await exportAs(ownerId);

        expect(first_run.body.data).toEqual({ created: 0, updated: 1, deleted: 0, unchanged: 0 });
        expect(second_run.body.data).toEqual({ created: 0, updated: 0, deleted: 0, unchanged: 1 });
        expect(calls('PATCH')).toHaveLength(1);
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual([
            { itemKey: `todo:${first.id}`, googleEventId: 'e1', bodyHash: HASH },
        ]);
    });

    test('a PATCH answering 404 inserts a fresh event and a DELETE answering 404 still removes the mapping', async () => {
        const conn = getConn();
        const { ownerId, day, first, second } = await setup(conn);
        await book(conn, day.id, first);
        await exportsRepo.upsert(conn, { userId: ownerId, itemKey: `todo:${first.id}`, googleEventId: 'e1' });
        await exportsRepo.upsert(conn, { userId: ownerId, itemKey: `todo:${second.id}`, googleEventId: 'e2' });
        fetchMock.mockImplementation(async (url, init) => {
            if (init.method === 'POST') return jsonResponse(200, { id: 'fresh' });
            return jsonResponse(404);
        });

        const response = await exportAs(ownerId);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ created: 1, updated: 0, deleted: 1, unchanged: 0 });
        expect(calls('POST')).toHaveLength(1);
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual([
            { itemKey: `todo:${first.id}`, googleEventId: 'fresh', bodyHash: HASH },
        ]);
    });

    test('a Google failure midway keeps earlier mappings so a re-run creates no duplicate', async () => {
        const conn = getConn();
        const { ownerId, day, first, second } = await setup(conn);
        await book(conn, day.id, first);
        await book(conn, day.id, second, 700);
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { id: 'g1' }))
            .mockResolvedValueOnce(jsonResponse(500));

        const failed = await exportAs(ownerId);

        expect(failed.status).toBe(502);
        expect(await exportsRepo.listByUser(conn, ownerId)).toEqual([
            { itemKey: `todo:${first.id}`, googleEventId: 'g1', bodyHash: HASH },
        ]);

        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url, init) =>
            jsonResponse(200, { id: init.method === 'POST' ? 'g2' : 'g1' })
        );
        const rerun = await exportAs(ownerId);

        expect(rerun.body.data).toEqual({ created: 1, updated: 0, deleted: 0, unchanged: 1 });
        expect(calls('POST')).toHaveLength(1);
    });
});
