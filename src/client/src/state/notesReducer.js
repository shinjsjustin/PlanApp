// The notes plane, as state (design 2026-09-16, section 7.1).
//
// A flat list, like `calendarReducer`'s and for the same reason: a day's notes
// are read as a group and `lib/noteLanes` works on arrays, so keying them by id
// would mean converting both ways on every pointer move of a gesture.
//
// Much smaller than `calendarReducer`, though, and the difference is decision 2.
// A booking gesture is one arithmetic result over the whole schedule, so the
// calendar replaces days and items together and snapshots both. A note gesture
// changes one row and moves nothing else, so there is no cascade to fold, no
// spill to reconcile, and no temporary day to re-key. The list is still replaced
// wholesale rather than patched, because that makes a rollback a plain
// assignment — but it is the only thing this file borrows.
//
// Notes arrays are values: `notesReplaced`, `rolledBack` and `notesOf` all pass
// one by reference rather than copying it, and that is only safe because
// nobody mutates a notes array in place, ever. Every change is a new array
// installed wholesale (immutability is CRITICAL project-wide; here it is also
// what lets `useCalendarNotes` tell a fresh array from the one it handed out
// by comparing identity, not contents).

import { DAY_MINUTES } from '../lib/schedule';

export const NOTES_STATUS = {
    idle: 'idle',
    loading: 'loading',
    ready: 'ready',
    error: 'error',
};

export const NOTES_ACTIONS = {
    loadStarted: 'loadStarted',
    loadSucceeded: 'loadSucceeded',
    loadFailed: 'loadFailed',
    notesReplaced: 'notesReplaced',
    rolledBack: 'rolledBack',
    actionErrorRaised: 'actionErrorRaised',
    actionErrorCleared: 'actionErrorCleared',
};

export const initialNotesState = {
    status: NOTES_STATUS.idle,
    // The load failed and there are no notes to show — the plane offers a retry.
    loadError: null,
    // A write failed and was rolled back — the page raises a toast.
    actionError: null,
    notes: [],
};

/** The slice a mutation snapshots and a rollback restores. */
export const notesOf = (state) => state.notes;

/** `JSON.stringify(NaN)` is the string "null"; a number should say what it is. */
const describeValue = (value) =>
    typeof value === 'number' ? String(value) : JSON.stringify(value);

/**
 * Every note must carry a real start and a real length that lands inside its
 * day, because everything downstream assumes it.
 *
 * `assignLanes` compares starts and ends to decide what overlaps; one `undefined`
 * makes every comparison false, so a broken note would appear to overlap nothing
 * and be drawn in lane 0 on top of whatever is already there. And a ribbon
 * positioned from `NaN` simply does not paint, so the note would vanish with no
 * error anywhere. Cheaper to refuse it here than to explain it later.
 *
 * This is the calendar's `assertIngestible` for the other plane, and it is
 * called at both points data enters this tree: the server's answer on load
 * (`loadSucceeded`), and a note gesture's settled result on commit
 * (`notesReplaced`), which covers an optimistic row and the real thing landing
 * after a save alike. A rollback restores a snapshot that was already checked
 * on its way in, so it needs no second check.
 */
const assertIngestible = (note) => {
    if (!Number.isFinite(note.startMinutes) || !Number.isFinite(note.durationMinutes)) {
        throw new Error(
            `Note ${note.id} needs a number for both startMinutes and ` +
                `durationMinutes, got ${describeValue(note.startMinutes)} ` +
                `and ${describeValue(note.durationMinutes)}`
        );
    }

    if (note.durationMinutes <= 0) {
        throw new Error(
            `Note ${note.id} has a duration of ${note.durationMinutes}; it must be positive`
        );
    }

    if (note.startMinutes < 0 || note.startMinutes + note.durationMinutes > DAY_MINUTES) {
        throw new Error(
            `Note ${note.id} must end by the end of its day; it runs from ` +
                `${note.startMinutes} to ${note.startMinutes + note.durationMinutes}`
        );
    }
};

const handlers = {
    [NOTES_ACTIONS.loadStarted]: (state) => ({
        ...state,
        status: NOTES_STATUS.loading,
        loadError: null,
    }),

    [NOTES_ACTIONS.loadSucceeded]: (state, { notes }) => {
        notes.forEach(assertIngestible);

        return { ...state, status: NOTES_STATUS.ready, loadError: null, notes };
    },

    // The notes already on screen are kept. A failed re-read is a notice above
    // the plane, not a reason to blank a day that is still perfectly readable.
    [NOTES_ACTIONS.loadFailed]: (state, { error }) => ({
        ...state,
        status: NOTES_STATUS.error,
        loadError: error,
    }),

    [NOTES_ACTIONS.notesReplaced]: (state, { notes }) => {
        notes.forEach(assertIngestible);

        // Installed by reference. `useCalendarNotes` compares the array it put
        // here against the one that is here now to decide whether its snapshot
        // is still an undo; a copy would make that always false.
        return { ...state, notes };
    },

    [NOTES_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        notes: snapshot,
        actionError: error,
    }),

    [NOTES_ACTIONS.actionErrorRaised]: (state, { error }) => ({ ...state, actionError: error }),

    [NOTES_ACTIONS.actionErrorCleared]: (state) => ({ ...state, actionError: null }),
};

export const notesReducer = (state, action) => {
    const handler = handlers[action.type];

    if (!handler) throw new Error(`Unknown notes action "${action.type}"`);

    return handler(state, action);
};
