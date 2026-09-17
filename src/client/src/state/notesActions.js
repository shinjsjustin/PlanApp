// Action creators for `notesReducer`. Components and hooks dispatch these rather
// than object literals, so the payload shape lives in one place — the same
// division `calendarActions.js` makes.

import { NOTES_ACTIONS } from './notesReducer';

export const loadStarted = () => ({ type: NOTES_ACTIONS.loadStarted });

export const loadSucceeded = (notes) => ({ type: NOTES_ACTIONS.loadSucceeded, notes });

export const loadFailed = (error) => ({ type: NOTES_ACTIONS.loadFailed, error });

/** The whole list after one change — a create, a rename, a move, a delete. */
export const notesReplaced = (notes) => ({ type: NOTES_ACTIONS.notesReplaced, notes });

export const rolledBack = (snapshot, error) => ({
    type: NOTES_ACTIONS.rolledBack,
    snapshot,
    error,
});

/**
 * Raises a failure's message without touching the notes — for a failure whose
 * rollback would do more harm than the failure did.
 */
export const actionErrorRaised = (error) => ({
    type: NOTES_ACTIONS.actionErrorRaised,
    error,
});

export const actionErrorCleared = () => ({ type: NOTES_ACTIONS.actionErrorCleared });
