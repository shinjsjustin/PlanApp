'use strict';

const fixtures = require('../../src/shared/frontierFixtures.json');

const { SEQUENCE_STATUS, readyFrontier, sequenceStatus } = require('../../src/lib/frontier');

/**
 * The server twin of `src/client/src/lib/graph.frontier.test.js`.
 *
 * Both suites read the same table of cases from
 * `src/shared/frontierFixtures.json`, so the two derivations — this one and the
 * browser's `lib/graph.js` — cannot drift apart without one of them going red.
 */

const summarise = (frontier) =>
    frontier.map((entry) => ({
        sequenceId: entry.sequence.id,
        nextTodoId: entry.nextTodo ? entry.nextTodo.id : null,
    }));

describe('readyFrontier against the shared fixture table', () => {
    test('the table is actually loaded', () => {
        expect(fixtures.cases.length).toBeGreaterThan(0);
    });

    fixtures.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Arrange & Act
            const frontier = readyFrontier({
                layers: testCase.layers,
                sequences: testCase.sequences,
                todos: testCase.todos,
            });

            // Assert
            expect(summarise(frontier)).toEqual(testCase.expected);
        });
    });
});

describe('sequenceStatus', () => {
    const sequence = { id: 1, isBlocked: false };
    const todo = (id, status, position = 0) => ({
        id,
        sequenceId: 1,
        status,
        position,
    });

    test('reports an empty sequence as incomplete', () => {
        expect(sequenceStatus(sequence, [])).toBe(SEQUENCE_STATUS.incomplete);
    });

    test('reports a sequence with every to-do complete as complete', () => {
        expect(sequenceStatus(sequence, [todo(101, 'complete'), todo(102, 'complete', 1)])).toBe(
            SEQUENCE_STATUS.complete
        );
    });

    test('does not count a blocked to-do as complete', () => {
        expect(sequenceStatus(sequence, [todo(101, 'complete'), todo(102, 'blocked', 1)])).toBe(
            SEQUENCE_STATUS.incomplete
        );
    });

    test('lets the manual block override an otherwise complete sequence', () => {
        expect(sequenceStatus({ id: 1, isBlocked: true }, [todo(101, 'complete')])).toBe(
            SEQUENCE_STATUS.blocked
        );
    });

    test('ignores to-dos belonging to other sequences and unorganized ones', () => {
        const others = [
            todo(101, 'complete'),
            { id: 201, sequenceId: 2, status: 'incomplete', position: 0 },
            { id: 900, sequenceId: null, status: 'incomplete', position: 0 },
        ];

        expect(sequenceStatus(sequence, others)).toBe(SEQUENCE_STATUS.complete);
    });
});

describe('readyFrontier immutability', () => {
    test('does not touch the arrays it is handed', () => {
        // Arrange — the drone case, whose layers and sequences both need sorting.
        const [droneCase] = fixtures.cases.filter((testCase) => testCase.sequences.length > 3);
        const layers = [...droneCase.layers];
        const sequences = [...droneCase.sequences];
        const todos = [...droneCase.todos];
        const snapshot = JSON.stringify({ layers, sequences, todos });

        // Act
        readyFrontier({ layers, sequences, todos });

        // Assert
        expect(JSON.stringify({ layers, sequences, todos })).toBe(snapshot);
    });
});
