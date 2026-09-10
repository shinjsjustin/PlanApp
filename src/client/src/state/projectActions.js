// Action creators for `projectReducer`. Components and hooks dispatch these
// rather than object literals, so the payload shape lives in one place.

import { PROJECT_ACTIONS } from './projectReducer';
import { createTempId, isTempId } from '../lib/tempIds';

// Re-exported rather than redefined: these moved to `lib/tempIds` when the
// calendar needed them too, and every existing caller imports them from here.
export { createTempId, isTempId };

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
