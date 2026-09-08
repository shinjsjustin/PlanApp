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
export const COLLECTIONS = ['layers', 'sequences', 'todos', 'edges'];

export const PROJECT_ACTIONS = {
    loadStarted: 'loadStarted',
    loadSucceeded: 'loadSucceeded',
    loadFailed: 'loadFailed',
    entityAdded: 'entityAdded',
    entityUpdated: 'entityUpdated',
    entityRemoved: 'entityRemoved',
    entityReconciled: 'entityReconciled',
    rolledBack: 'rolledBack',
    actionErrorCleared: 'actionErrorCleared',
    noticeRaised: 'noticeRaised',
    noticeCleared: 'noticeCleared',
};

export const initialProjectState = {
    status: PROJECT_STATUS.idle,
    // The load failed and there is no graph to show — the page offers a retry.
    loadError: null,
    // A mutation failed and was rolled back — the page raises a toast.
    actionError: null,
    // A mutation succeeded but cost something worth mentioning — the page
    // raises a second, calmer toast.
    notice: null,
    project: null,
    layers: {},
    sequences: {},
    todos: {},
    edges: {},
};

/** The part of the state a rollback restores: the graph, not the UI status. */
export const snapshotOf = (state) => ({
    project: state.project,
    layers: state.layers,
    sequences: state.sequences,
    todos: state.todos,
    edges: state.edges,
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
        layers: keyById(graph.layers),
        sequences: keyById(graph.sequences),
        todos: keyById(graph.todos),
        edges: keyById(graph.edges),
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
    //
    // Any standing notice goes with it. A notice describes what a change cost —
    // "2 connections were removed" — and a rolled-back change cost nothing, so
    // leaving it up would be a lie about a graph that has just been restored.
    [PROJECT_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        ...snapshot,
        actionError: error,
        notice: null,
    }),

    [PROJECT_ACTIONS.actionErrorCleared]: (state) => ({ ...state, actionError: null }),

    [PROJECT_ACTIONS.noticeRaised]: (state, { message }) => ({ ...state, notice: message }),

    [PROJECT_ACTIONS.noticeCleared]: (state) => ({ ...state, notice: null }),
};

export const projectReducer = (state, action) => {
    const handler = handlers[action.type];

    if (!handler) {
        throw new Error(`Unknown project action "${action.type}"`);
    }

    return handler(state, action);
};
