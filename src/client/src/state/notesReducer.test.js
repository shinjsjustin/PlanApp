import {
    NOTES_STATUS,
    initialNotesState,
    notesOf,
    notesReducer,
} from './notesReducer';
import {
    actionErrorCleared,
    actionErrorRaised,
    loadFailed,
    loadStarted,
    loadSucceeded,
    notesReplaced,
    rolledBack,
} from './notesActions';

const note = (id, dayId = 1) => ({
    id,
    dayId,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
});

describe('loading', () => {
    test('loadStarted clears a previous load error', () => {
        // Arrange
        const errored = notesReducer(initialNotesState, loadFailed('nope'));

        // Act
        const state = notesReducer(errored, loadStarted());

        // Assert
        expect(state.status).toBe(NOTES_STATUS.loading);
        expect(state.loadError).toBeNull();
    });

    test('loadSucceeded installs the notes and becomes ready', () => {
        // Act
        const state = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Assert
        expect(state.status).toBe(NOTES_STATUS.ready);
        expect(state.notes).toEqual([note(1)]);
    });

    test('loadFailed keeps the notes it already had', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act
        const state = notesReducer(ready, loadFailed('nope'));

        // Assert
        expect(state.notes).toEqual([note(1)]);
        expect(state.loadError).toBe('nope');
    });
});

describe('notesReplaced', () => {
    test('swaps the list wholesale', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act
        const state = notesReducer(ready, notesReplaced([note(2)]));

        // Assert
        expect(state.notes).toEqual([note(2)]);
    });

    test('installs the array by reference, so a mutation can tell what it did', () => {
        // Arrange — `useCalendarNotes` compares by identity to decide whether
        // its snapshot is still an undo. A defensive copy here would break that.
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const next = [note(1)];

        // Act
        const state = notesReducer(ready, notesReplaced(next));

        // Assert
        expect(state.notes).toBe(next);
    });

    test('refuses a note that is not a legal booking of time', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const broken = [{ ...note(1), startMinutes: undefined }];

        // Act & Assert
        expect(() => notesReducer(ready, notesReplaced(broken))).toThrow(/startMinutes/);
    });

    test('refuses a note running past midnight', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const broken = [{ ...note(1), startMinutes: 1410, durationMinutes: 60 }];

        // Act & Assert
        expect(() => notesReducer(ready, notesReplaced(broken))).toThrow(/end of its day/);
    });
});

describe('rolledBack', () => {
    test('restores the snapshot and raises the message', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));
        const optimistic = notesReducer(ready, notesReplaced([note(1), note(2)]));

        // Act
        const state = notesReducer(optimistic, rolledBack([note(1)], 'nope'));

        // Assert
        expect(state.notes).toEqual([note(1)]);
        expect(state.actionError).toBe('nope');
    });
});

describe('action errors', () => {
    test('actionErrorRaised leaves the notes alone', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act
        const state = notesReducer(ready, actionErrorRaised('nope'));

        // Assert
        expect(state.notes).toEqual([note(1)]);
        expect(state.actionError).toBe('nope');
    });

    test('actionErrorCleared clears it', () => {
        // Arrange
        const raised = notesReducer(initialNotesState, actionErrorRaised('nope'));

        // Act & Assert
        expect(notesReducer(raised, actionErrorCleared()).actionError).toBeNull();
    });
});

describe('notesOf', () => {
    test('is the slice a mutation snapshots', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act & Assert
        expect(notesOf(ready)).toBe(ready.notes);
    });
});

describe('an unknown action', () => {
    test('throws rather than passing the state through', () => {
        // Act & Assert
        expect(() => notesReducer(initialNotesState, { type: 'nonsense' })).toThrow(
            /nonsense/
        );
    });
});
