import fixtures from '../../../shared/frontierFixtures.json';

import { readyFrontier } from './graph';

/**
 * The ready frontier is computed twice — here in the browser (`lib/graph.js`)
 * and again server-side (`src/lib/frontier.js`) for the projects home page.
 * Two implementations can drift; two hand-written test suites would let them
 * drift silently.
 *
 * So both suites read the same table of cases from
 * `src/shared/frontierFixtures.json`. A change to one derivation that the other
 * does not follow fails on one side of the app or the other.
 *
 * The server twin of this file is `tests/unit/frontier.test.js`.
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
