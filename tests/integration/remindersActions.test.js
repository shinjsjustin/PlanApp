'use strict';

const request = require('supertest');

const app = require('../../src/server');
const placesRepo = require('../../src/db/repositories/placesRepo');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const act = (userId, id, action, body) =>
    request(app).post(`/api/reminders/${id}/${action}`).set({ Authorization: authHeaderFor(userId) }).send(body);

const mk = (ownerId, fields = {}) =>
    remindersRepo.create(getConn(), { ownerId, title: 'Call', timeZone: 'America/Chicago', ...fields });

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);
const anHourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

describe.each(['done', 'dismiss'])('POST /api/reminders/:id/%s', (action) => {
    const status = action === 'done' ? 'done' : 'dismissed';

    test('closes an open reminder, stamps closedAt, clears snoozedUntil and answers next null', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);
        await remindersRepo.update(getConn(), id, { snoozedUntil: inAnHour() });

        const response = await act(ownerId, id, action);

        expect(response.status).toBe(200);
        expect(response.body.data.reminder).toMatchObject({ id, status, snoozedUntil: null });
        expect(Date.now() - Date.parse(response.body.data.reminder.closedAt)).toBeLessThan(60 * 1000);
        expect(response.body.data.next).toBeNull();
    });

    test('answers 409 when the reminder is not open', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);
        await remindersRepo.update(getConn(), id, { status: 'dismissed' });

        expect((await act(ownerId, id, action)).status).toBe(409);
    });

    test("answers 403 for another user's reminder", async () => {
        const ownerId = await createTestUser(getConn());
        const otherId = await createTestUser(getConn());
        const { id } = await mk(ownerId);

        expect((await act(otherId, id, action)).status).toBe(403);
    });
});

describe('POST /api/reminders/:id/done on a repeating reminder', () => {
    test('creates the next open reminder with the shifted date and alert and the copied fields', async () => {
        const ownerId = await createTestUser(getConn());
        const place = await placesRepo.create(getConn(), { ownerId, name: 'Home' });
        const { id } = await mk(ownerId, {
            title: 'Water plants',
            placeId: place.id,
            dueDate: '2026-10-05',
            dueTime: '09:05',
            alertAt: new Date('2026-10-05T13:00:00Z'),
            trigger: 'arrive',
            priority: 'high',
            repeatRule: 'every_n_days',
            repeatEvery: 3,
        });

        const response = await act(ownerId, id, 'done');

        expect(response.status).toBe(200);
        expect(response.body.data.reminder.status).toBe('done');
        const { next } = response.body.data;
        expect(next).toMatchObject({
            title: 'Water plants',
            place: { id: place.id, label: 'Home' },
            dueDate: '2026-10-08',
            dueTime: '09:05',
            timeZone: 'America/Chicago',
            alertAt: '2026-10-08T13:00:00.000Z',
            trigger: 'arrive',
            priority: 'high',
            status: 'open',
            closedAt: null,
            repeat: { rule: 'every_n_days', every: 3, weekdays: [] },
        });
        expect(next.id).not.toBe(id);
        const [[link]] = await getConn().execute('SELECT repeated_from_id FROM reminders WHERE id = ?', [next.id]);
        expect(link.repeated_from_id).toBe(id);
    });

    test('dismiss on a repeating reminder creates no next one', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId, { dueDate: '2026-10-05', repeatRule: 'daily' });

        const response = await act(ownerId, id, 'dismiss');

        expect(response.body.data.next).toBeNull();
    });

    test('creates nothing when the weekly rule has no later weekday', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId, { dueDate: '2026-10-05', repeatRule: 'weekly', repeatWeekdays: [] });

        const response = await act(ownerId, id, 'done');

        expect(response.status).toBe(200);
        expect(response.body.data.next).toBeNull();
    });
});

describe('POST /api/reminders/:id/snooze', () => {
    test('sets snoozedUntil to the instant', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);

        const response = await act(ownerId, id, 'snooze', { until: '2099-01-01T08:00:00-06:00' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id, status: 'open', snoozedUntil: '2099-01-01T14:00:00.000Z' });
    });

    test.each([
        ['a past instant', () => ({ until: anHourAgo().toISOString() })],
        ['a missing until', () => ({})],
        ['an instant without an offset', () => ({ until: '2099-01-01T08:00:00' })],
    ])('rejects %s with 400', async (_name, body) => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);

        expect((await act(ownerId, id, 'snooze', body())).status).toBe(400);
    });

    test('answers 409 for a closed reminder', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);
        await remindersRepo.update(getConn(), id, { status: 'done' });

        const response = await act(ownerId, id, 'snooze', { until: inAnHour().toISOString() });

        expect(response.status).toBe(409);
    });

    test("answers 403 for another user's reminder", async () => {
        const ownerId = await createTestUser(getConn());
        const otherId = await createTestUser(getConn());
        const { id } = await mk(ownerId);

        const response = await act(otherId, id, 'snooze', { until: inAnHour().toISOString() });

        expect(response.status).toBe(403);
    });
});

describe('POST /api/reminders/:id/reopen', () => {
    test.each(['done', 'dismissed'])('returns a %s reminder to open with closedAt null', async (from) => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);
        await act(ownerId, id, from === 'done' ? 'done' : 'dismiss');

        const response = await act(ownerId, id, 'reopen');

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id, status: 'open', closedAt: null });
    });

    test('answers 409 for an open reminder', async () => {
        const ownerId = await createTestUser(getConn());
        const { id } = await mk(ownerId);

        expect((await act(ownerId, id, 'reopen')).status).toBe(409);
    });

    test("answers 403 for another user's reminder", async () => {
        const ownerId = await createTestUser(getConn());
        const otherId = await createTestUser(getConn());
        const { id } = await mk(ownerId);
        await remindersRepo.update(getConn(), id, { status: 'done' });

        expect((await act(otherId, id, 'reopen')).status).toBe(403);
    });
});
