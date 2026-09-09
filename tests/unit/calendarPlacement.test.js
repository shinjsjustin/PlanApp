'use strict';

const { findPlacementProblem, findOverlap } = require('../../src/lib/calendarPlacement');

/** A legal placement, with fields overridable per case. */
const placement = (overrides = {}) => ({
    todoId: 1,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

describe('findPlacementProblem', () => {
    test('accepts a legal set', () => {
        expect(
            findPlacementProblem([
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
                placement({ todoId: 2, startMinutes: 600, durationMinutes: 30 }),
            ])
        ).toBeNull();
    });

    test('accepts an empty set', () => {
        expect(findPlacementProblem([])).toBeNull();
    });

    test('accepts a booking that ends exactly at midnight', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 1380, durationMinutes: 60 })])
        ).toBeNull();
    });

    test('accepts a booking that fills the whole day', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 0, durationMinutes: 1440 })])
        ).toBeNull();
    });

    test('rejects a start off the 30-minute grid', () => {
        expect(findPlacementProblem([placement({ startMinutes: 545 })])).toMatch(
            /startMinutes must be a multiple of 30/
        );
    });

    test('rejects a duration off the 30-minute grid', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 45 })])).toMatch(
            /durationMinutes must be a multiple of 30/
        );
    });

    test('rejects a negative start', () => {
        expect(findPlacementProblem([placement({ startMinutes: -30 })])).toMatch(
            /startMinutes must be 0 or more/
        );
    });

    test('rejects a duration below one slot', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 0 })])).toMatch(
            /durationMinutes must be at least 30/
        );
    });

    test('rejects a duration longer than a day', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 1470 })])).toMatch(
            /durationMinutes must be at most 1440/
        );
    });

    test('rejects a booking that runs past the end of its day', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 1410, durationMinutes: 60 })])
        ).toMatch(/may not run past the end of its day/);
    });

    test('rejects the same to-do appearing twice', () => {
        expect(
            findPlacementProblem([
                placement({ todoId: 1, dayId: 4, startMinutes: 0 }),
                placement({ todoId: 1, dayId: 5, startMinutes: 0 }),
            ])
        ).toMatch(/appears in more than one placement/);
    });
});

describe('findOverlap', () => {
    test('accepts two bookings that merely touch', () => {
        expect(
            findOverlap([
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
                placement({ todoId: 2, startMinutes: 600, durationMinutes: 30 }),
            ])
        ).toBeNull();
    });

    test('rejects two bookings that overlap in one day', () => {
        expect(
            findOverlap([
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
                placement({ todoId: 2, startMinutes: 570, durationMinutes: 30 }),
            ])
        ).toMatch(/overlap in day 4/);
    });

    test('does not confuse identical times in different days', () => {
        expect(
            findOverlap([
                placement({ todoId: 1, dayId: 4, startMinutes: 540 }),
                placement({ todoId: 2, dayId: 5, startMinutes: 540 }),
            ])
        ).toBeNull();
    });

    test('finds an overlap regardless of the order it is given in', () => {
        expect(
            findOverlap([
                placement({ todoId: 2, startMinutes: 570, durationMinutes: 30 }),
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
            ])
        ).toMatch(/overlap in day 4/);
    });
});
