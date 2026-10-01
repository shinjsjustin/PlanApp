// The project graph, normalised and immutable (spec section 4.7).
//
// Entities live keyed by id in one object per collection; ordering is derived
// from `position` at render time rather than stored here, so a reorder is a
// field change and not a list rebuild.
//
// Every case constructs new objects. Nothing is ever written into the state it
// was handed — that is what makes the rollback below a plain assignment of a
// snapshot taken before the optimistic change.

export const PROJECT_STATUS = {
    idle: 'idle',
    loading: 'loading',
    ready: 'ready',
    error: 'error',
};

/** The normalised collections. Doubles as the allow-list for entity actions. */
export const COLLECTIONS = ['layers', 'sequences', 'todos'];

export const PROJECT_ACTIONS = {
    loadStarted: 'loadStarted',
    loadSucceeded: 'loadSucceeded',
    loadFailed: 'loadFailed',
    entityAdded: 'entityAdded',
    entityUpdated: 'entityUpdated',
    projectUpdated: 'projectUpdated',
    todosPinned: 'todosPinned',
    todosReconciled: 'todosReconciled',
    pinsSet: 'pinsSet',
    sequencesReconciled: 'sequencesReconciled',
    entityRemoved: 'entityRemoved',
    entityReconciled: 'entityReconciled',
    rolledBack: 'rolledBack',
    actionErrorCleared: 'actionErrorCleared',
};

export const initialProjectState = {
    status: PROJECT_STATUS.idle,
    // The load failed and there is no graph to show — the page offers a retry.
    loadError: null,
    // A mutation failed and was rolled back — the page raises a toast.
    actionError: null,
    project: null,
    layers: {},
    sequences: {},
    todos: {},
};

/** The part of the state a rollback restores: the graph, not the UI status. */
export const snapshotOf = (state) => ({
    project: state.project,
    layers: state.layers,
    sequences: state.sequences,
    todos: state.todos,
});

/**
 * The key a list renders an entity under — which is not the same question as
 * what the collection is keyed by.
 *
 * An optimistic create appears under a temporary negative id and is re-keyed to
 * the server's id when it lands. Keyed by `id`, that swap unmounts the card and
 * mounts a new one, taking with it everything the user was in the middle of: a
 * half-typed title, the debounced save it had scheduled, an expanded body. None
 * of that is an error anything could report, which is exactly why it has to be
 * prevented rather than surfaced (spec section 5).
 *
 * `clientKey` is the id the entity first appeared under. Rows that arrive from
 * the server already carry their final id and never need one, so this falls
 * back to `id` for them.
 */
export const clientKeyOf = (entity) => entity.clientKey ?? entity.id;

const keyById = (entities) =>
    entities.reduce((byId, entity) => ({ ...byId, [entity.id]: entity }), {});

// Authoritative reloads replace server fields, but must not remount rows created
// in this session. Never carry identity across projects or resurrect absent rows.
const loadedCollection = (state, graph, collection) => keyById(graph[collection].map((entity) => {
    const previous = state.project?.id === graph.project.id ? state[collection][entity.id] : null;
    return previous?.clientKey === undefined ? entity : { ...entity, clientKey: previous.clientKey };
}));

const assertCollection = (collection) => {
    if (!COLLECTIONS.includes(collection)) {
        throw new Error(
            `Unknown collection "${collection}". Expected one of: ${COLLECTIONS.join(', ')}`
        );
    }
};

/**
 * A mutation aimed at an entity that is not there is a bug in the caller, not
 * something to apply to nothing and call success. It throws so the mistake
 * surfaces where it happened.
 */
const assertPresent = (state, collection, id) => {
    if (state[collection][id] === undefined) {
        throw new Error(`No ${collection} entity with id ${id}`);
    }
};

const withoutKey = (collection, id) =>
    Object.fromEntries(Object.entries(collection).filter(([key]) => key !== String(id)));

const withPinned = (state, collection, ids, isPinned) => {
    ids.forEach((id) => assertPresent(state, collection, id));
    const selectedIds = new Set(ids.map(String));
    return Object.fromEntries(
        Object.entries(state[collection]).map(([id, entity]) => [
            id,
            selectedIds.has(id) ? { ...entity, isPinned } : entity,
        ])
    );
};

const withSaved = (state, collection, saved) => {
    saved.forEach((entity) => assertPresent(state, collection, entity.id));
    const savedById = keyById(saved);
    return Object.fromEntries(
        Object.entries(state[collection]).map(([id, entity]) => [
            id,
            savedById[id] ? { ...entity, ...savedById[id] } : entity,
        ])
    );
};

const handlers = {
    [PROJECT_ACTIONS.loadStarted]: (state) => ({
        ...state,
        status: PROJECT_STATUS.loading,
        loadError: null,
    }),

    [PROJECT_ACTIONS.loadSucceeded]: (state, { graph }) => ({
        ...state,
        status: PROJECT_STATUS.ready,
        loadError: null,
        project: graph.project,
        layers: loadedCollection(state, graph, 'layers'),
        sequences: loadedCollection(state, graph, 'sequences'),
        todos: loadedCollection(state, graph, 'todos'),
    }),

    [PROJECT_ACTIONS.loadFailed]: (state, { error }) => ({
        ...state,
        status: PROJECT_STATUS.error,
        loadError: error,
    }),

    [PROJECT_ACTIONS.entityAdded]: (state, { collection, entity }) => {
        assertCollection(collection);

        return {
            ...state,
            [collection]: { ...state[collection], [entity.id]: entity },
        };
    },

    [PROJECT_ACTIONS.entityUpdated]: (state, { collection, id, changes }) => {
        assertCollection(collection);
        assertPresent(state, collection, id);

        return {
            ...state,
            [collection]: {
                ...state[collection],
                [id]: { ...state[collection][id], ...changes },
            },
        };
    },

    [PROJECT_ACTIONS.projectUpdated]: (state, { changes }) => ({
        ...state,
        project: { ...state.project, ...changes },
    }),

    [PROJECT_ACTIONS.todosPinned]: (state, { todoIds, isPinned }) => ({
        ...state,
        todos: withPinned(state, 'todos', todoIds, isPinned),
    }),

    [PROJECT_ACTIONS.pinsSet]: (state, { ids: { todoIds, sequenceIds }, isPinned }) => ({
        ...state,
        todos: withPinned(state, 'todos', todoIds, isPinned),
        sequences: withPinned(state, 'sequences', sequenceIds, isPinned),
    }),

    [PROJECT_ACTIONS.todosReconciled]: (state, { todos }) => ({
        ...state,
        todos: withSaved(state, 'todos', todos),
    }),

    [PROJECT_ACTIONS.sequencesReconciled]: (state, { sequences }) => ({
        ...state,
        sequences: withSaved(state, 'sequences', sequences),
    }),

    [PROJECT_ACTIONS.entityRemoved]: (state, { collection, id }) => {
        assertCollection(collection);
        assertPresent(state, collection, id);

        return { ...state, [collection]: withoutKey(state[collection], id) };
    },

    // The create succeeded: drop the temporary negative id and key the row the
    // server actually stored, which may differ in more than its id. The id it
    // first appeared under is carried across as `clientKey`, so re-keying the
    // collection does not re-key the component (see `clientKeyOf`).
    [PROJECT_ACTIONS.entityReconciled]: (state, { collection, tempId, entity }) => {
        assertCollection(collection);
        assertPresent(state, collection, tempId);

        const reconciled = { ...entity, clientKey: clientKeyOf(state[collection][tempId]) };

        return {
            ...state,
            [collection]: { ...withoutKey(state[collection], tempId), [entity.id]: reconciled },
        };
    },

    // The mutation failed: put back the snapshot taken before it was applied and
    // hand the message to the page to surface.
    [PROJECT_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        ...snapshot,
        actionError: error,
    }),

    [PROJECT_ACTIONS.actionErrorCleared]: (state) => ({ ...state, actionError: null }),
};

export const projectReducer = (state, action) => {
    const handler = handlers[action.type];

    if (!handler) {
        throw new Error(`Unknown project action "${action.type}"`);
    }

    return handler(state, action);
};
