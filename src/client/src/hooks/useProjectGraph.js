import { useCallback, useEffect, useReducer, useRef } from 'react';

import { api } from '../lib/api';
import { createTempId } from '../lib/tempIds';
import { initialProjectState, PROJECT_ACTIONS, projectReducer, snapshotOf } from '../state/projectReducer';
import {
    actionErrorCleared,
    entityAdded,
    entityReconciled,
    entityRemoved,
    entityUpdated,
    loadFailed,
    loadStarted,
    loadSucceeded,
    projectUpdated,
    rolledBack,
    todosPinned,
    todosReconciled,
} from '../state/projectActions';

// Loads a project's graph and applies changes to it optimistically
// (spec sections 4.5 and 4.7).
//
// Mutations apply immediately. Overlapping requests share a short-lived journal:
// replay their field changes in invocation order, omitting failures. This keeps
// the normal snapshot rollback/toast without erasing unrelated or newer edits.
// Cascades contain absolute positions, not replayable server operations. If
// structural mutations overlap, read the authoritative graph once they all
// settle rather than attempting to reconstruct the server's ordering locally.
// A load/navigation generation prevents old settlements touching a new graph.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

const writtenFields = (actions, collection, id) => actions.flatMap((action) => {
    if (action.type === PROJECT_ACTIONS.todosPinned && collection === 'todos' &&
        action.todoIds.some((todoId) => String(todoId) === id)) return ['isPinned'];
    if (action.type === PROJECT_ACTIONS.projectUpdated && collection === 'project') {
        return Object.keys(action.changes);
    }
    if (action.type === PROJECT_ACTIONS.entityUpdated && action.collection === collection &&
        String(action.id) === id) {
        const fields = Object.keys(action.changes);
        // Status owns its server-derived timestamp too, including an explicit
        // null on reopen and while a newer status request is still pending.
        return collection === 'todos' && fields.includes('status')
            ? [...fields, 'completedAt'] : fields;
    }
    return [];
});

// Keep only this operation's changes when replaying overlapping requests. Full
// server rows may contain another request's optimistic (or now stale) fields.
const graphChanges = (before, after, actions = []) => ['project', 'layers', 'sequences', 'todos'].flatMap(
    (collection) => {
        const previous = collection === 'project' ? { project: before.project } : before[collection];
        const next = collection === 'project' ? { project: after.project } : after[collection];
        return [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap((id) => {
            const written = writtenFields(actions, collection, id);
            if (previous[id] === next[id] && written.length === 0) return [];
            const fields = [...new Set([...Object.keys(previous[id] || {}), ...Object.keys(next[id] || {}), ...written])]
                .filter((key) => written.includes(key) || !Object.is(previous[id]?.[key], next[id]?.[key]));
            return [{ collection, id, value: next[id], fields, replaces: !previous[id] || !next[id] }];
        });
    }
);

const applyChanges = (graph, changes) => changes.reduce((current, change) => {
    const { collection, id, value, fields, replaces } = change;
    const entities = collection === 'project' ? { project: current.project } : current[collection];
    const entity = replaces ? value : fields.reduce((row, key) => {
        if (Object.prototype.hasOwnProperty.call(value, key)) return { ...row, [key]: value[key] };
        return Object.fromEntries(Object.entries(row).filter(([field]) => field !== key));
    }, entities[id]);
    const updated = entity === undefined
        ? Object.fromEntries(Object.entries(entities).filter(([key]) => key !== id))
        : { ...entities, [id]: entity };
    return { ...current, [collection]: collection === 'project' ? entity : updated };
}, graph);

const writesField = (entry, change, field) => entry.changes.some((own) =>
    own.collection === change.collection && own.id === change.id &&
    (own.replaces || own.fields.includes(field)));

const replayMutations = ({ base, entries }) => entries.reduce((graph, entry) => {
    if (entry.status === 'failed') return graph;
    const reconciled = (entry.reconciled || []).map((change) => ({
        ...change,
        fields: change.fields.filter((field) => writesField(entry, change, field) ||
            !entries.some((other) => other !== entry && writesField(other, change, field))),
    }));
    return applyChanges(applyChanges(graph, entry.changes), reconciled);
}, base);

const isStructural = (actions) => actions.some((action) =>
    action.type === PROJECT_ACTIONS.entityAdded || action.type === PROJECT_ACTIONS.entityRemoved ||
    (action.type === PROJECT_ACTIONS.entityUpdated &&
        ['position', 'sequenceId', 'layerId'].some((field) => field in action.changes)));

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
    const generationRef = useRef(0);
    const journalRef = useRef(null);
    const commit = useCallback((action) => {
        stateRef.current = projectReducer(stateRef.current, action);
        dispatch(action);
    }, []);

    const load = useCallback(async () => {
        requestedIdRef.current = projectId;
        const generation = ++generationRef.current;
        journalRef.current = null;
        commit(loadStarted());

        try {
            const graph = await api.get(`/projects/${projectId}`);

            if (generationRef.current !== generation) return;

            commit(loadSucceeded(graph));
        } catch (err) {
            if (generationRef.current !== generation) return;

            commit(loadFailed(messageOf(err)));
        }
    }, [projectId, commit]);

    useEffect(() => {
        load();
        return () => {
            generationRef.current += 1;
            journalRef.current = null;
        };
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
     * Returns the server's entity, or null on failure or an obsolete generation.
     * Current-project failures are surfaced through `actionError`.
     */
    const mutate = useCallback(async ({ apply, send, onSuccess }) => {
        if (requestedIdRef.current !== projectId || stateRef.current.status !== 'ready') return null;
        const generation = generationRef.current;
        const before = stateRef.current;
        const actions = [].concat(apply);
        actions.forEach(commit);
        const optimistic = stateRef.current;
        const entry = {
            changes: graphChanges(before, optimistic, actions),
            structural: isStructural(actions), status: 'pending',
        };
        const journal = journalRef.current || { base: snapshotOf(before), entries: [] };
        journalRef.current = { ...journal, entries: [...journal.entries, entry] };

        const settle = (result) => {
            const current = journalRef.current;
            const updated = {
                ...current,
                entries: current.entries.map((item) => item === entry ? { ...entry, ...result } : item),
            };
            commit(rolledBack(replayMutations(updated), result.error ?? stateRef.current.actionError));
            const isPending = updated.entries.some((item) => item.status === 'pending');
            journalRef.current = isPending ? updated : null;
            // The load marks the graph unavailable for edits until the read
            // settles. No mutation can be silently overwritten by that read.
            if (!isPending && updated.entries.filter((item) => item.structural).length > 1) return load();
        };

        try {
            const saved = await send();
            if (generationRef.current !== generation) return null;
            const responseAction = onSuccess?.(saved);
            const reconciled = responseAction
                ? graphChanges(optimistic, projectReducer(optimistic, responseAction), [responseAction]) : [];
            await settle({ status: 'saved', reconciled });
            return saved;
        } catch (err) {
            if (generationRef.current !== generation) return null;
            await settle({ status: 'failed', error: messageOf(err) });
            return null;
        }
    }, [commit, projectId, load]);

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
     * Changes the project's own fields. The response is the projects-home CARD
     * shape, which carries a `pinnedTodos` snapshot the graph does not own — pins
     * live on the to-dos themselves, and nothing here would ever refresh that
     * copy. Reconcile the project's fields and drop the card's extras.
     */
    const updateProject = useCallback(
        (changes) =>
            mutate({
                apply: projectUpdated(changes),
                send: () => api.patch(`/projects/${projectId}`, changes),
                onSuccess: ({ pinnedTodos, ...projectFields }) => projectUpdated(projectFields),
            }),
        [mutate, projectId]
    );

    const setTodosPinned = useCallback(
        (todoIds, isPinned) =>
            mutate({
                apply: todosPinned(todoIds, isPinned),
                send: () => api.put(`/projects/${projectId}/todos/pins`, { todoIds, isPinned }),
                onSuccess: ({ todos }) => todosReconciled(todos),
            }),
        [mutate, projectId]
    );

    // Every loose to-do goes at once. If the server removed a different set than
    // the one this client could see, read the authoritative graph again.
    const removeUnorganizedTodos = useCallback(async () => {
        const removedIds = Object.values(stateRef.current.todos)
            .filter((todo) => todo.sequenceId === null)
            .map((todo) => todo.id);
        const saved = await mutate({
            apply: removedIds.map((id) => entityRemoved('todos', id)),
            send: () => api.delete(`/projects/${projectId}/todos/unorganized`),
        });
        const isSameSet = saved?.ids?.length === removedIds.length &&
            removedIds.every((id) => saved.ids.includes(id));
        if (saved && !isSameSet) await load();
        return saved;
    }, [mutate, projectId, load]);

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
    const dismissActionError = useCallback(() => commit(actionErrorCleared()), [commit]);

    return {
        state,
        reload: load,
        createEntity,
        updateEntity,
        updateProject,
        setTodosPinned,
        removeUnorganizedTodos,
        removeEntity,
        dismissActionError,
    };
};

export default useProjectGraph;
