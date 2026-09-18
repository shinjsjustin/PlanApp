import { useCallback, useEffect, useReducer, useRef } from 'react';

import { api } from '../lib/api';
import { createTempId } from '../lib/tempIds';
import { initialProjectState, projectReducer, snapshotOf } from '../state/projectReducer';
import {
    actionErrorCleared,
    entityAdded,
    entityReconciled,
    entityRemoved,
    entityUpdated,
    loadFailed,
    loadStarted,
    loadSucceeded,
    rolledBack,
} from '../state/projectActions';

// Loads a project's graph and applies changes to it optimistically
// (spec sections 4.5 and 4.7).
//
// Each mutation dispatches its change immediately, sends the request, and then
// either reconciles the server's row in or rolls the whole graph back to the
// snapshot taken beforehand and raises `actionError` for the page to surface.
// Nothing fails quietly: a rejected request always ends in either a restored
// graph and a message, or a rethrow the caller asked for.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

const useProjectGraph = (projectId) => {
    const [state, dispatch] = useReducer(projectReducer, initialProjectState);

    // Mutations need the graph as it is at the moment they run, to snapshot it
    // for a possible rollback. `state` in a callback closure is the render's
    // value, which may already be stale by then; this ref is not.
    const stateRef = useRef(state);
    stateRef.current = state;

    // Guards against a response for a project the page has already navigated
    // away from landing in the reducer.
    const requestedIdRef = useRef(projectId);

    const load = useCallback(async () => {
        requestedIdRef.current = projectId;
        dispatch(loadStarted());

        try {
            const graph = await api.get(`/projects/${projectId}`);

            if (requestedIdRef.current !== projectId) return;

            dispatch(loadSucceeded(graph));
        } catch (err) {
            if (requestedIdRef.current !== projectId) return;

            dispatch(loadFailed(messageOf(err)));
        }
    }, [projectId]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Runs one optimistic mutation: apply, send, then settle. `onSuccess` turns
     * the server's response into the action that finalises the change, and is
     * omitted when the optimistic change was already the final one.
     *
     * `apply` may be one action or several, because one mutation is rarely one
     * row: inserting a layer pushes the ones beneath it down, and deleting a
     * sequence frees its to-dos. The snapshot is taken before any of them, so a
     * failure restores the whole set rather than leaving half a cascade behind.
     *
     * Returns the server's entity, or null when the request failed and the
     * graph was restored — the failure itself is surfaced through `actionError`.
     */
    const mutate = useCallback(async ({ apply, send, onSuccess }) => {
        const snapshot = snapshotOf(stateRef.current);

        [].concat(apply).forEach(dispatch);

        try {
            const saved = await send();

            if (onSuccess) dispatch(onSuccess(saved));

            return saved;
        } catch (err) {
            dispatch(rolledBack(snapshot, messageOf(err)));

            return null;
        }
    }, []);

    /**
     * Creates an entity. It appears at once under a temporary negative id, which
     * the server's real row replaces on reconcile.
     *
     * `optimistic` is the entity to show meanwhile; `body` is the request
     * payload, defaulting to those same fields. `also` carries whatever else the
     * create moves — the layers an insert pushes down, say.
     */
    const createEntity = useCallback(
        (collection, { path, optimistic, body, also = [] }) => {
            const tempId = createTempId();

            return mutate({
                apply: [entityAdded(collection, { ...optimistic, id: tempId }), ...also],
                send: () => api.post(path, body ?? optimistic),
                onSuccess: (saved) => entityReconciled(collection, tempId, saved),
            });
        },
        [mutate]
    );

    /**
     * Changes an entity. `changes` is applied immediately and then replaced by
     * whatever the server stored, which may differ (a trimmed title, say).
     *
     * `method` is `patch` for the usual field edit and `put` where the endpoint
     * replaces something outright — `/todos/:id/move` replaces a to-do's whole
     * placement. `also` carries whatever else the change moves: the rest of a
     * to-do's old list closing up behind it, and its new one opening a slot.
     */
    const updateEntity = useCallback(
        (collection, id, { path, changes, body, method = 'patch', also = [] }) =>
            mutate({
                apply: [entityUpdated(collection, id, changes), ...also],
                send: () => api[method](path, body ?? changes),
                onSuccess: (saved) => entityUpdated(collection, id, saved),
            }),
        [mutate]
    );

    /**
     * Deletes an entity. `also` carries the rest of the delete's fallout — the
     * sequences a layer takes with it, and the to-dos they return to the
     * unorganized panel.
     */
    const removeEntity = useCallback(
        (collection, id, { path, also = [] }) =>
            mutate({
                apply: [entityRemoved(collection, id), ...also],
                send: () => api.delete(path),
                // No `onSuccess`: the entity is already gone from the graph and
                // the response only confirms it.
            }),
        [mutate]
    );

    // Dismissed by hand. No timer: a toast that vanishes on its own is one more
    // race for the E2E suite and one more thing to miss.
    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), []);

    return {
        state,
        reload: load,
        createEntity,
        updateEntity,
        removeEntity,
        dismissActionError,
    };
};

export default useProjectGraph;
