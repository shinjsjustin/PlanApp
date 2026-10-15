'use strict';

const request = require('supertest');

const app = require('../../src/server');
const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const { encrypt } = require('../../src/lib/tokenCrypto');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

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

const URL = '/api/bourne/calendar/events';
const getAs = (userId, query) =>
    request(app).get(`${URL}?${query}`).set('Authorization', authHeaderFor(userId)).set('X-Time-Zone', 'UTC');

describe('GET /api/bourne/calendar/events', () => {
    test('is 401 without a token', async () => {
        const response = await request(app).get(`${URL}?from=2026-10-15&to=2026-10-16`);
        expect(response.status).toBe(401);
    });

    test('is 409 Google not connected with no account and no Google call', async () => {
        const userId = await createTestUser(getConn());
        const response = await getAs(userId, 'from=2026-10-15&to=2026-10-16');
        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Google not connected');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test.each([
        ['to missing', 'from=2026-10-15'],
        ['from missing', 'to=2026-10-15'],
        ['from not a real date', 'from=2026-02-30&to=2026-03-01'],
        ['to not a date', 'from=2026-10-15&to=soon'],
        ['to before from', 'from=2026-10-16&to=2026-10-15'],
        ['range over 366 days', 'from=2026-01-01&to=2027-01-03'],
    ])('is 400 when %s', async (_name, query) => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        const response = await getAs(userId, query);
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('accepts a 366 day span', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        fetchMock.mockResolvedValue(jsonResponse(200, { items: [] }));
        const response = await getAs(userId, 'from=2026-01-01&to=2027-01-02');
        expect(response.status).toBe(200);
    });

    test('answers the events overlapping the range in the wire shape', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        fetchMock.mockResolvedValue(
            jsonResponse(200, {
                items: [
                    { id: 'a', summary: 'Standup', location: 'Zoom', start: { dateTime: '2026-10-15T10:00:00Z' }, end: { dateTime: '2026-10-15T10:30:00Z' } },
                    { id: 'b', start: { date: '2026-10-16' }, end: { date: '2026-10-17' } },
                    { id: 'c', summary: 'Later', start: { dateTime: '2026-10-20T10:00:00Z' }, end: { dateTime: '2026-10-20T11:00:00Z' } },
                    { id: 'd', status: 'cancelled', summary: 'Gone', start: { dateTime: '2026-10-15T12:00:00Z' }, end: { dateTime: '2026-10-15T13:00:00Z' } },
                ],
            })
        );

        const response = await getAs(userId, 'from=2026-10-15&to=2026-10-16');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            events: [
                { id: 'a', summary: 'Standup', start: '2026-10-15T10:00:00Z', end: '2026-10-15T10:30:00Z', allDay: false, location: 'Zoom' },
                { id: 'b', summary: null, start: '2026-10-16', end: '2026-10-17', allDay: true, location: null },
            ],
        });
        const calledUrl = String(fetchMock.mock.calls[0][0]);
        expect(calledUrl).toContain('timeMin=2026-10-14T00%3A00%3A00.000Z');
        expect(calledUrl).toContain('timeMax=2026-10-18T00%3A00%3A00.000Z');
    });
});

describe('Bourne Drive routes', () => {
    const FILES = '/api/bourne/drive/files';
    const driveGet = (userId, path) => request(app).get(path).set('Authorization', authHeaderFor(userId));
    const textResponse = (body) => ({ ok: true, status: 200, text: async () => body });

    test.each([FILES, `${FILES}/abc`])('%s is 401 without a token', async (path) => {
        const response = await request(app).get(path);
        expect(response.status).toBe(401);
    });

    test.each([FILES, `${FILES}/abc`])('%s is 409 Google not connected with no Google call', async (path) => {
        const userId = await createTestUser(getConn());
        const response = await driveGet(userId, path);
        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Google not connected');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('list passes search and pageToken and answers files with nextPageToken', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        const file = { id: 'f1', name: 'Plan', mimeType: 'text/plain', modifiedTime: '2026-10-01T00:00:00Z', size: '5' };
        fetchMock.mockResolvedValue(jsonResponse(200, { files: [file], nextPageToken: 'next' }));

        const response = await driveGet(userId, `${FILES}?search=plan&pageToken=t`);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ files: [file], nextPageToken: 'next' });
        const params = new URLSearchParams(String(fetchMock.mock.calls[0][0]).split('?')[1]);
        expect(params.get('q')).toBe("trashed = false and fullText contains 'plan'");
        expect(params.get('pageToken')).toBe('t');
    });

    test.each([
        ['search over 200 chars', `search=${'a'.repeat(201)}`],
        ['empty search', 'search='],
        ['pageToken over 1024 chars', `pageToken=${'a'.repeat(1025)}`],
    ])('list is 400 when %s', async (_name, query) => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        const response = await driveGet(userId, `${FILES}?${query}`);
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('read answers file, content and reason', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { id: 'f1', name: 'Plan', mimeType: 'text/plain', modifiedTime: '2026-10-01T00:00:00Z', size: '5' }))
            .mockResolvedValueOnce(textResponse('hello'));

        const response = await driveGet(userId, `${FILES}/f1`);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            file: { id: 'f1', name: 'Plan', mimeType: 'text/plain', modifiedTime: '2026-10-01T00:00:00Z', size: 5 },
            content: 'hello',
            reason: null,
        });
    });

    test.each([['bad.id'], ['a'.repeat(201)]])('read is 400 for file id %s with no Google call', async (id) => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        const response = await driveGet(userId, `${FILES}/${id}`);
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('read answers 404 Drive file not found when Drive says 404', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        await seedAccount(conn, userId);
        fetchMock.mockResolvedValue(jsonResponse(404, {}));
        const response = await driveGet(userId, `${FILES}/gone`);
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Drive file not found');
    });
});
