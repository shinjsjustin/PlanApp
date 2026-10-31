'use strict';

const request = require('supertest');

const app = require('../../src/server');
const choresRepo = require('../../src/db/repositories/choresRepo');
const starterChores = require('../../src/lib/starterChores');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });

describe('POST /api/chores/seed', () => {
    test('creates every starter chore for a user with none, then none the second time', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const first = await request(app).post('/api/chores/seed').set(as(ownerId));
        const second = await request(app).post('/api/chores/seed').set(as(ownerId));

        expect(first.status).toBe(200);
        expect(first.body.data.created.map((c) => c.name)).toEqual(starterChores.map((c) => c.name));
        expect(first.body.data.skipped).toEqual([]);
        expect(first.body.data.created[0]).toMatchObject({
            area: 'Bathroom',
            window: { min: 7, max: 10 },
        });
        expect(second.status).toBe(200);
        expect(second.body.data.created).toEqual([]);
        expect(second.body.data.skipped).toEqual(starterChores.map((c) => c.name));
        expect(await choresRepo.listNamesByOwner(conn, ownerId)).toHaveLength(starterChores.length);
    });

    test('skips names already used, trimmed and case-insensitive, archived included', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await choresRepo.create(conn, { ownerId, name: 'clean BATHROOMS', windowMin: 1, windowMax: 1 });
        const archived = await choresRepo.create(conn, { ownerId, name: 'Vacuum floors', windowMin: 1, windowMax: 1 });
        await choresRepo.setArchived(conn, archived.id, true);
        await choresRepo.create(conn, { ownerId: otherId, name: 'Mop floors', windowMin: 1, windowMax: 1 });

        const response = await request(app).post('/api/chores/seed').set(as(ownerId));

        const { created, skipped } = response.body.data;
        expect(skipped).toEqual(['Clean bathrooms', 'Vacuum floors']);
        expect(created.map((c) => c.name)).toEqual(
            starterChores.map((c) => c.name).filter((n) => !skipped.includes(n))
        );
    });
});
