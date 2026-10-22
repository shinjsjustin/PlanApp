'use strict';

const request = require('supertest');

const app = require('../../src/server');
const assertOwnership = require('../../src/middleware/assertOwnership');
const placesRepo = require('../../src/db/repositories/placesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const mkPlace = (conn, ownerId, name) => placesRepo.create(conn, { ownerId, name });
const mkSub = async (conn, ownerId, placeId, name) => {
    const [result] = await conn.execute(
        'INSERT INTO reminder_subcategories (owner_id, place_id, name) VALUES (?, ?, ?)',
        [ownerId, placeId, name]
    );
    return result.insertId;
};

describe('GET /api/reminder-subcategories', () => {
    test('lists the caller’s subcategories by name, optionally for one place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const home = await mkPlace(conn, ownerId, 'Home');
        const shop = await mkPlace(conn, ownerId, 'Shop');
        const other = await mkPlace(conn, strangerId, 'Theirs');
        const zed = await mkSub(conn, ownerId, home.id, 'Zed');
        const abe = await mkSub(conn, ownerId, shop.id, 'Abe');
        await mkSub(conn, strangerId, other.id, 'Nope');

        const all = await request(app).get('/api/reminder-subcategories').set(as(ownerId));
        const one = await request(app)
            .get(`/api/reminder-subcategories?placeId=${home.id}`)
            .set(as(ownerId));

        expect(all.status).toBe(200);
        expect(all.body.data).toEqual({
            subcategories: [
                { id: abe, placeId: shop.id, name: 'Abe' },
                { id: zed, placeId: home.id, name: 'Zed' },
            ],
        });
        expect(one.body.data).toEqual({ subcategories: [{ id: zed, placeId: home.id, name: 'Zed' }] });
    });

    test('rejects a malformed placeId with 400', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await request(app).get('/api/reminder-subcategories?placeId=abc').set(as(ownerId));

        expect(response.status).toBe(400);
    });
});

describe('POST /api/reminder-subcategories', () => {
    test('creates a trimmed subcategory and answers 201', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');

        const response = await request(app)
            .post('/api/reminder-subcategories')
            .set(as(ownerId))
            .send({ placeId: place.id, name: '  Groceries ' });

        expect(response.status).toBe(201);
        expect(response.body.data).toEqual({ id: expect.any(Number), placeId: place.id, name: 'Groceries' });
    });

    test('answers 403 for another user’s place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mkPlace(conn, strangerId, 'Theirs');

        const response = await request(app)
            .post('/api/reminder-subcategories')
            .set(as(ownerId))
            .send({ placeId: place.id, name: 'X' });

        expect(response.status).toBe(403);
    });

    test('answers 409 for a duplicate name in the same place but allows it in another', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const home = await mkPlace(conn, ownerId, 'Home');
        const shop = await mkPlace(conn, ownerId, 'Shop');
        await mkSub(conn, ownerId, home.id, 'Dup');

        const dup = await request(app)
            .post('/api/reminder-subcategories')
            .set(as(ownerId))
            .send({ placeId: home.id, name: 'Dup' });
        const elsewhere = await request(app)
            .post('/api/reminder-subcategories')
            .set(as(ownerId))
            .send({ placeId: shop.id, name: 'Dup' });

        expect(dup.status).toBe(409);
        expect(elsewhere.status).toBe(201);
    });

    test.each([
        ['empty name', { name: '   ' }],
        ['101-char name', { name: 'a'.repeat(101) }],
        ['missing name', {}],
    ])('rejects %s with 400', async (_label, body) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');

        const response = await request(app)
            .post('/api/reminder-subcategories')
            .set(as(ownerId))
            .send({ placeId: place.id, ...body });

        expect(response.status).toBe(400);
    });
});

describe('PATCH and DELETE /api/reminder-subcategories/:id', () => {
    test('renames, answering 409 on a clash', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');
        const id = await mkSub(conn, ownerId, place.id, 'Old');
        await mkSub(conn, ownerId, place.id, 'Taken');

        const ok = await request(app)
            .patch(`/api/reminder-subcategories/${id}`)
            .set(as(ownerId))
            .send({ name: 'New' });
        const clash = await request(app)
            .patch(`/api/reminder-subcategories/${id}`)
            .set(as(ownerId))
            .send({ name: 'Taken' });

        expect(ok.status).toBe(200);
        expect(ok.body.data).toEqual({ id, placeId: place.id, name: 'New' });
        expect(clash.status).toBe(409);
    });

    test('deletes, then answers 404', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');
        const id = await mkSub(conn, ownerId, place.id, 'Gone');

        const first = await request(app).delete(`/api/reminder-subcategories/${id}`).set(as(ownerId));
        const second = await request(app).delete(`/api/reminder-subcategories/${id}`).set(as(ownerId));

        expect(first.status).toBe(200);
        expect(first.body.data).toEqual({ id });
        expect(second.status).toBe(404);
    });

    test('answers 403 on both for another user’s subcategory and leaves it', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mkPlace(conn, strangerId, 'Theirs');
        const id = await mkSub(conn, strangerId, place.id, 'Theirs');

        const patch = await request(app)
            .patch(`/api/reminder-subcategories/${id}`)
            .set(as(ownerId))
            .send({ name: 'Mine' });
        const del = await request(app).delete(`/api/reminder-subcategories/${id}`).set(as(ownerId));

        expect(patch.status).toBe(403);
        expect(del.status).toBe(403);
        const [rows] = await conn.execute('SELECT name FROM reminder_subcategories WHERE id = ?', [id]);
        expect(rows).toEqual([{ name: 'Theirs' }]);
    });

    test('requires a token', async () => {
        const response = await request(app).get('/api/reminder-subcategories');

        expect(response.status).toBe(401);
    });
});

describe('assertOwnership for reminders', () => {
    test('resolves reminder and reminderSubcategory directly through owner_id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');
        const subId = await mkSub(conn, ownerId, place.id, 'S');
        const [result] = await conn.execute(
            "INSERT INTO reminders (owner_id, title, time_zone) VALUES (?, 'T', 'UTC')",
            [ownerId]
        );

        await expect(assertOwnership(conn, 'reminderSubcategory', subId, ownerId)).resolves.toMatchObject({
            id: subId,
            owner_id: ownerId,
        });
        await expect(assertOwnership(conn, 'reminder', result.insertId, ownerId)).resolves.toMatchObject({
            id: result.insertId,
            owner_id: ownerId,
        });
        await expect(assertOwnership(conn, 'reminder', result.insertId, strangerId)).rejects.toMatchObject({
            status: 403,
        });
        await expect(assertOwnership(conn, 'reminderSubcategory', subId, strangerId)).rejects.toMatchObject({
            status: 403,
        });
    });
});
