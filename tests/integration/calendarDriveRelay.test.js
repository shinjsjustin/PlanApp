'use strict';

jest.mock('../../src/lib/google/routesApi');

const request = require('supertest');

const app = require('../../src/server');
const { computeDrive } = require('../../src/lib/google/routesApi');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const TEN_MINUTE_DRIVE = { durationSeconds: 600, distanceMeters: 5000 };

const setup = async () => {
    const conn = getConn();
    const { ownerId, project } = await createFixture(conn);
    const home = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Home St', kind: 'home' });
    const shop = await placesRepo.create(conn, { ownerId, name: 'Shop', address: '2 Shop Rd', kind: 'work' });
    const cafe = await placesRepo.create(conn, { ownerId, name: 'Cafe', address: '3 Cafe Ln' });
    const day = await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-20' });

    const todoAt = async (place, text) => {
        const todo = await todosRepo.create(conn, { projectId: project.id, text });
        await todosRepo.update(conn, todo.id, { placeId: place.id });
        return todo;
    };

    const put = (placements) =>
        request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ placements: placements.map(([todo, startMinutes, durationMinutes]) => ({
                todoId: todo.id,
                dayId: day.id,
                startMinutes,
                durationMinutes,
            })) });

    const startsOf = (response) =>
        Object.fromEntries(response.body.data.items.map((item) => [item.text, item.startMinutes]));

    const stored = async () => {
        const [rows] = await conn.execute('SELECT id FROM calendar_items WHERE day_id = ?', [day.id]);
        return rows;
    };

    return { shop, cafe, todoAt, put, startsOf, stored, home };
};

beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    computeDrive.mockReset();
    computeDrive.mockResolvedValue(TEN_MINUTE_DRIVE);
});

afterAll(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
});

describe('PUT /api/calendar/items drive re-lay', () => {
    test('pushes the second of two touching bookings at different places down by the drive', async () => {
        const { shop, cafe, todoAt, put, startsOf } = await setup();
        const first = await todoAt(shop, 'First');
        const second = await todoAt(cafe, 'Second');

        const response = await put([[first, 600, 60], [second, 660, 30]]);

        expect(response.status).toBe(200);
        expect(startsOf(response)).toEqual({ First: 600, Second: 670 });
    });

    test('leaves a first booking at a work place where it is', async () => {
        const { shop, todoAt, put, startsOf } = await setup();
        const first = await todoAt(shop, 'First');

        const response = await put([[first, 480, 60]]);

        expect(startsOf(response)).toEqual({ First: 480 });
    });

    test('starts a first booking elsewhere at 08:00 plus the drive from home', async () => {
        const { cafe, todoAt, put, startsOf } = await setup();
        const first = await todoAt(cafe, 'First');

        const response = await put([[first, 480, 60]]);

        expect(startsOf(response)).toEqual({ First: 490 });
    });

    test('counts the drive as 15 minutes with no Google key and no cached time', async () => {
        delete process.env.GOOGLE_MAPS_API_KEY;
        const { cafe, todoAt, put, startsOf } = await setup();
        const first = await todoAt(cafe, 'First');

        const response = await put([[first, 480, 60]]);

        expect(startsOf(response)).toEqual({ First: 495 });
        expect(computeDrive).not.toHaveBeenCalled();
    });

    test('answers 400 and stores nothing when the push ends a booking past 23:00', async () => {
        const { shop, cafe, todoAt, put, stored } = await setup();
        const first = await todoAt(shop, 'First');
        const second = await todoAt(cafe, 'Second');

        const response = await put([[first, 1260, 60], [second, 1320, 60]]);

        expect(response.status).toBe(400);
        expect(await stored()).toEqual([]);
    });
});
