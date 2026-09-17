import { MAX_NOTE_LANES, assignLanes, canPlace } from './noteLanes';

/**
 * The lane picker. Everything the notes plane draws trusts this, and the live
 * refusal during a gesture is `canPlace` and nothing else.
 *
 * The arrangements themselves are covered by the shared table in
 * `noteLanes.fixtures.test.js`; what is here is the behaviour that table cannot
 * express — how a candidate is tested, and what happens past the cap.
 */

const note = (id, startMinutes, durationMinutes) => ({ id, startMinutes, durationMinutes });

describe('assignLanes', () => {
    test('returns an empty map for a day with no notes', () => {
        // Act & Assert
        expect(assignLanes([])).toEqual(new Map());
    });

    test('fills lane 0 first, which is drawn rightmost', () => {
        // Arrange
        const notes = [note(1, 540, 60)];

        // Act
        const lanes = assignLanes(notes);

        // Assert
        expect(lanes.get(1)).toBe(0);
    });

    test('does not mutate the array it is given', () => {
        // Arrange
        const notes = [note(2, 600, 60), note(1, 540, 60)];
        const before = [...notes];

        // Act
        assignLanes(notes);

        // Assert
        expect(notes).toEqual(before);
    });

    test('maps a note with no free lane to null rather than dropping it', () => {
        // Arrange — five at the same minute, one past the cap
        const notes = [1, 2, 3, 4, 5].map((id) => note(id, 540, 60));

        // Act
        const lanes = assignLanes(notes);

        // Assert
        expect(lanes.size).toBe(5);
        expect(lanes.get(5)).toBeNull();
    });

    test('is stable across runs for notes sharing a start', () => {
        // Arrange
        const notes = [note(3, 540, 60), note(1, 540, 60), note(2, 540, 60)];

        // Act
        const first = assignLanes(notes);
        const second = assignLanes([...notes].reverse());

        // Assert
        expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
    });
});

describe('canPlace', () => {
    test('allows a note into an empty day', () => {
        // Act & Assert
        expect(canPlace([], note(1, 540, 60))).toBe(true);
    });

    test('allows a fifth note that overlaps nothing', () => {
        // Arrange
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert
        expect(canPlace(existing, note(5, 600, 60))).toBe(true);
    });

    test('refuses a fifth note that overlaps the other four', () => {
        // Arrange
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert
        expect(canPlace(existing, note(5, 540, 60))).toBe(false);
    });

    test('excludes the candidate’s own row, so a note can be resized in a full day', () => {
        // Arrange — the candidate IS one of the four already there. Counting it
        // twice would refuse a resize that is plainly legal.
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert
        expect(canPlace(existing, note(1, 540, 120))).toBe(true);
    });

    test('refuses a note that would run past midnight', () => {
        // Act & Assert
        expect(canPlace([], note(1, 1410, 60))).toBe(false);
    });

    test('refuses a note starting before midnight', () => {
        // Act & Assert
        expect(canPlace([], note(1, -30, 60))).toBe(false);
    });

    test('treats end-to-start contact as free', () => {
        // Arrange
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert — starts exactly where the others end
        expect(canPlace(existing, note(5, 600, 60))).toBe(true);
    });
});

describe('canPlace with an id-less candidate', () => {
    // A note being created has no id yet — that shape is not in the shared
    // table, which has no notion of an id-less note, so these belong here.

    test('refuses a tied draft when the day is already at capacity', () => {
        // Arrange — four existing notes fill every lane; the draft shares
        // their start and has no id, which is what a note being created
        // looks like before it is saved.
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));
        const draft = { startMinutes: 540, durationMinutes: 60 };

        // Act & Assert
        expect(canPlace(existing, draft)).toBe(false);
    });

    test('allows a tied draft when the day is under capacity', () => {
        // Arrange — three existing notes leave a lane free
        const existing = [1, 2, 3].map((id) => note(id, 540, 60));
        const draft = { startMinutes: 540, durationMinutes: 60 };

        // Act & Assert
        expect(canPlace(existing, draft)).toBe(true);
    });
});

describe('MAX_NOTE_LANES', () => {
    test('is four', () => {
        expect(MAX_NOTE_LANES).toBe(4);
    });
});
