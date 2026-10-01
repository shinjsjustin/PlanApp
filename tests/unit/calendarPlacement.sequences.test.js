'use strict';

const { findPlacementProblem } = require('../../src/lib/calendarPlacement');

const todo = (overrides = {}) => ({
    todoId: 1,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const sequence = (overrides = {}) => ({
    sequenceId: 1,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

describe('findPlacementProblem with sequences', () => {
    test('accepts a to-do and a sequence that share an id value', () => {
        expect(
            findPlacementProblem([
                todo({ todoId: 1, startMinutes: 540 }),
                sequence({ sequenceId: 1, startMinutes: 600 }),
            ])
        ).toBeNull();
    });

    test('reports a sequence named twice by sequence id', () => {
        expect(
            findPlacementProblem([
                sequence({ sequenceId: 7, startMinutes: 540 }),
                sequence({ sequenceId: 7, dayId: 5, startMinutes: 600 }),
            ])
        ).toBe('sequence 7 appears in more than one placement');
    });

    test('still reports a to-do named twice', () => {
        expect(
            findPlacementProblem([todo({ todoId: 3 }), todo({ todoId: 3, dayId: 5 })])
        ).toBe('to-do 3 appears in more than one placement');
    });

    test('names the sequence when its arithmetic is wrong', () => {
        expect(findPlacementProblem([sequence({ sequenceId: 7, startMinutes: 541 })])).toBe(
            'startMinutes must be a multiple of 30 (sequence 7)'
        );
    });

    test('names both kinds when a sequence overlaps a to-do', () => {
        expect(
            findPlacementProblem([
                todo({ todoId: 2, startMinutes: 540, durationMinutes: 60 }),
                sequence({ sequenceId: 9, startMinutes: 570 }),
            ])
        ).toBe('to-do 2 and sequence 9 overlap in day 4');
    });

    test('names two sequences that overlap', () => {
        expect(
            findPlacementProblem([
                sequence({ sequenceId: 8, startMinutes: 540 }),
                sequence({ sequenceId: 9, startMinutes: 570 }),
            ])
        ).toBe('sequence 8 and sequence 9 overlap in day 4');
    });
});
