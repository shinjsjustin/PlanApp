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
