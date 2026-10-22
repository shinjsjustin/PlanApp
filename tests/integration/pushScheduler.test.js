'use strict';

jest.mock('../../src/lib/push/webPush');
jest.mock('../../src/lib/push/sendPush', () => {
    const actual = jest.requireActual('../../src/lib/push/sendPush');
    return { ...actual, sendToOwner: jest.fn(actual.sendToOwner) };
});

const webPush = require('../../src/lib/push/webPush');
const sendPush = require('../../src/lib/push/sendPush');
const remindersRepo = require('../../src/db/repositories/remindersRepo');
const subsRepo = require('../../src/db/repositories/pushSubscriptionsRepo');
const sendsRepo = require('../../src/db/repositories/pushSendsRepo');
const { runOnce, startScheduler } = require('../../src/lib/push/scheduler');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const VAPID = { VAPID_SUBJECT: 'mailto:test@example.com', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };
const savedEnv = { ...process.env };
const NOW = new Date('2026-06-15T18:00:00Z');
const HOUR = 60 * 60 * 1000;
const ago = (ms) => new Date(NOW.getTime() - ms);

beforeEach(() => {
    Object.assign(process.env, VAPID);
    webPush.sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
});
afterAll(() => {
    process.env = savedEnv;
});

// created_at is backdated so the fixed NOW is after creation.
const setup = async (fields) => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    await subsRepo.save(conn, { ownerId, endpoint: `https://push.example.com/${ownerId}`, p256dh: 'p', auth: 'a' });
    const reminder = await remindersRepo.create(conn, { ownerId, title: 'Call mom', timeZone: 'UTC', ...fields });
    await conn.execute("UPDATE reminders SET created_at = '2020-01-01 00:00:00' WHERE id = ?", [reminder.id]);

    return { conn, ownerId, reminder };
};

describe('runOnce', () => {
    test('pushes a due alert to the owner and claims it', async () => {
        const { reminder } = await setup({ alertAt: ago(HOUR) });

        const result = await runOnce({ now: NOW });

        expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
        expect(webPush.sendNotification.mock.calls[0][1]).toEqual({
            title: 'Call mom',
            body: 'Reminder due',
            url: `/reminders?open=${reminder.id}`,
        });
        const [rows] = await getConn().execute('SELECT kind FROM push_sends WHERE reminder_id = ?', [reminder.id]);
        expect(rows).toEqual([{ kind: 'time' }]);
    });

    test('sends once when run twice with the same now', async () => {
        await setup({ alertAt: ago(HOUR) });

        await runOnce({ now: NOW });
        const second = await runOnce({ now: NOW });

        expect(second).toEqual({ claimed: 0, sent: 0, failed: 0 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('pushes again when the alert time changes', async () => {
        const { conn, reminder } = await setup({ alertAt: ago(2 * HOUR) });
        await runOnce({ now: NOW });

        await remindersRepo.update(conn, reminder.id, { alertAt: ago(HOUR) });
        await runOnce({ now: NOW });

        expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    });

    test('pushes a new repeat row', async () => {
        const { conn, ownerId, reminder } = await setup({ alertAt: ago(HOUR) });
        await runOnce({ now: NOW });

        const next = await remindersRepo.create(conn, {
            ownerId, title: 'Call mom', timeZone: 'UTC', alertAt: ago(HOUR), repeatedFromId: reminder.id,
        });
        await conn.execute("UPDATE reminders SET created_at = '2020-01-01 00:00:00' WHERE id = ?", [next.id]);
        await runOnce({ now: NOW });

        expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    });

    test.each(['done', 'dismissed'])('sends nothing for a %s reminder', async (status) => {
        const { conn, reminder } = await setup({ alertAt: ago(HOUR) });
        await remindersRepo.update(conn, reminder.id, { status });

        const result = await runOnce({ now: NOW });

        expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    test('sends nothing while the reminder is still snoozed', async () => {
        const { conn, reminder } = await setup({ alertAt: ago(2 * HOUR) });
        await remindersRepo.update(conn, reminder.id, { snoozedUntil: new Date(NOW.getTime() + HOUR) });

        await runOnce({ now: NOW });

        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    test('pushes when a snooze has ended', async () => {
        const { conn, reminder } = await setup({ alertAt: ago(3 * HOUR) });
        await remindersRepo.update(conn, reminder.id, { snoozedUntil: ago(HOUR) });

        await runOnce({ now: NOW });

        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
        expect(webPush.sendNotification.mock.calls[0][1].body).toBe('Snooze ended');
    });

    test('sends a push missed 23 hours ago but not one from 25 hours ago', async () => {
        await setup({ alertAt: ago(23 * HOUR) });
        await setup({ alertAt: ago(25 * HOUR) });

        const result = await runOnce({ now: NOW });

        expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    });

    test('uses the due date and time in the reminder zone', async () => {
        await setup({ dueDate: '2026-06-15', dueTime: '10:00:00', timeZone: 'America/Los_Angeles' });

        const result = await runOnce({ now: NOW });

        expect(result.sent).toBe(1);
    });

    test('does not count a claim as sent when the owner has no devices', async () => {
        const { conn, ownerId } = await setup({ alertAt: ago(HOUR) });
        await conn.execute('DELETE FROM push_subscriptions WHERE owner_id = ?', [ownerId]);

        const result = await runOnce({ now: NOW });

        expect(result).toEqual({ claimed: 1, sent: 0, failed: 0 });
    });

    describe('when a send throws', () => {
        let error;
        beforeEach(() => {
            error = jest.spyOn(console, 'error').mockImplementation(() => {});
        });
        afterEach(() => error.mockRestore());

        test('logs it, sends the later push, counts it failed, and never retries it', async () => {
            const a = await setup({ alertAt: ago(HOUR) });
            const b = await setup({ alertAt: ago(HOUR) });
            sendPush.sendToOwner.mockRejectedValueOnce(new Error('boom'));

            const result = await runOnce({ now: NOW });

            expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
            expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
            expect(error).toHaveBeenCalledTimes(1);
            expect(error.mock.calls[0].some((arg) => String(arg).includes('boom'))).toBe(true);
            const logged = error.mock.calls[0].join(' ');
            expect([a.reminder.id, b.reminder.id].some((id) => logged.includes(`reminder ${id}`))).toBe(true);

            const second = await runOnce({ now: NOW });
            expect(second).toEqual({ claimed: 0, sent: 0, failed: 0 });
            expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
        });
    });
});

describe('pushSendsRepo.claim', () => {
    test('returns true the first time and false for the same send again', async () => {
        const { conn, reminder } = await setup({ alertAt: ago(HOUR) });
        const send = { reminderId: reminder.id, kind: 'time', dueAt: ago(HOUR) };

        expect(await sendsRepo.claim(conn, send)).toBe(true);
        expect(await sendsRepo.claim(conn, send)).toBe(false);
        expect(await sendsRepo.claim(conn, { ...send, kind: 'snooze' })).toBe(true);
    });
});

describe('startScheduler', () => {
    afterEach(() => jest.useRealTimers());

    test('runs every interval, logs errors, and stops', async () => {
        jest.useFakeTimers();
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const listSpy = jest.spyOn(sendsRepo, 'listCandidates').mockRejectedValue(new Error('db down'));

        const stop = startScheduler({ intervalMs: 1000 });
        await jest.advanceTimersByTimeAsync(2000);

        expect(listSpy).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledTimes(2);

        stop();
        await jest.advanceTimersByTimeAsync(2000);
        expect(listSpy).toHaveBeenCalledTimes(2);
        jest.restoreAllMocks();
    });
});
