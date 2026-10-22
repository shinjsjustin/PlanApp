'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const peopleRepo = require('../../src/db/repositories/peopleRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const subcategoriesRepo = require('../../src/db/repositories/reminderSubcategoriesRepo');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const post = (userId, body, zone = 'America/Chicago') =>
    request(app).post('/api/reminders').set(as(userId)).set('X-Time-Zone', zone).send(body);
const patch = (userId, id, body) => request(app).patch(`/api/reminders/${id}`).set(as(userId)).send(body);

const mkPlace = (conn, ownerId, name) => placesRepo.create(conn, { ownerId, name });
const mkSub = (conn, ownerId, placeId, name) => subcategoriesRepo.create(conn, { ownerId, placeId, name });
const mkProjectTodo = async (conn, ownerId) => {
    const { id: projectId } = await projectsRepo.create(conn, { ownerId, title: 'Reno' });
    const { id: todoId } = await todosRepo.create(conn, { projectId, text: 'Tile' });
    return { projectId, todoId };
};

describe('POST /api/reminders', () => {
    test('stores every field, stamps the X-Time-Zone and answers 201 with the wire shape', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');
        const sub = await mkSub(conn, ownerId, place.id, 'Kitchen');
        const person = await peopleRepo.create(conn, { ownerId, name: 'Ann' });
        const { projectId, todoId } = await mkProjectTodo(conn, ownerId);

        const response = await post(ownerId, {
            title: ' Buy tile ',
            placeId: place.id,
            subcategoryId: sub.id,
            personId: person.id,
            projectId,
            todoId,
            dueDate: '2026-10-05',
            dueTime: '09:05',
            alertAt: '2026-10-05T08:00:00-05:00',
            trigger: 'arrive',
            priority: 'high',
            repeat: { rule: 'weekly', every: null, weekdays: ['mon', 'wed'] },
        });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            title: 'Buy tile',
            place: { id: place.id, label: 'Home' },
            subcategory: { id: sub.id, label: 'Kitchen' },
            person: { id: person.id, label: 'Ann' },
            project: { id: projectId, label: 'Reno' },
            todo: { id: todoId, label: 'Tile' },
            dueDate: '2026-10-05',
            dueTime: '09:05',
            timeZone: 'America/Chicago',
            alertAt: '2026-10-05T13:00:00.000Z',
            trigger: 'arrive',
            priority: 'high',
            status: 'open',
            repeat: { rule: 'weekly', every: null, weekdays: ['mon', 'wed'] },
        });
    });

    test('applies defaults when only a title is sent', async () => {
        const ownerId = await createTestUser(getConn());

        const response = await post(ownerId, { title: 'Call' }, 'UTC');

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            place: null, subcategory: null, dueDate: null, dueTime: null, alertAt: null,
            trigger: 'none', priority: 'normal', timeZone: 'UTC',
            repeat: { rule: 'none', every: null, weekdays: [] },
        });
    });

    test.each([
        ['a missing title', {}],
        ['an empty title', { title: '  ' }],
        ['a title over 500 characters', { title: 'x'.repeat(501) }],
        ['a bad date', { title: 'a', dueDate: '2026-02-30' }],
        ['a bad time', { title: 'a', dueDate: '2026-10-05', dueTime: '25:00' }],
        ['an alert without an offset', { title: 'a', alertAt: '2026-10-05T08:00:00' }],
        ['an unknown trigger', { title: 'a', trigger: 'near' }],
        ['an unknown priority', { title: 'a', priority: 'low' }],
        ['dueTime without dueDate', { title: 'a', dueTime: '09:00' }],
        ['a repeat without dueDate', { title: 'a', repeat: { rule: 'daily' } }],
        ['weekly without weekdays', { title: 'a', dueDate: '2026-10-05', repeat: { rule: 'weekly', weekdays: [] } }],
        ['every_n_days without every', { title: 'a', dueDate: '2026-10-05', repeat: { rule: 'every_n_days' } }],
        ['every_n_days with every 0', { title: 'a', dueDate: '2026-10-05', repeat: { rule: 'every_n_days', every: 0 } }],
        ['every_n_days with every 366', { title: 'a', dueDate: '2026-10-05', repeat: { rule: 'every_n_days', every: 366 } }],
    ])('rejects %s with 400', async (_name, body) => {
        const ownerId = await createTestUser(getConn());

        const response = await post(ownerId, body);

        expect(response.status).toBe(400);
    });

    test.each([
        [1, 'every_n_days with every 1', 1],
        [365, 'every_n_days with every 365', 365],
    ])('accepts %s', async (every) => {
        const ownerId = await createTestUser(getConn());

        const response = await post(ownerId, {
            title: 'a', dueDate: '2026-10-05', repeat: { rule: 'every_n_days', every },
        });

        expect(response.status).toBe(201);
        expect(response.body.data.repeat.every).toBe(every);
    });

    test('rejects a subcategory that belongs to another of the caller’s places, or with no place, with 400', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const home = await mkPlace(conn, ownerId, 'Home');
        const shop = await mkPlace(conn, ownerId, 'Shop');
        const sub = await mkSub(conn, ownerId, shop.id, 'Aisle');

        const wrongPlace = await post(ownerId, { title: 'a', placeId: home.id, subcategoryId: sub.id });
        const noPlace = await post(ownerId, { title: 'a', subcategoryId: sub.id });
        const fits = await post(ownerId, { title: 'a', placeId: shop.id, subcategoryId: sub.id });

        expect(wrongPlace.status).toBe(400);
        expect(noPlace.status).toBe(400);
        expect(fits.status).toBe(201);
    });

    test('answers 403 for another user’s place, person, project, to-do or subcategory', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mkPlace(conn, strangerId, 'Theirs');
        const sub = await mkSub(conn, strangerId, place.id, 'Sub');
        const person = await peopleRepo.create(conn, { ownerId: strangerId, name: 'Bo' });
        const { projectId, todoId } = await mkProjectTodo(conn, strangerId);

        const bodies = [
            { placeId: place.id },
            { personId: person.id },
            { projectId },
            { todoId },
            { subcategoryId: sub.id },
        ];

        for (const body of bodies) {
            const response = await post(ownerId, { title: 'a', ...body });
            expect(response.status).toBe(403);
        }
    });
});

describe('GET /api/reminders/:id', () => {
    test('returns the owner’s reminder, 403 for a stranger, 404 for a missing one', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const row = await remindersRepo.create(conn, { ownerId, title: 'Call', timeZone: 'UTC' });

        const mine = await request(app).get(`/api/reminders/${row.id}`).set(as(ownerId));
        const theirs = await request(app).get(`/api/reminders/${row.id}`).set(as(strangerId));
        const missing = await request(app).get('/api/reminders/999999999').set(as(ownerId));

        expect(mine.status).toBe(200);
        expect(mine.body.data).toMatchObject({ id: row.id, title: 'Call' });
        expect(theirs.status).toBe(403);
        expect(missing.status).toBe(404);
    });
});

describe('PATCH /api/reminders/:id', () => {
    test('changes only the fields sent and leaves the time zone alone', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const row = await remindersRepo.create(conn, {
            ownerId, title: 'Call', priority: 'high', dueDate: '2026-10-05', timeZone: 'Asia/Tokyo',
        });

        const response = await patch(ownerId, row.id, { title: 'Ring', alertAt: '2026-10-05T00:00:00Z', dueTime: '10:30' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            title: 'Ring', priority: 'high', dueDate: '2026-10-05', dueTime: '10:30',
            alertAt: '2026-10-05T00:00:00.000Z', timeZone: 'Asia/Tokyo',
        });
    });

    test('replaces the repeat and can clear a nullable field', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const row = await remindersRepo.create(conn, {
            ownerId, title: 'Call', dueDate: '2026-10-05', dueTime: '09:00', timeZone: 'UTC',
        });

        const set = await patch(ownerId, row.id, { repeat: { rule: 'weekly', weekdays: ['fri'] } });
        const cleared = await patch(ownerId, row.id, { dueTime: null });

        expect(set.body.data.repeat).toEqual({ rule: 'weekly', every: null, weekdays: ['fri'] });
        expect(cleared.body.data.dueTime).toBeNull();
    });

    test('checks the rules against the stored reminder, not just the body', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const timed = await remindersRepo.create(conn, {
            ownerId, title: 'a', dueDate: '2026-10-05', dueTime: '09:00', timeZone: 'UTC',
        });
        const repeating = await remindersRepo.create(conn, {
            ownerId, title: 'b', dueDate: '2026-10-05', repeatRule: 'daily', timeZone: 'UTC',
        });
        const plain = await remindersRepo.create(conn, { ownerId, title: 'c', timeZone: 'UTC' });

        const dropDateOfTimed = await patch(ownerId, timed.id, { dueDate: null });
        const dropDateOfRepeating = await patch(ownerId, repeating.id, { dueDate: null });
        const timeOnPlain = await patch(ownerId, plain.id, { dueTime: '09:00' });
        const emptyBody = await patch(ownerId, plain.id, {});

        expect(dropDateOfTimed.status).toBe(400);
        expect(dropDateOfRepeating.status).toBe(400);
        expect(timeOnPlain.status).toBe(400);
        expect(emptyBody.status).toBe(400);
    });

    test('clears a subcategory that no longer fits when only the place changes, keeps one that does', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const home = await mkPlace(conn, ownerId, 'Home');
        const shop = await mkPlace(conn, ownerId, 'Shop');
        const sub = await mkSub(conn, ownerId, home.id, 'Kitchen');
        const moved = await remindersRepo.create(conn, {
            ownerId, title: 'a', placeId: home.id, subcategoryId: sub.id, timeZone: 'UTC',
        });
        const kept = await remindersRepo.create(conn, {
            ownerId, title: 'b', placeId: home.id, subcategoryId: sub.id, timeZone: 'UTC',
        });
        const unplaced = await remindersRepo.create(conn, {
            ownerId, title: 'c', placeId: home.id, subcategoryId: sub.id, timeZone: 'UTC',
        });

        const toShop = await patch(ownerId, moved.id, { placeId: shop.id });
        const sameHome = await patch(ownerId, kept.id, { placeId: home.id });
        const noPlace = await patch(ownerId, unplaced.id, { placeId: null });

        expect(toShop.body.data).toMatchObject({ place: { id: shop.id }, subcategory: null });
        expect(sameHome.body.data).toMatchObject({ place: { id: home.id }, subcategory: { id: sub.id } });
        expect(noPlace.body.data).toMatchObject({ place: null, subcategory: null });
    });

    test('rejects a new subcategory that does not fit the place with 400', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const home = await mkPlace(conn, ownerId, 'Home');
        const shop = await mkPlace(conn, ownerId, 'Shop');
        const sub = await mkSub(conn, ownerId, shop.id, 'Aisle');
        const row = await remindersRepo.create(conn, { ownerId, title: 'a', placeId: home.id, timeZone: 'UTC' });

        const bad = await patch(ownerId, row.id, { subcategoryId: sub.id });
        const good = await patch(ownerId, row.id, { placeId: shop.id, subcategoryId: sub.id });

        expect(bad.status).toBe(400);
        expect(good.status).toBe(200);
        expect(good.body.data.subcategory).toMatchObject({ id: sub.id });
    });

    test('answers 403 for a stranger’s reminder and for linking a stranger’s place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const row = await remindersRepo.create(conn, { ownerId, title: 'a', timeZone: 'UTC' });
        const theirPlace = await mkPlace(conn, strangerId, 'Theirs');

        const notMine = await patch(strangerId, row.id, { title: 'x' });
        const theirLink = await patch(ownerId, row.id, { placeId: theirPlace.id });

        expect(notMine.status).toBe(403);
        expect(theirLink.status).toBe(403);
    });
});

describe('DELETE /api/reminders/:id', () => {
    test('deletes the owner’s reminder, 403 for a stranger, 404 once gone', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const row = await remindersRepo.create(conn, { ownerId, title: 'a', timeZone: 'UTC' });

        const theirs = await request(app).delete(`/api/reminders/${row.id}`).set(as(strangerId));
        const mine = await request(app).delete(`/api/reminders/${row.id}`).set(as(ownerId));
        const again = await request(app).delete(`/api/reminders/${row.id}`).set(as(ownerId));

        expect(theirs.status).toBe(403);
        expect(mine.status).toBe(200);
        expect(mine.body.data).toEqual({ id: row.id });
        expect(await remindersRepo.findById(conn, row.id)).toBeNull();
        expect(again.status).toBe(404);
    });
});
