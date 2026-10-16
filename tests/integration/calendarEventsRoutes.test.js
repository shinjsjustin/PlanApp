'use strict';

const request = require('supertest');

const app = require('../../src/server');
const googleAccountsRepo = require('../../src/db/repositories/googleAccountsRepo');
const daysRepo = require('../../src/db/repositories/calendarDaysRepo');
const eventsRepo = require('../../src/db/repositories/calendarEventsRepo');
const { encrypt } = require('../../src/lib/tokenCrypto');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });
const googleAnswer = (items) => jsonResponse(200, { items });

// 10:00-10:30 UTC. Days created on one date are consecutive: dayA is 2026-10-15, dayB 2026-10-16.
const timed = (id, date = '2026-10-15') => ({
    id,
    summary: `Event ${id}`,
    start: { dateTime: `${date}T10:00:00Z` },
    end: { dateTime: `${date}T10:30:00Z` },
});

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

const setup = async (conn) => {
    const userId = await createTestUser(conn);
    await seedAccount(conn, userId);
    const dayA = await daysRepo.create(conn, { ownerId: userId, today: '2026-10-15' });
    const dayB = await daysRepo.create(conn, { ownerId: userId, today: '2026-10-15' });
    return { userId, dayA, dayB };
};

const importAs = (userId, body = {}) =>
    request(app)
        .post('/api/calendar/events/import')
        .set('Authorization', authHeaderFor(userId))
        .set('X-Time-Zone', 'UTC')
        .send(body);

const row = (dayId, googleEventId, title) => ({
    googleEventId,
    title,
    allDay: false,
    startMinutes: 600,
    durationMinutes: 30,
    dayId,
});

describe('GET /api/calendar/events', () => {
    test('is 401 without a token', async () => {
        const response = await request(app).get('/api/calendar/events');
        expect(response.status).toBe(401);
    });

    test('answers only the caller\'s events in the wire shape', async () => {
        const conn = getConn();
        const { userId, dayA } = await setup(conn);
        const other = await createTestUser(conn);
        const otherDay = await daysRepo.create(conn, { ownerId: other, today: '2026-10-15' });
        await eventsRepo.replaceForDay(conn, dayA.id, [row(dayA.id, 'g1', 'Mine')]);
        await eventsRepo.replaceForDay(conn, otherDay.id, [row(otherDay.id, 'g2', 'Theirs')]);

        const response = await request(app)
            .get('/api/calendar/events')
            .set('Authorization', authHeaderFor(userId));

        expect(response.status).toBe(200);
        expect(response.body.data.events).toEqual([
            {
                id: expect.any(Number),
                dayId: dayA.id,
                googleEventId: 'g1',
                title: 'Mine',
                allDay: false,
                startMinutes: 600,
                durationMinutes: 30,
                location: null,
            },
        ]);
    });
});

describe('POST /api/calendar/events/import', () => {
    test('imports every dated day and answers the full list', async () => {
        const conn = getConn();
        const { userId, dayA, dayB } = await setup(conn);
        fetchMock.mockResolvedValue(googleAnswer([timed('g1'), timed('g2', '2026-10-16')]));

        const response = await importAs(userId);

        expect(response.status).toBe(200);
        expect(response.body.data.events.map((e) => [e.dayId, e.googleEventId, e.title, e.startMinutes, e.durationMinutes, e.allDay])).toEqual([
            [dayA.id, 'g1', 'Event g1', 600, 30, false],
            [dayB.id, 'g2', 'Event g2', 600, 30, false],
        ]);
        expect(JSON.stringify(response.body)).not.toContain('the-access');
    });

    test('stores an event\'s Google location and lists it', async () => {
        const { userId } = await setup(getConn());
        fetchMock.mockResolvedValue(googleAnswer([{ ...timed('g1'), location: '1 Main St' }, timed('g2')]));

        const imported = await importAs(userId);
        const listed = await request(app)
            .get('/api/calendar/events')
            .set('Authorization', authHeaderFor(userId));

        const locations = (r) => r.body.data.events.map((e) => [e.googleEventId, e.location]);
        expect(locations(imported)).toEqual([['g1', '1 Main St'], ['g2', null]]);
        expect(locations(listed)).toEqual([['g1', '1 Main St'], ['g2', null]]);
    });

    test('importing twice with the same answer leaves the same rows', async () => {
        const { userId } = await setup(getConn());
        fetchMock.mockResolvedValue(googleAnswer([timed('g1')]));

        const first = await importAs(userId);
        const second = await importAs(userId);

        expect(second.body.data.events.map((e) => e.id)).toHaveLength(1);
        expect(second.body.data.events.map((e) => [e.dayId, e.googleEventId])).toEqual(
            first.body.data.events.map((e) => [e.dayId, e.googleEventId])
        );
    });

    test('an event gone from Google is removed from its day', async () => {
        const { userId } = await setup(getConn());
        fetchMock.mockResolvedValueOnce(googleAnswer([timed('g1'), timed('g2')]));
        await importAs(userId);
        fetchMock.mockResolvedValueOnce(googleAnswer([timed('g2')]));

        const response = await importAs(userId);

        expect(new Set(response.body.data.events.map((e) => e.googleEventId))).toEqual(new Set(['g2']));
        expect(response.body.data.events).toHaveLength(1);
    });

    test('with a dayId only that day changes and other days are untouched', async () => {
        const conn = getConn();
        const { userId, dayA, dayB } = await setup(conn);
        await eventsRepo.replaceForDay(conn, dayB.id, [row(dayB.id, 'keep', 'Keep me')]);
        fetchMock.mockResolvedValue(googleAnswer([timed('g1')]));

        const response = await importAs(userId, { dayId: dayA.id });

        expect(response.status).toBe(200);
        expect(response.body.data.events.map((e) => [e.dayId, e.googleEventId]).sort()).toEqual(
            [[dayA.id, 'g1'], [dayB.id, 'keep']].sort()
        );
    });

    test('is 404 for an unknown day and 403 for another user\'s day', async () => {
        const conn = getConn();
        const { userId } = await setup(conn);
        const other = await createTestUser(conn);
        const otherDay = await daysRepo.create(conn, { ownerId: other, today: '2026-10-15' });

        const unknown = await importAs(userId, { dayId: 999999999 });
        const foreign = await importAs(userId, { dayId: otherDay.id });

        expect(unknown.status).toBe(404);
        expect(foreign.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('is 409 without a Google account and changes nothing', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const day = await daysRepo.create(conn, { ownerId: userId, today: '2026-10-15' });
        await eventsRepo.replaceForDay(conn, day.id, [row(day.id, 'keep', 'Keep me')]);

        const response = await importAs(userId);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Google not connected');
        expect(fetchMock).not.toHaveBeenCalled();
        const rows = await eventsRepo.listByOwner(conn, userId);
        expect(rows.map((r) => r.google_event_id)).toEqual(['keep']);
    });
});
