'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

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
        const day = await calendarDaysRepo.create(conn, { ownerId });

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
        const first = await calendarDaysRepo.create(conn, { ownerId });
        const second = await calendarDaysRepo.create(conn, { ownerId });
        const third = await calendarDaysRepo.create(conn, { ownerId });

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
        await calendarDaysRepo.create(conn, { ownerId: theirs });
        await calendarDaysRepo.create(conn, { ownerId: theirs });

        // Act
        const day = await calendarDaysRepo.create(conn, { ownerId: mine });

        // Assert
        expect(day.position).toBe(0);
        expect(await dayOrder(conn, mine)).toEqual([[day.id, 0]]);
    });
});

describe('calendarDaysRepo.remove', () => {
    test('closes the gap it leaves', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await calendarDaysRepo.create(conn, { ownerId });
        const second = await calendarDaysRepo.create(conn, { ownerId });
        const third = await calendarDaysRepo.create(conn, { ownerId });

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
