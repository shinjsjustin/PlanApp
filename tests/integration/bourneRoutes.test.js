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
