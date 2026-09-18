import { initialProjectState, projectReducer } from './projectReducer';
import { loadSucceeded } from './projectActions';

// The fixture the cascade suites share.
//
// A create or delete on the canvas is never one entity changing on its own: the
// rows beside it shift to keep `position` dense, and deleting a layer or a
// sequence frees the to-dos filed under it. Those cascades are asserted one
// resource per suite, over this one graph.

export const GRAPH = {
    project: { id: 1, title: 'Build a drone', description: null, todoCount: 4, completedTodoCount: 0 },
    layers: [
        { id: 10, projectId: 1, title: 'Learning', position: 0 },
        { id: 20, projectId: 1, title: 'Design', position: 1 },
        { id: 30, projectId: 1, title: 'Build', position: 2 },
    ],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, title: 'Learn aerodynamics', description: null, isBlocked: false, position: 0 },
        { id: 101, projectId: 1, layerId: 10, title: 'Learn electronics', description: null, isBlocked: false, position: 1 },
        { id: 102, projectId: 1, layerId: 10, title: 'Learn network comms', description: null, isBlocked: false, position: 2 },
        { id: 200, projectId: 1, layerId: 20, title: 'Design rotor system', description: null, isBlocked: false, position: 0 },
    ],
    todos: [
        { id: 1000, projectId: 1, sequenceId: null, text: 'Loose', status: 'incomplete', position: 0 },
        { id: 1001, projectId: 1, sequenceId: 100, text: 'Read about lift', status: 'incomplete', position: 0 },
        { id: 1002, projectId: 1, sequenceId: 100, text: 'Read about drag', status: 'incomplete', position: 1 },
        { id: 1003, projectId: 1, sequenceId: 101, text: 'Ohm\'s law', status: 'incomplete', position: 0 },
    ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Applies a whole mutation's worth of actions, asserting on the way that the
 * state handed in is never written to — the rollback in `useProjectGraph` is a
 * plain reassignment of a snapshot, which only holds if nothing mutates.
 */
export const apply = (state, actions) => {
    const before = clone(state);

    const next = actions.reduce(projectReducer, state);

    expect(state).toEqual(before);
    return next;
};

/** The graph above, loaded into a reducer state, fresh for each test. */
export const loaded = () => projectReducer(initialProjectState, loadSucceeded(GRAPH));

/** A collection's entities as `[id, position]` pairs, in ascending position. */
export const positions = (collection) =>
    Object.values(collection)
        .map((entity) => [entity.id, entity.position])
        .sort((a, b) => a[1] - b[1]);
