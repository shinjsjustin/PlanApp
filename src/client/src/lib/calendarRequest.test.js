import { toBulkRequest } from './calendarRequest';

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const item = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

describe('toBulkRequest', () => {
    test('sends nothing when nothing changed', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [item(7, 1, 540)] };

        // Act + Assert
        expect(toBulkRequest(state, state)).toEqual({
            appendDays: 0,
            placements: [],
            unschedule: [],
        });
    });

    test('sends only the bookings a gesture actually moved', () => {
        // Arrange
        const before = { days: [day(1, 0)], items: [item(7, 1, 540), item(8, 1, 660)] };
        const after = { days: [day(1, 0)], items: [item(7, 1, 540, 120), item(8, 1, 660)] };

        // Act
        const request = toBulkRequest(before, after);

        // Assert — item 8 did not move, so it is not in the payload
        expect(request.placements).toEqual([
            { todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 120 },
        ]);
    });

    test('sends a new booking', () => {
        // Arrange
        const before = { days: [day(1, 0)], items: [] };
        const after = { days: [day(1, 0)], items: [item(7, 1, 540)] };

        // Act + Assert
        expect(toBulkRequest(before, after).placements).toEqual([
            { todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 },
        ]);
    });

    test('names an unsaved day by its index and counts the appends', () => {
        // Arrange — a spill created day -1 at position 1
        const before = { days: [day(1, 0)], items: [item(7, 1, 1410)] };
        const after = { days: [day(1, 0), day(-1, 1)], items: [item(7, -1, 0)] };

        // Act
        const request = toBulkRequest(before, after);

        // Assert
        expect(request).toEqual({
            appendDays: 1,
            placements: [{ todoId: 7, dayIndex: 1, startMinutes: 0, durationMinutes: 60 }],
            unschedule: [],
        });
    });

    test('reports a booking that disappeared as an unschedule', () => {
        // Arrange
        const before = { days: [day(1, 0)], items: [item(7, 1, 540), item(8, 1, 660)] };
        const after = { days: [day(1, 0)], items: [item(8, 1, 660)] };

        // Act + Assert
        expect(toBulkRequest(before, after)).toEqual({
            appendDays: 0,
            placements: [],
            unschedule: [7],
        });
    });

    test('never asks for more days than it has placements for', () => {
        // Arrange — the server refuses appendDays > placements.length, and an
        // appended day always receives at least the item that caused it
        const before = { days: [day(1, 0)], items: [item(7, 1, 1410)] };
        const after = { days: [day(1, 0), day(-1, 1)], items: [item(7, -1, 0)] };

        // Act
        const request = toBulkRequest(before, after);

        // Assert
        expect(request.appendDays).toBeLessThanOrEqual(request.placements.length);
    });
});
