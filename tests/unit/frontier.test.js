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

const UNSORTED_LAYERS_CASE = 'orders entries by layer position, whatever order the layers arrive in';

/**
 * The fixture table is one shared JSON object for the whole file, so a case
 * handed to `readyFrontier` unguarded would let an in-place sort rewrite the
 * table for every test after it. Each case is worked on as its own copy.
 */
const copyOf = (testCase) => JSON.parse(JSON.stringify(testCase));

const summarise = (frontier) =>
    frontier.map((entry) => ({
        sequenceId: entry.sequence.id,
        nextTodoId: entry.nextTodo ? entry.nextTodo.id : null,
    }));

describe('readyFrontier against the shared fixture table', () => {
    test('the table is actually loaded', () => {
        expect(fixtures.cases.length).toBeGreaterThan(0);
    });

    fixtures.cases.forEach((sharedCase) => {
        test(sharedCase.name, () => {
            // Arrange
            const testCase = copyOf(sharedCase);

            // Act
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
        // Arrange — the one case whose layers arrive out of position order, so
        // sorting them in place would reorder the caller's own array.
        const sharedCase = fixtures.cases.find((entry) => entry.name === UNSORTED_LAYERS_CASE);
        expect(sharedCase).toBeDefined();

        const { layers, sequences, todos } = copyOf(sharedCase);
        const snapshot = JSON.stringify({ layers, sequences, todos });

        // Act
        readyFrontier({ layers, sequences, todos });

        // Assert
        expect(JSON.stringify({ layers, sequences, todos })).toBe(snapshot);
    });
});
