'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

const TODAY = '2026-10-15';

/**
 * The property asserted throughout: `position` stays dense — 0..n-1, no gaps, no
 * duplicates — through appends and deletes alike, scoped to one owner. A second
 * user's days must never appear in the first user's ordering.
 */

/** The owner's days as `[id, position]` pairs, left to right. */
const dayOrder = async (conn, ownerId) => {
    const days = await calendarDaysRepo.listByOwner(conn, ownerId);

    return days.map((day) => [day.id, day.position]);
};

describe('calendarDaysRepo.create', () => {
    test('appends the first day at position 0', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const day = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });

        // Assert
        expect(day.position).toBe(0);
        expect(day.owner_id).toBe(ownerId);
        expect(day.created_at).toBeInstanceOf(Date);
    });

    test('appends each further day at the end', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const first = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });
        const second = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });
        const third = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });

        // Assert
        expect(await dayOrder(conn, ownerId)).toEqual([
            [first.id, 0],
            [second.id, 1],
            [third.id, 2],
        ]);
    });

    test('counts positions per owner, not globally', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createTestUser(conn);
        await calendarDaysRepo.create(conn, { ownerId: theirs, today: TODAY });
        await calendarDaysRepo.create(conn, { ownerId: theirs, today: TODAY });

        // Act
        const day = await calendarDaysRepo.create(conn, { ownerId: mine, today: TODAY });

        // Assert
        expect(day.position).toBe(0);
        expect(await dayOrder(conn, mine)).toEqual([[day.id, 0]]);
    });
});

describe('calendarDaysRepo.create dates', () => {
    test('dates the first day today and each later day the day after the last', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const first = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });
        const second = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });
        const third = await calendarDaysRepo.create(conn, { ownerId, today: '2030-01-01' });

        // Assert
        expect([first.date, second.date, third.date]).toEqual([
            '2026-10-15',
            '2026-10-16',
            '2026-10-17',
        ]);
    });

    test('carries the date across a month end', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-31' });

        // Act
        const next = await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-31' });

        // Assert
        expect(next.date).toBe('2026-11-01');
    });
});

describe('calendarDaysRepo.assignMissingDates', () => {
    const insertDay = (conn, ownerId, position, date) =>
        conn.execute('INSERT INTO calendar_days (owner_id, position, date) VALUES (?, ?, ?)', [
            ownerId,
            position,
            date,
        ]);

    test('dates dateless days in position order starting at today', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await insertDay(conn, ownerId, 0, null);
        await insertDay(conn, ownerId, 1, null);

        // Act
        await calendarDaysRepo.assignMissingDates(conn, ownerId, TODAY);

        // Assert
        const days = await calendarDaysRepo.listByOwner(conn, ownerId);
        expect(days.map((day) => day.date)).toEqual(['2026-10-15', '2026-10-16']);
    });

    test('continues after the last dated day and leaves dated days alone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await insertDay(conn, ownerId, 0, '2026-12-01');
        await insertDay(conn, ownerId, 1, null);
        await insertDay(conn, ownerId, 2, null);

        // Act
        await calendarDaysRepo.assignMissingDates(conn, ownerId, TODAY);

        // Assert
        const days = await calendarDaysRepo.listByOwner(conn, ownerId);
        expect(days.map((day) => day.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    });

    test("does not touch another owner's days", async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        await insertDay(conn, otherId, 0, null);

        // Act
        await calendarDaysRepo.assignMissingDates(conn, ownerId, TODAY);

        // Assert
        const days = await calendarDaysRepo.listByOwner(conn, otherId);
        expect(days.map((day) => day.date)).toEqual([null]);
    });
});

describe('calendarDaysRepo.removeBefore', () => {
    test('deletes only past days, returns their ids and keeps positions dense', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const past1 = await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-13' });
        const past2 = await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-13' });
        const current = await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-13' });
        const future = await calendarDaysRepo.create(conn, { ownerId, today: '2026-10-13' });
        const theirs = await calendarDaysRepo.create(conn, { ownerId: otherId, today: '2020-01-01' });

        // Act
        const removed = await calendarDaysRepo.removeBefore(conn, ownerId, '2026-10-15');

        // Assert
        expect(removed.sort()).toEqual([past1.id, past2.id].sort());
        expect(await dayOrder(conn, ownerId)).toEqual([
            [current.id, 0],
            [future.id, 1],
        ]);
        expect(await dayOrder(conn, otherId)).toEqual([[theirs.id, 0]]);
    });

    test('returns an empty list when nothing is past', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await calendarDaysRepo.create(conn, { ownerId, today: TODAY });

        // Act
        const removed = await calendarDaysRepo.removeBefore(conn, ownerId, TODAY);

        // Assert
        expect(removed).toEqual([]);
    });
});

describe('calendarDaysRepo.remove', () => {
    test('closes the gap it leaves', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });
        const second = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });
        const third = await calendarDaysRepo.create(conn, { ownerId, today: TODAY });

        // Act
        const removed = await calendarDaysRepo.remove(conn, second.id);

        // Assert
        expect(removed).toBe(true);
        expect(await dayOrder(conn, ownerId)).toEqual([
            [first.id, 0],
            [third.id, 1],
        ]);
    });

    test('reports false for a day that is already gone', async () => {
        // Arrange
        const conn = getConn();

        // Act
        const removed = await calendarDaysRepo.remove(conn, 999999);

        // Assert
        expect(removed).toBe(false);
    });
});

describe('calendarDaysRepo.listByOwner', () => {
    test('returns an empty array for an owner with no days', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const days = await calendarDaysRepo.listByOwner(conn, ownerId);

        // Assert
        expect(days).toEqual([]);
    });
});
