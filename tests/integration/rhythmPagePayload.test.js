'use strict';

const request = require('supertest');

const app = require('../../src/server');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const as = (userId) => ({ Authorization: authHeaderFor(userId) });
const seed = (userId) =>
    request(app)
        .put('/api/rhythm/anchors/wake')
        .set(as(userId))
        .send({ title: 'Wake', description: null, time: '06:30', days: 'daily', enabled: true });
const patch = (userId, body) => request(app).patch('/api/rhythm/anchors/wake').set(as(userId)).send(body);

// The exact bodies the page sends through useRhythm.saveAnchor.
describe('PATCH /api/rhythm/anchors/:id with the page payloads', () => {
    test('saves time, days list and enabled together as justin', async () => {
        const userId = await createTestUser(getConn());
        await seed(userId);

        const response = await patch(userId, { time: '07:30', days: ['mon', 'wed'], enabled: false });

        expect(response.status).toBe(200);
        expect(response.body.data.anchor).toMatchObject({
            id: 'wake',
            time: '07:30',
            days: ['mon', 'wed'],
            enabled: false,
            updatedBy: 'justin',
        });
    });

    test('saves days "daily" alone, leaving time and enabled', async () => {
        const userId = await createTestUser(getConn());
        await seed(userId);
        await patch(userId, { days: ['mon'] });

        const response = await patch(userId, { days: 'daily' });

        expect(response.status).toBe(200);
        expect(response.body.data.anchor).toMatchObject({
            time: '06:30',
            days: 'daily',
            enabled: true,
            updatedBy: 'justin',
        });
    });
});
