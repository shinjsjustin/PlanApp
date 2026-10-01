import { toBulkRequest } from './calendarRequest';

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const todo = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    kind: 'todo',
    todoId,
    sequenceId: 5,
    dayId,
    startMinutes,
    durationMinutes,
});

const sequence = (sequenceId, dayId, startMinutes, durationMinutes = 60) => ({
    kind: 'sequence',
    todoId: null,
    sequenceId,
    dayId,
    startMinutes,
    durationMinutes,
});

describe('toBulkRequest with sequence bookings', () => {
    test('places a moved sequence by sequenceId with no todoId', () => {
        const before = { days: [day(1, 0)], items: [sequence(5, 1, 540)] };
        const after = { days: [day(1, 0)], items: [sequence(5, 1, 600)] };

        expect(toBulkRequest(before, after)).toEqual({
            appendDays: 0,
            placements: [{ sequenceId: 5, dayId: 1, startMinutes: 600, durationMinutes: 60 }],
            unschedule: [],
        });
    });

    test('names a spilled day by index for a sequence placement', () => {
        const before = { days: [day(1, 0)], items: [sequence(5, 1, 540)] };
        const after = { days: [day(1, 0), day(-1, 1)], items: [sequence(5, -1, 0)] };

        expect(toBulkRequest(before, after).placements).toEqual([
            { sequenceId: 5, dayIndex: 1, startMinutes: 0, durationMinutes: 60 },
        ]);
    });

    test('does not mistake a to-do for the sequence with the same number', () => {
        // Arrange — to-do 5 and sequence 5 both booked; only the to-do moves.
        const before = { days: [day(1, 0)], items: [todo(5, 1, 0), sequence(5, 1, 60)] };
        const after = { days: [day(1, 0)], items: [todo(5, 1, 30), sequence(5, 1, 60)] };

        expect(toBulkRequest(before, after).placements).toEqual([
            { todoId: 5, dayId: 1, startMinutes: 30, durationMinutes: 60 },
        ]);
    });

    test('releases a sequence into unscheduleSequences and leaves the to-do booked', () => {
        const before = { days: [day(1, 0)], items: [todo(5, 1, 0), sequence(5, 1, 60)] };
        const after = { days: [day(1, 0)], items: [todo(5, 1, 0)] };

        expect(toBulkRequest(before, after)).toEqual({
            appendDays: 0,
            placements: [],
            unschedule: [],
            unscheduleSequences: [5],
        });
    });

    test('releases a to-do into unschedule and leaves the sequence booked', () => {
        const before = { days: [day(1, 0)], items: [todo(5, 1, 0), sequence(5, 1, 60)] };
        const after = { days: [day(1, 0)], items: [sequence(5, 1, 60)] };

        expect(toBulkRequest(before, after)).toEqual({
            appendDays: 0,
            placements: [],
            unschedule: [5],
        });
    });
});
