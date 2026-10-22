'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const subcategoriesRepo = require('../../src/db/repositories/reminderSubcategoriesRepo');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const list = (userId, query = '') =>
    request(app).get(`/api/reminders${query}`).set({ Authorization: authHeaderFor(userId) });
const ids = (response) => response.body.data.reminders.map((r) => r.id);

// Seeds two places (Bank, Cafe), two subcategories under Bank, and mixed due dates and statuses.
const seed = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const bank = await placesRepo.create(conn, { ownerId, name: 'Bank' });
    const cafe = await placesRepo.create(conn, { ownerId, name: 'Cafe' });
    const atm = await subcategoriesRepo.create(conn, { ownerId, placeId: bank.id, name: 'ATM' });
    const teller = await subcategoriesRepo.create(conn, { ownerId, placeId: bank.id, name: 'Teller' });
    const mk = async (fields) => {
        const row = await remindersRepo.create(conn, { ownerId, timeZone: 'UTC', title: 'r', ...fields });
        return row.id;
    };
    const r = {};
    r.cafeLate = await mk({ placeId: cafe.id, dueDate: '2026-11-03' });
    r.bankTeller = await mk({ placeId: bank.id, subcategoryId: teller.id, dueDate: '2026-11-02' });
    r.bankNoSub = await mk({ placeId: bank.id, dueDate: '2026-11-01' });
    r.bankAtmTimed = await mk({ placeId: bank.id, subcategoryId: atm.id, dueDate: '2026-11-05', dueTime: '09:00' });
    r.bankAtmDateOnly = await mk({ placeId: bank.id, subcategoryId: atm.id, dueDate: '2026-11-05' });
    r.noPlaceDated = await mk({ dueDate: '2026-11-04' });
    r.noPlaceUndated = await mk({});
    r.sameDayEarly = await mk({ dueDate: '2026-11-04', dueTime: '08:00' });
    r.done = await mk({ placeId: bank.id, dueDate: '2026-10-01' });
    r.dismissed = await mk({ dueDate: '2026-10-02' });
    await remindersRepo.update(conn, r.done, { status: 'done' });
    await remindersRepo.update(conn, r.dismissed, { status: 'dismissed' });
    return { ownerId, bank, cafe, r };
};

describe('GET /api/reminders', () => {
    test('lists only open reminders of the caller, ordered by due by default', async () => {
        const { ownerId, r } = await seed();
        const other = await createTestUser(getConn());
        await remindersRepo.create(getConn(), { ownerId: other, timeZone: 'UTC', title: 'theirs' });

        const response = await list(ownerId);

        expect(response.status).toBe(200);
        expect(ids(response)).toEqual([
            r.bankNoSub, r.bankTeller, r.cafeLate, r.noPlaceDated, r.sameDayEarly,
            r.bankAtmDateOnly, r.bankAtmTimed, r.noPlaceUndated,
        ]);
    });

    test('filters by placeId and by none', async () => {
        const { ownerId, bank, r } = await seed();

        expect(ids(await list(ownerId, `?placeId=${bank.id}`))).toEqual([
            r.bankNoSub, r.bankTeller, r.bankAtmDateOnly, r.bankAtmTimed,
        ]);
        expect(ids(await list(ownerId, '?placeId=none'))).toEqual([r.noPlaceDated, r.sameDayEarly, r.noPlaceUndated]);
    });

    test('filters by status', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?status=history&sort=created'))).toEqual([r.dismissed, r.done]);
        expect((await list(ownerId, '?status=all')).body.data.reminders).toHaveLength(10);
    });

    test('sort=place orders by place name, no place last, then due', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?sort=place'))).toEqual([
            r.bankNoSub, r.bankTeller, r.bankAtmDateOnly, r.bankAtmTimed, r.cafeLate,
            r.noPlaceDated, r.sameDayEarly, r.noPlaceUndated,
        ]);
    });

    test('sort=subcategory orders by place, subcategory with none last, then due', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?sort=subcategory'))).toEqual([
            r.bankAtmDateOnly, r.bankAtmTimed, r.bankTeller, r.bankNoSub, r.cafeLate,
            r.noPlaceDated, r.sameDayEarly, r.noPlaceUndated,
        ]);
    });

    test('sort=created is newest first with ties broken by id', async () => {
        const { ownerId, r } = await seed();

        expect(ids(await list(ownerId, '?sort=created'))).toEqual([
            r.sameDayEarly, r.noPlaceUndated, r.noPlaceDated, r.bankAtmDateOnly,
            r.bankAtmTimed, r.bankNoSub, r.bankTeller, r.cafeLate,
        ]);
    });

    test.each(['?placeId=0', '?placeId=abc', '?placeId=1.5', '?status=bogus', '?sort=bogus'])(
        'answers 400 for %s',
        async (query) => {
            const ownerId = await createTestUser(getConn());

            expect((await list(ownerId, query)).status).toBe(400);
        }
    );
});
