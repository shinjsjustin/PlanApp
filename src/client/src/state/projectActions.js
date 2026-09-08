// Action creators for `projectReducer`. Components and hooks dispatch these
// rather than object literals, so the payload shape lives in one place.

import { PROJECT_ACTIONS } from './projectReducer';

/**
 * Ids for entities that exist optimistically but not yet on the server.
 *
 * They are negative because MySQL auto-increment ids never are, so an
 * unreconciled entity can never be confused with a stored one — and a stale
 * reference to one is a lookup miss rather than a wrong row.
 */
let lastTempId = 0;

export const createTempId = () => {
    lastTempId -= 1;

    return lastTempId;
};

export const isTempId = (id) => id < 0;

export const loadStarted = () => ({ type: PROJECT_ACTIONS.loadStarted });

export const loadSucceeded = (graph) => ({ type: PROJECT_ACTIONS.loadSucceeded, graph });

export const loadFailed = (error) => ({ type: PROJECT_ACTIONS.loadFailed, error });

export const entityAdded = (collection, entity) => ({
    type: PROJECT_ACTIONS.entityAdded,
    collection,
    entity,
});

export const entityUpdated = (collection, id, changes) => ({
    type: PROJECT_ACTIONS.entityUpdated,
    collection,
    id,
    changes,
});

export const entityRemoved = (collection, id) => ({
    type: PROJECT_ACTIONS.entityRemoved,
    collection,
    id,
});

export const entityReconciled = (collection, tempId, entity) => ({
    type: PROJECT_ACTIONS.entityReconciled,
    collection,
    tempId,
    entity,
});

export const rolledBack = (snapshot, error) => ({
    type: PROJECT_ACTIONS.rolledBack,
    snapshot,
    error,
});

export const actionErrorCleared = () => ({ type: PROJECT_ACTIONS.actionErrorCleared });

/**
 * Something worth saying that is not a failure — the connections a sequence move
 * cost, say. Deliberately not `actionError`: that one is painted as an error and
 * announced as an alert, and a successful move is neither.
 */
export const noticeRaised = (message) => ({ type: PROJECT_ACTIONS.noticeRaised, message });

export const noticeCleared = () => ({ type: PROJECT_ACTIONS.noticeCleared });
