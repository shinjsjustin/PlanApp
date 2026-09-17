import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { api } from '../lib/api';
import { createTempId } from '../lib/tempIds';
import { notesReducer, initialNotesState, notesOf } from '../state/notesReducer';
import {
    actionErrorCleared,
    actionErrorRaised,
    loadFailed,
    loadStarted,
    loadSucceeded,
    notesReplaced,
    rolledBack,
} from '../state/notesActions';

// Loads the notes and changes them optimistically, mirroring `useCalendar` —
// apply at once, send, then either keep the server's answer or roll back and
// raise a message. Nothing fails quietly.
//
// A sibling hook rather than part of `useCalendar` (design section 7.1). The
// page already runs `usePool` and `useCalendar` independently, each with its own
// failure state, because a calendar you cannot schedule into is still worth
// reading. Notes are a third plane of the same kind, and keeping them out of
// `useCalendar` is also what keeps `scheduleOf`, `toBulkRequest` and the bulk
// endpoint free of a notes dimension the cascade would never read.
//
// Simpler than `useCalendar` in one way that matters: the unit of change is one
// row. There is no cascade to fold, no spill to reconcile, no temporary day to
// re-key — so a mutation is "replace the list" and a rollback is "put the old
// list back".

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

const UNREADABLE_NOTES = 'The server sent an unreadable notes list.';

/**
 * The wire is a boundary, and `api` guarantees a parsed body and nothing at all
 * about its shape.
 *
 * Handed on unchecked, a body missing the key reaches `loadSucceeded` as
 * `undefined.forEach` — which lands in the `catch` below and puts a stack
 * trace's wording beside the retry button, with nothing anywhere saying what the
 * server actually sent. So the shape is checked where it enters, the user is
 * told something about the server, and the body goes to the console for whoever
 * has to work out why.
 */
const readNotes = (payload) => {
    if (!Array.isArray(payload?.notes)) {
        console.error('[calendar notes] unreadable response body:', payload);

        throw new Error(UNREADABLE_NOTES);
    }

    return payload.notes;
};

/**
 * Whether anything has settled into the list since `installed` was put there.
 *
 * Exact rather than a heuristic: `notesReducer` installs the array by reference,
 * so its identity survives until something replaces it. The same contract
 * `useCalendar` relies on, for the same purpose — a snapshot stops being an undo
 * the moment something else has changed the list, and restoring it then would
 * resurrect whatever settled in between.
 */
const hasSettledSince = (state, installed) => state.notes !== installed;

const useCalendarNotes = () => {
    const [state, rawDispatch] = useReducer(notesReducer, initialNotesState);

    // The state as the reducer has already been told to make it. A response can
    // beat the re-render that a dispatch schedules, so a mutation reading
    // `state` from its closure would rebase the server's answer onto a list that
    // is already stale. Folded through the same reducer so there is one
    // definition of what an action does.
    const stateRef = useRef(initialNotesState);

    /**
     * The only dispatcher this hook uses.
     *
     * Because the fold runs here, a reducer that refuses an action — the ingest
     * guard on a malformed note — throws in the caller's own frame rather than
     * during the next render, which is what lets `mutate` catch it and roll back
     * instead of the page's error boundary swallowing the plane.
     */
    const dispatch = useCallback((action) => {
        stateRef.current = notesReducer(stateRef.current, action);

        rawDispatch(action);
    }, []);

    const fetchNotes = useCallback(async () => {
        try {
            const notes = readNotes(await api.get('/calendar/notes'));

            dispatch(loadSucceeded(notes));
        } catch (err) {
            dispatch(loadFailed(messageOf(err)));
        }
    }, [dispatch]);

    const load = useCallback(async () => {
        dispatch(loadStarted());

        await fetchNotes();
    }, [dispatch, fetchNotes]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * One optimistic write: apply, send, settle.
     *
     * `apply(notes)` returns the list as it should look at once. `onSuccess(notes,
     * saved)` returns it as it should look afterwards, rebased on the list as it
     * is *now* rather than on the optimistic one — the two differ whenever
     * something settled during the round trip.
     */
    const mutate = useCallback(
        async ({ apply, send, onSuccess }) => {
            const previous = notesOf(stateRef.current);

            // What this mutation put on screen, compared by reference at the end
            // and nothing else.
            let installed = null;

            try {
                // Inside the `try`, not in front of it. This function is
                // `async`, so a throw out here would reject the returned promise
                // rather than reaching the caller — and a popover's Save fires a
                // mutation without awaiting it. A write aimed at a note that is
                // no longer there would then be an unhandled rejection with
                // nothing on screen. Caught here it is a visible `actionError`,
                // and the request is never sent.
                const optimistic = apply(previous);

                dispatch(notesReplaced(optimistic));
                installed = optimistic;

                const saved = await send();

                if (onSuccess) {
                    dispatch(notesReplaced(onSuccess(notesOf(stateRef.current), saved)));
                }

                return true;
            } catch (err) {
                // `previous` is an undo only while this mutation's change is
                // still the last thing that happened. Once something else has
                // settled, restoring it would wind that away too — so the
                // message is raised without touching the list, and the server is
                // asked what is actually true.
                if (installed && hasSettledSince(stateRef.current, installed)) {
                    dispatch(actionErrorRaised(messageOf(err)));

                    // `fetchNotes` rather than `load`: nothing about this asked
                    // the user to wait, and emptying the plane would be a bigger
                    // interruption than the failure was.
                    fetchNotes();

                    return false;
                }

                dispatch(rolledBack(previous, messageOf(err)));

                return false;
            }
        },
        [dispatch, fetchNotes]
    );

    /**
     * A note the server has not stored yet is drawn immediately under a negative
     * id — the same optimistic pattern every other row in this app uses — and
     * re-keyed when the answer arrives.
     *
     * The temp id is captured from `apply`, which `mutate` calls once and
     * synchronously, before the request it is reconciled by can possibly answer.
     */
    const createNote = useCallback(
        ({ dayId, text, startMinutes, durationMinutes }) => {
            let tempId = null;

            return mutate({
                apply: (notes) => {
                    tempId = createTempId();

                    return [
                        ...notes,
                        { id: tempId, dayId, text, startMinutes, durationMinutes },
                    ];
                },
                send: () =>
                    api.post('/calendar/notes', { dayId, text, startMinutes, durationMinutes }),
                onSuccess: (notes, saved) =>
                    notes.map((note) => (note.id === tempId ? saved : note)),
            });
        },
        [mutate]
    );

    /**
     * Rename, move or resize — one row write, whichever fields the gesture sent.
     *
     * Refuses a note that is not in the list rather than quietly producing no
     * change, which would look like a save that silently did nothing. The refusal
     * is thrown from `apply`, so `mutate` turns it into a visible message and
     * sends no request.
     */
    const updateNote = useCallback(
        (id, fields) =>
            mutate({
                apply: (notes) => {
                    if (!notes.some((note) => note.id === id)) {
                        throw new Error(`Note ${id} is no longer there`);
                    }

                    return notes.map((note) =>
                        note.id === id ? { ...note, ...fields } : note
                    );
                },
                send: () => api.patch(`/calendar/notes/${id}`, fields),
                onSuccess: (notes, saved) =>
                    notes.map((note) => (note.id === id ? saved : note)),
            }),
        [mutate]
    );

    const deleteNote = useCallback(
        (id) =>
            mutate({
                apply: (notes) => {
                    if (!notes.some((note) => note.id === id)) {
                        throw new Error(`Note ${id} is no longer there`);
                    }

                    return notes.filter((note) => note.id !== id);
                },
                send: () => api.delete(`/calendar/notes/${id}`),
            }),
        [mutate]
    );

    /**
     * Drops the notes of a day that has been deleted.
     *
     * No request: the schema cascaded them away the moment the day went (decision
     * 9). This is local hygiene, and the page calls it only after the delete the
     * server accepted.
     *
     * It is not load-bearing either, which is why a rolled-back day deletion
     * needs no undo here. Notes are rendered inside a column, so a day removed
     * optimistically stops drawing its notes for free — and if that deletion
     * rolls back, the column returns with its notes still in state.
     *
     * Returns the same array when the day held nothing, so an unrelated deletion
     * re-renders no ribbons.
     */
    const pruneDay = useCallback(
        (dayId) => {
            const notes = notesOf(stateRef.current);
            const kept = notes.filter((note) => note.dayId !== dayId);

            if (kept.length === notes.length) return;

            dispatch(notesReplaced(kept));
        },
        [dispatch]
    );

    /** One day's notes, for the plane inside that column. */
    const notesForDay = useCallback(
        (dayId) => state.notes.filter((note) => note.dayId === dayId),
        [state.notes]
    );

    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), [dispatch]);

    // Memoised for the same reason `useCalendar`'s return is: the page holds it
    // across renders that the independently-loaded calendar and pool cause, and
    // a fresh object each time would re-render every ribbon for nothing.
    return useMemo(
        () => ({
            state,
            reload: load,
            createNote,
            updateNote,
            deleteNote,
            pruneDay,
            notesForDay,
            dismissActionError,
        }),
        [
            state,
            load,
            createNote,
            updateNote,
            deleteNote,
            pruneDay,
            notesForDay,
            dismissActionError,
        ]
    );
};

export default useCalendarNotes;
