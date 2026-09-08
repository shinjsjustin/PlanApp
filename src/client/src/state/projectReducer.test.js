import {
    PROJECT_STATUS,
    clientKeyOf,
    initialProjectState,
    projectReducer,
    snapshotOf,
} from './projectReducer';
import {
    actionErrorCleared,
    createTempId,
    entityAdded,
    entityReconciled,
    entityRemoved,
    entityUpdated,
    loadFailed,
    loadStarted,
    loadSucceeded,
    noticeCleared,
    noticeRaised,
    rolledBack,
} from './projectActions';

const GRAPH = {
    project: { id: 1, title: 'Build a drone', description: null, todoCount: 1, completedTodoCount: 0 },
    layers: [
        { id: 10, projectId: 1, title: 'Learning', position: 0 },
        { id: 20, projectId: 1, title: 'Design', position: 1 },
    ],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, title: 'Learn aerodynamics', isBlocked: false, position: 0 },
    ],
    edges: [{ id: 500, projectId: 1, parentId: 100, childId: 101 }],
    todos: [
        { id: 1000, projectId: 1, sequenceId: 100, text: 'Read about lift', status: 'incomplete', position: 0 },
    ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Every dispatch in this file goes through here, so the immutability rule is
 * asserted on every single case rather than in one token test: the state object
 * handed in must be identical afterwards.
 */
const dispatch = (state, action) => {
    const before = clone(state);

    const next = projectReducer(state, action);

    expect(state).toEqual(before);
    return next;
};

const loadedState = () => dispatch(initialProjectState, loadSucceeded(GRAPH));

describe('projectReducer', () => {
    describe('loading', () => {
        test('starts in idle with nothing loaded', () => {
            expect(initialProjectState).toMatchObject({
                status: PROJECT_STATUS.idle,
                project: null,
                layers: {},
                sequences: {},
                todos: {},
                edges: {},
            });
        });

        test('loadStarted moves to loading and clears a previous failure', () => {
            // Arrange
            const failed = dispatch(initialProjectState, loadFailed('Could not reach the server.'));

            // Act
            const next = dispatch(failed, loadStarted());

            // Assert
            expect(next).toMatchObject({ status: PROJECT_STATUS.loading, loadError: null });
        });

        test('loadSucceeded normalises every collection by id', () => {
            // Act
            const next = loadedState();

            // Assert
            expect(next.status).toBe(PROJECT_STATUS.ready);
            expect(next.project).toEqual(GRAPH.project);
            expect(next.layers).toEqual({ 10: GRAPH.layers[0], 20: GRAPH.layers[1] });
            expect(next.sequences).toEqual({ 100: GRAPH.sequences[0] });
            expect(next.edges).toEqual({ 500: GRAPH.edges[0] });
            expect(next.todos).toEqual({ 1000: GRAPH.todos[0] });
        });

        test('loadSucceeded replaces a previously loaded graph rather than merging it', () => {
            // Arrange
            const loaded = loadedState();

            // Act
            const next = dispatch(loaded, loadSucceeded({ ...GRAPH, layers: [], sequences: [] }));

            // Assert
            expect(next.layers).toEqual({});
            expect(next.sequences).toEqual({});
        });

        test('loadFailed records the message and moves to error', () => {
            // Act
            const next = dispatch(initialProjectState, loadFailed('Could not reach the server.'));

            // Assert
            expect(next).toMatchObject({
                status: PROJECT_STATUS.error,
                loadError: 'Could not reach the server.',
            });
        });
    });

    describe('entityAdded', () => {
        test('inserts an entity without disturbing the others', () => {
            // Arrange
            const loaded = loadedState();
            const layer = { id: 30, projectId: 1, title: 'Build', position: 2 };

            // Act
            const next = dispatch(loaded, entityAdded('layers', layer));

            // Assert
            expect(next.layers[30]).toEqual(layer);
            expect(next.layers[10]).toBe(loaded.layers[10]);
        });

        test('replaces the collection object rather than writing into it', () => {
            // Arrange
            const loaded = loadedState();

            // Act
            const next = dispatch(loaded, entityAdded('layers', { id: 30, position: 2 }));

            // Assert
            expect(next.layers).not.toBe(loaded.layers);
            expect(loaded.layers[30]).toBeUndefined();
        });
    });

    describe('entityUpdated', () => {
        test('merges only the fields named', () => {
            // Arrange
            const loaded = loadedState();

            // Act
            const next = dispatch(loaded, entityUpdated('sequences', 100, { isBlocked: true }));

            // Assert
            expect(next.sequences[100]).toEqual({
                ...GRAPH.sequences[0],
                isBlocked: true,
            });
        });

        test('builds a new entity object rather than writing into the old one', () => {
            // Arrange
            const loaded = loadedState();

            // Act
            const next = dispatch(loaded, entityUpdated('sequences', 100, { title: 'Renamed' }));

            // Assert
            expect(next.sequences[100]).not.toBe(loaded.sequences[100]);
            expect(loaded.sequences[100].title).toBe('Learn aerodynamics');
        });

        test('throws rather than silently ignoring an unknown id', () => {
            // Arrange
            const loaded = loadedState();

            // Act & Assert
            expect(() => projectReducer(loaded, entityUpdated('sequences', 999, {}))).toThrow(
                /999/
            );
        });
    });

    describe('entityRemoved', () => {
        test('drops the entity and leaves the rest alone', () => {
            // Arrange
            const loaded = loadedState();

            // Act
            const next = dispatch(loaded, entityRemoved('layers', 20));

            // Assert
            expect(next.layers).toEqual({ 10: GRAPH.layers[0] });
            expect(loaded.layers[20]).toBeDefined();
        });

        test('throws rather than silently ignoring an unknown id', () => {
            expect(() => projectReducer(loadedState(), entityRemoved('layers', 999))).toThrow(
                /999/
            );
        });
    });

    describe('optimistic create', () => {
        test('reconcile swaps the temporary id for the server\'s entity', () => {
            // Arrange — the create lands immediately under a negative id.
            const loaded = loadedState();
            const tempId = createTempId();
            const optimistic = dispatch(
                loaded,
                entityAdded('sequences', {
                    id: tempId,
                    projectId: 1,
                    layerId: 10,
                    title: 'Untitled sequence',
                    isBlocked: false,
                    position: 1,
                })
            );
            expect(optimistic.sequences[tempId]).toBeDefined();

            // Act — the server answers with the real row.
            const saved = {
                id: 101,
                projectId: 1,
                layerId: 10,
                title: 'Untitled sequence',
                isBlocked: false,
                position: 1,
            };
            const next = dispatch(optimistic, entityReconciled('sequences', tempId, saved));

            // Assert — the server's row, under the server's id, carrying the id
            // it was on screen under so the card is not re-keyed with it.
            expect(next.sequences[tempId]).toBeUndefined();
            expect(next.sequences[101]).toEqual({ ...saved, clientKey: tempId });
            expect(next.sequences[100]).toEqual(GRAPH.sequences[0]);
        });

        test('a reconciled entity keeps the client key it first appeared under', () => {
            // Arrange — a row that goes through reconcile more than once, as a
            // rollback and retry makes it.
            const tempId = createTempId();
            const optimistic = dispatch(
                loadedState(),
                entityAdded('sequences', { id: tempId, projectId: 1, layerId: 10, position: 1 })
            );

            // Act
            const once = dispatch(
                optimistic,
                entityReconciled('sequences', tempId, { id: 101, projectId: 1, layerId: 10 })
            );
            const twice = dispatch(
                once,
                entityReconciled('sequences', 101, { id: 102, projectId: 1, layerId: 10 })
            );

            // Assert — still the original temporary id, not the intermediate one.
            expect(clientKeyOf(twice.sequences[102])).toBe(tempId);
        });

        test('rollback restores the graph exactly as it was and raises the error', () => {
            // Arrange
            const loaded = loadedState();
            const snapshot = snapshotOf(loaded);
            const tempId = createTempId();
            const optimistic = dispatch(
                loaded,
                entityAdded('sequences', { id: tempId, projectId: 1, layerId: 10, position: 1 })
            );

            // Act — the POST failed.
            const next = dispatch(
                optimistic,
                rolledBack(snapshot, 'Something went wrong. Please try again.')
            );

            // Assert
            expect(next.sequences).toEqual(loaded.sequences);
            expect(next.layers).toEqual(loaded.layers);
            expect(next.todos).toEqual(loaded.todos);
            expect(next.edges).toEqual(loaded.edges);
            expect(next.project).toEqual(loaded.project);
            expect(next.actionError).toBe('Something went wrong. Please try again.');
        });

        test('reconcile throws when the temporary id is not there', () => {
            expect(() =>
                projectReducer(loadedState(), entityReconciled('sequences', -99, { id: 101 }))
            ).toThrow(/-99/);
        });
    });

    describe('rollback of an update and a delete', () => {
        test('restores an overwritten field', () => {
            // Arrange
            const loaded = loadedState();
            const snapshot = snapshotOf(loaded);
            const optimistic = dispatch(loaded, entityUpdated('sequences', 100, { title: 'Nope' }));

            // Act
            const next = dispatch(optimistic, rolledBack(snapshot, 'Rename failed.'));

            // Assert
            expect(next.sequences[100].title).toBe('Learn aerodynamics');
        });

        test('brings a removed entity back', () => {
            // Arrange
            const loaded = loadedState();
            const snapshot = snapshotOf(loaded);
            const optimistic = dispatch(loaded, entityRemoved('layers', 20));

            // Act
            const next = dispatch(optimistic, rolledBack(snapshot, 'Delete failed.'));

            // Assert
            expect(next.layers[20]).toEqual(GRAPH.layers[1]);
        });
    });

    describe('actionErrorCleared', () => {
        test('dismisses the toast without touching the graph', () => {
            // Arrange
            const loaded = loadedState();
            const failed = dispatch(loaded, rolledBack(snapshotOf(loaded), 'Nope.'));

            // Act
            const next = dispatch(failed, actionErrorCleared());

            // Assert
            expect(next.actionError).toBeNull();
            expect(next.layers).toEqual(loaded.layers);
        });
    });

    describe('guards', () => {
        test('throws on an unknown action type rather than returning state unchanged', () => {
            expect(() => projectReducer(initialProjectState, { type: 'nonsense' })).toThrow(
                /nonsense/
            );
        });

        test('throws on a collection that does not exist', () => {
            expect(() =>
                projectReducer(initialProjectState, entityAdded('widgets', { id: 1 }))
            ).toThrow(/widgets/);
        });
    });
});

describe('the notice channel', () => {
    test('raises a notice', () => {
        // Arrange & Act
        const after = projectReducer(initialProjectState, noticeRaised('2 connections were removed.'));

        // Assert
        expect(after.notice).toBe('2 connections were removed.');
    });

    test('clears a notice', () => {
        // Arrange
        const raised = projectReducer(initialProjectState, noticeRaised('Something happened.'));

        // Act
        const after = projectReducer(raised, noticeCleared());

        // Assert
        expect(after.notice).toBeNull();
    });

    test('drops a standing notice when a mutation rolls back', () => {
        // Arrange — the notice describes a change that is about to be undone.
        const raised = projectReducer(initialProjectState, noticeRaised('2 connections were removed.'));
        const snapshot = { layers: {}, sequences: {}, todos: {}, edges: {} };

        // Act
        const after = projectReducer(raised, rolledBack(snapshot, 'Move failed.'));

        // Assert — a notice claiming the edges went would be a lie once they are back.
        expect(after.notice).toBeNull();
        expect(after.actionError).toBe('Move failed.');
    });
});

describe('createTempId', () => {
    test('hands out negative ids so they can never collide with a server id', () => {
        expect(createTempId()).toBeLessThan(0);
    });

    test('never hands out the same id twice', () => {
        const ids = [createTempId(), createTempId(), createTempId()];

        expect(new Set(ids).size).toBe(3);
    });
});
