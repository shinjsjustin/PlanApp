'use strict';

const request = require('supertest');

const app = require('../../src/server');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const moment = (overrides = {}) => ({
    startMinutes: 480,
    durationMinutes: 60,
    title: 'Work',
    category: 'work',
    ...overrides,
});
const put = (userId, date, body) => request(app).put(`/api/lived/days/${date}`).set(as(userId)).send(body);
const list = (userId, query) => request(app).get('/api/lived').query(query).set(as(userId));

describe('PUT /api/lived/days/:date', () => {
    test('stores the day and answers { date, moments } with defaults filled in', async () => {
        const userId = await createTestUser(getConn());

        const response = await put(userId, '2026-10-30', {
            moments: [moment({ startMinutes: 600, title: 'Late' }), moment({ chatTicks: [490] })],
        });

        expect(response.status).toBe(200);
        const { date, moments } = response.body.data;
        expect(date).toBe('2026-10-30');
        expect(moments.map((m) => m.title)).toEqual(['Work', 'Late']);
        expect(moments[0]).toMatchObject({
            date: '2026-10-30',
            startMinutes: 480,
            durationMinutes: 60,
            category: 'work',
            detail: null,
            chatTicks: [490],
        });
        expect(typeof moments[0].id).toBe('number');
    });

    test('a second PUT fully replaces the first', async () => {
        const userId = await createTestUser(getConn());
        await put(userId, '2026-10-30', { moments: [moment({ title: 'A' }), moment({ startMinutes: 700, title: 'B' })] });

        const response = await put(userId, '2026-10-30', { moments: [moment({ title: 'C' })] });

        expect(response.body.data.moments.map((m) => m.title)).toEqual(['C']);
        const stored = await list(userId, { from: '2026-10-30', to: '2026-10-30' });
        expect(stored.body.data.moments.map((m) => m.title)).toEqual(['C']);
    });

    test('an empty moments list clears the day', async () => {
        const userId = await createTestUser(getConn());
        await put(userId, '2026-10-30', { moments: [moment()] });

        const response = await put(userId, '2026-10-30', { moments: [] });

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ date: '2026-10-30', moments: [] });
    });

    test.each([
        ['a bad date', '2026-13-45', { moments: [moment()] }],
        ['a missing moments list', '2026-10-30', {}],
        ['a moment without a title', '2026-10-30', { moments: [{ ...moment(), title: '' }] }],
        ['a moment ending past 04:00 next day', '2026-10-30', { moments: [moment({ startMinutes: 1600, durationMinutes: 81 })] }],
    ])('%s is 400 and leaves the stored day unchanged', async (_name, date, body) => {
        const userId = await createTestUser(getConn());
        await put(userId, '2026-10-30', { moments: [moment({ title: 'Good' })] });

        const response = await put(userId, date, body);

        expect(response.status).toBe(400);
        const stored = await list(userId, { from: '2026-10-30', to: '2026-10-30' });
        expect(stored.body.data.moments.map((m) => m.title)).toEqual(['Good']);
    });

    test('a moment ending exactly at 04:00 next day is accepted', async () => {
        const userId = await createTestUser(getConn());

        const response = await put(userId, '2026-10-30', { moments: [moment({ startMinutes: 1600, durationMinutes: 80 })] });

        expect(response.status).toBe(200);
    });

    test('does not touch another user’s day', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await put(otherId, '2026-10-30', { moments: [moment({ title: 'Theirs' })] });

        await put(userId, '2026-10-30', { moments: [moment({ title: 'Mine' })] });
        await put(userId, '2026-10-30', { moments: [] });

        const theirs = await list(otherId, { from: '2026-10-30', to: '2026-10-30' });
        expect(theirs.body.data.moments.map((m) => m.title)).toEqual(['Theirs']);
    });
});

describe('GET /api/lived', () => {
    test('returns the caller’s moments in range ordered by date then start', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await put(userId, '2026-10-30', { moments: [moment({ startMinutes: 900, title: 'd1 late' }), moment({ title: 'd1 early' })] });
        await put(userId, '2026-10-29', { moments: [moment({ title: 'd0' })] });
        await put(userId, '2026-11-05', { moments: [moment({ title: 'outside' })] });
        await put(otherId, '2026-10-30', { moments: [moment({ title: 'theirs' })] });

        const response = await list(userId, { from: '2026-10-29', to: '2026-10-31' });

        expect(response.status).toBe(200);
        expect(response.body.data.moments.map((m) => m.title)).toEqual(['d0', 'd1 early', 'd1 late']);
    });

    test.each([
        ['no range', {}],
        ['a missing to', { from: '2026-10-29' }],
        ['a bad date', { from: 'nope', to: '2026-10-31' }],
        ['from after to', { from: '2026-10-31', to: '2026-10-29' }],
    ])('%s is 400', async (_name, query) => {
        const userId = await createTestUser(getConn());

        const response = await list(userId, query);

        expect(response.status).toBe(400);
    });
});

describe('DELETE /api/lived/days/:date', () => {
    test('clears the caller’s day and answers { date, deleted }', async () => {
        const conn = getConn();
        const userId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await put(userId, '2026-10-30', { moments: [moment(), moment({ startMinutes: 700 })] });
        await put(otherId, '2026-10-30', { moments: [moment()] });

        const response = await request(app).delete('/api/lived/days/2026-10-30').set(as(userId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ date: '2026-10-30', deleted: 2 });
        const mine = await list(userId, { from: '2026-10-30', to: '2026-10-30' });
        const theirs = await list(otherId, { from: '2026-10-30', to: '2026-10-30' });
        expect(mine.body.data.moments).toEqual([]);
        expect(theirs.body.data.moments).toHaveLength(1);
    });

    test('a bad date is 400', async () => {
        const userId = await createTestUser(getConn());

        const response = await request(app).delete('/api/lived/days/2026-02-30').set(as(userId));

        expect(response.status).toBe(400);
    });
});

describe('authentication', () => {
    test.each([
        ['put', '/api/lived/days/2026-10-30'],
        ['get', '/api/lived?from=2026-10-30&to=2026-10-30'],
        ['delete', '/api/lived/days/2026-10-30'],
    ])('%s answers 401 without a token', async (method, url) => {
        const response = await request(app)[method](url);

        expect(response.status).toBe(401);
    });
});
