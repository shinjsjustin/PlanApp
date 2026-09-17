'use strict';

const cases = require('../../src/shared/noteLaneCases.json');
const {
    MAX_NOTE_LANES,
    findLaneProblem,
    maxOverlap,
} = require('../../src/lib/calendarNoteLanes');

/**
 * The server's half of decision 7. The client assigns lanes greedily and the
 * server counts maximum overlap; the claim is that those refuse exactly the
 * same arrangements. Neither side can import the other, so both read one table.
 *
 * The client twin of this file is
 * `src/client/src/lib/noteLanes.fixtures.test.js`.
 */

describe('the shared table', () => {
    test('is actually loaded, and agrees on the cap', () => {
        expect(cases.cases.length).toBeGreaterThan(0);
        expect(cases.maxLanes).toBe(MAX_NOTE_LANES);
    });
});

describe('maxOverlap against the shared table', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Act & Assert
            expect(maxOverlap(testCase.notes)).toBe(testCase.maxOverlap);
        });
    });
});

describe('findLaneProblem against the shared table', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Arrange
            const isLegal = testCase.lanes !== null;

            // Act
            const problem = findLaneProblem(testCase.notes);

            // Assert
            if (isLegal) expect(problem).toBeNull();
            else expect(problem).toMatch(/at most 4 notes/);
        });
    });
});

describe('maxOverlap', () => {
    test('counts a nested note as overlapping its container', () => {
        // Arrange
        const notes = [
            { id: 1, startMinutes: 0, durationMinutes: 600 },
            { id: 2, startMinutes: 60, durationMinutes: 60 },
        ];

        // Act & Assert
        expect(maxOverlap(notes)).toBe(2);
    });

    test('does not count a note ending where the next begins', () => {
        // Arrange
        const notes = [
            { id: 1, startMinutes: 0, durationMinutes: 60 },
            { id: 2, startMinutes: 60, durationMinutes: 60 },
        ];

        // Act & Assert
        expect(maxOverlap(notes)).toBe(1);
    });
});
