import { initialProjectState, projectReducer } from './projectReducer';
import { loadSucceeded, pinsSet, sequencesReconciled } from './projectActions';

const GRAPH = {
    project: { id: 1, title: 'Drone' },
    layers: [{ id: 10, projectId: 1, title: 'L', position: 0 }],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, isPinned: false, position: 0 },
        { id: 101, projectId: 1, layerId: 10, isPinned: false, position: 1 },
    ],
    todos: [
        { id: 1, sequenceId: 100, isPinned: false },
        { id: 2, sequenceId: 100, isPinned: false },
    ],
};

const loaded = () => projectReducer(initialProjectState, loadSucceeded(GRAPH));

describe('pinsSet', () => {
    test('flips isPinned on exactly the named todos and sequences', () => {
        const next = projectReducer(loaded(), pinsSet({ todoIds: [2], sequenceIds: [101] }, true));

        expect(next.todos[1].isPinned).toBe(false);
        expect(next.todos[2].isPinned).toBe(true);
        expect(next.sequences[100].isPinned).toBe(false);
        expect(next.sequences[101].isPinned).toBe(true);
    });

    test('pinning a sequence leaves its todos unpinned', () => {
        const next = projectReducer(loaded(), pinsSet({ todoIds: [], sequenceIds: [100] }, true));

        expect(next.sequences[100].isPinned).toBe(true);
        expect(next.todos[1].isPinned).toBe(false);
        expect(next.todos[2].isPinned).toBe(false);
    });

    test('does not mutate the previous state', () => {
        const state = loaded();
        projectReducer(state, pinsSet({ todoIds: [1], sequenceIds: [100] }, true));

        expect(state.sequences[100].isPinned).toBe(false);
        expect(state.todos[1].isPinned).toBe(false);
    });

    test('throws for an unknown sequence id', () => {
        expect(() => projectReducer(loaded(), pinsSet({ todoIds: [], sequenceIds: [999] }, true)))
            .toThrow('No sequences entity with id 999');
    });

    test('throws for an unknown todo id', () => {
        expect(() => projectReducer(loaded(), pinsSet({ todoIds: [999], sequenceIds: [] }, true)))
            .toThrow('No todos entity with id 999');
    });
});

describe('sequencesReconciled', () => {
    test('merges saved fields into the named sequences only', () => {
        const next = projectReducer(
            loaded(),
            sequencesReconciled([{ id: 100, isPinned: true, pinnedAt: 'now' }])
        );

        expect(next.sequences[100]).toEqual({
            id: 100, projectId: 1, layerId: 10, isPinned: true, pinnedAt: 'now', position: 0,
        });
        expect(next.sequences[101].isPinned).toBe(false);
    });

    test('throws for a sequence that is not in the graph', () => {
        expect(() => projectReducer(loaded(), sequencesReconciled([{ id: 999 }])))
            .toThrow('No sequences entity with id 999');
    });
});
