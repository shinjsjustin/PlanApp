// Action creators for `calendarReducer`. Components and hooks dispatch these
// rather than object literals, so the payload shape lives in one place.

import { CALENDAR_ACTIONS } from './calendarReducer';

export const loadStarted = () => ({ type: CALENDAR_ACTIONS.loadStarted });

export const loadSucceeded = (calendar) => ({
    type: CALENDAR_ACTIONS.loadSucceeded,
    calendar,
});

export const loadFailed = (error) => ({ type: CALENDAR_ACTIONS.loadFailed, error });

/** The settled result of one gesture: both collections, together. */
export const scheduleReplaced = (schedule) => ({
    type: CALENDAR_ACTIONS.scheduleReplaced,
    schedule,
});

export const rolledBack = (snapshot, error) => ({
    type: CALENDAR_ACTIONS.rolledBack,
    snapshot,
    error,
});

/**
 * Raises a mutation's failure message without touching the schedule — for a
 * failure whose rollback would do more harm than the failure did.
 */
export const actionErrorRaised = (error) => ({
    type: CALENDAR_ACTIONS.actionErrorRaised,
    error,
});

export const actionErrorCleared = () => ({ type: CALENDAR_ACTIONS.actionErrorCleared });
