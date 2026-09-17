'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarNotesRepo = require('../../src/db/repositories/calendarNotesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Notes are the simplest table in the calendar: no position to keep dense, no
 * unique key to honour, no joins to draw a card. What is asserted here is
 * ownership scoping and that reads come back in display order.
 */

const createDay = async (conn) => {
    const ownerId = await createTestUser(conn);
    const day = await calendarDaysRepo.create(conn, { ownerId });

    return { ownerId, day };
};

describe('calendarNotesRepo.create', () => {
    test('stores a note against its day', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);

        // Act
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'train to Leeds',
            startMinutes: 540,
            durationMinutes: 120,
        });

        // Assert
        expect(note.day_id).toBe(day.id);
        expect(note.text).toBe('train to Leeds');
        expect(note.start_minutes).toBe(540);
        expect(note.duration_minutes).toBe(120);
    });
});

describe('calendarNotesRepo.listByOwner', () => {
    test('returns only the owner’s notes', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createDay(conn);
        const theirs = await createDay(conn);

        await calendarNotesRepo.create(conn, {
            dayId: mine.day.id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: theirs.day.id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByOwner(conn, mine.ownerId);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['mine']);
    });

    test('orders by day position, then start, then id', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await calendarDaysRepo.create(conn, { ownerId });
        const second = await calendarDaysRepo.create(conn, { ownerId });

        await calendarNotesRepo.create(conn, {
            dayId: second.id,
            text: 'day two',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: first.id,
            text: 'late',
            startMinutes: 720,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: first.id,
            text: 'early',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByOwner(conn, ownerId);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['early', 'late', 'day two']);
    });
});

describe('calendarNotesRepo.listByDayId', () => {
    test('returns the day’s notes in start order', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);

        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'second',
            startMinutes: 600,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'first',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByDayId(conn, day.id);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['first', 'second']);
    });
});

describe('calendarNotesRepo.update', () => {
    test('applies only the named fields', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const updated = await calendarNotesRepo.update(conn, note.id, { startMinutes: 600 });

        // Assert
        expect(updated.start_minutes).toBe(600);
        expect(updated.text).toBe('on call');
        expect(updated.duration_minutes).toBe(60);
    });

    test('returns null for a note that is not there', async () => {
        // Arrange
        const conn = getConn();

        // Act
        const updated = await calendarNotesRepo.update(conn, 999999, { text: 'nope' });

        // Assert
        expect(updated).toBeNull();
    });
});

describe('calendarNotesRepo.remove', () => {
    test('deletes the note and reports it', async () => {
        // Arrange
        const conn = getConn();
        const { day, ownerId } = await createDay(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'gone',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const deleted = await calendarNotesRepo.remove(conn, note.id);

        // Assert
        expect(deleted).toBe(true);
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});

describe('deleting a day', () => {
    test('takes its notes with it', async () => {
        // Arrange
        const conn = getConn();
        const { day, ownerId } = await createDay(conn);
        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'context',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        await calendarDaysRepo.remove(conn, day.id);

        // Assert
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});
