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

    test.each([[null], [undefined], [{}]])(
        'reports a problem rather than throwing for %p',
        (notASet) => {
            // A rule that throws would surface as a 500 where every other rule
            // here surfaces as a 400.
            expect(findPlacementProblem(notASet)).toMatch(/placements must be an array/);
        }
    );

    test('exports the sleep window edges', () => {
        const exported = require('../../src/lib/calendarPlacement');
        expect(exported.WAKE_MINUTES).toBe(480);
        expect(exported.SLEEP_START_MINUTES).toBe(1380);
    });

    test('accepts a booking that fills 08:00 to 23:00 exactly', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 480, durationMinutes: 900 })])
        ).toBeNull();
    });

    test('accepts a booking ending exactly at 23:00', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 1320, durationMinutes: 60 })])
        ).toBeNull();
    });

    test('rejects a booking starting at 07:55', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 475, durationMinutes: 60 })])
        ).toBe('a booking must sit between 08:00 and 23:00 (to-do 1)');
    });

    test('rejects a booking ending at 23:05', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 1325, durationMinutes: 60 })])
        ).toBe('a booking must sit between 08:00 and 23:00 (to-do 1)');
    });

    test('rejects a booking that fills the whole day', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 0, durationMinutes: 1440 })])
        ).toMatch(/between 08:00 and 23:00/);
    });

    test('accepts a 15-minute booking starting on a 5-minute step', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 605, durationMinutes: 15 })])
        ).toBeNull();
    });

    test('rejects a start off the 5-minute grid', () => {
        expect(findPlacementProblem([placement({ startMinutes: 602 })])).toMatch(
            /startMinutes must be a multiple of 5/
        );
    });

    test('rejects a duration off the 5-minute grid', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 17 })])).toMatch(
            /durationMinutes must be a multiple of 5/
        );
    });

    test('rejects a duration of 10, below the 15-minute minimum', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 10 })])).toMatch(
            /durationMinutes must be at least 15/
        );
    });

    test('exports STEP_MINUTES and MIN_DURATION but not SLOT_MINUTES', () => {
        const exported = require('../../src/lib/calendarPlacement');
        expect(exported.STEP_MINUTES).toBe(5);
        expect(exported.MIN_DURATION).toBe(15);
        expect(exported.SLOT_MINUTES).toBeUndefined();
    });

    test('rejects a negative start', () => {
        expect(findPlacementProblem([placement({ startMinutes: -30 })])).toMatch(
            /startMinutes must be 0 or more/
        );
    });

    test('rejects a duration below one slot', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 0 })])).toMatch(
            /durationMinutes must be at least 15/
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
                placement({ todoId: 1, dayId: 4 }),
                placement({ todoId: 1, dayId: 5 }),
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
