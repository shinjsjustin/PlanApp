import cases from '../../../shared/noteLaneCases.json';

import { MAX_NOTE_LANES, assignLanes } from './noteLanes';

/**
 * The client's half of decision 7. The browser assigns lanes greedily and the
 * server counts maximum overlap; the claim is that those refuse exactly the same
 * arrangements.
 *
 * Neither side can import the other — this bundle is ESM behind CRA's module
 * scope and the server is CommonJS under the root Jest config — so both read one
 * table, exactly as the ready frontier already does in `graph.frontier.test.js`.
 *
 * The server twin of this file is `tests/unit/calendarNoteLanes.test.js`.
 */

/** The map, as the table writes it: plain object, string keys, null for refused. */
const summarise = (lanes) => {
    const entries = [...lanes.entries()].map(([id, lane]) => [String(id), lane]);

    return Object.fromEntries(entries);
};

const isRefused = (lanes) => [...lanes.values()].some((lane) => lane === null);

describe('the shared table', () => {
    test('is actually loaded, and agrees on the cap', () => {
        expect(cases.cases.length).toBeGreaterThan(0);
        expect(cases.maxLanes).toBe(MAX_NOTE_LANES);
    });
});

describe('assignLanes against the shared table', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Act
            const lanes = assignLanes(testCase.notes);

            // Assert
            if (testCase.lanes === null) {
                expect(isRefused(lanes)).toBe(true);
                return;
            }

            expect(summarise(lanes)).toEqual(testCase.lanes);
        });
    });
});

describe('the picker refuses exactly what the cap refuses', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Arrange — the table's `maxOverlap` is what the server computes
            const exceedsCap = testCase.maxOverlap > MAX_NOTE_LANES;

            // Act
            const lanes = assignLanes(testCase.notes);

            // Assert
            expect(isRefused(lanes)).toBe(exceedsCap);
        });
    });
});
