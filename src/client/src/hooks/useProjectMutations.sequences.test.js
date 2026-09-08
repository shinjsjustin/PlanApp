import { act } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { GRAPH, positionsIn, renderMutations } from '../testUtils/mutationsHarness';

// The sequence verbs of `useProjectMutations` (spec section 4.4).

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
        },
    };
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('addSequence', () => {
    test('appends an untitled sequence to the end of its layer', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockResolvedValue({
            id: 102,
            projectId: 1,
            layerId: 10,
            title: 'Untitled sequence',
            description: null,
            isBlocked: false,
            position: 2,
        });

        // Act
        await act(async () => {
            await result.current.addSequence(10);
        });

        // Assert
        expect(api.post).toHaveBeenCalledWith('/layers/10/sequences', {});
        expect(positionsIn(stateOf().sequences, (s) => s.layerId === 10)).toEqual([
            [100, 0],
            [101, 1],
            [102, 2],
        ]);
    });

    test('shows the sequence before the server answers', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.post.mockReturnValue(new Promise(() => {}));

        // Act
        await act(async () => {
            result.current.addSequence(10);
        });

        // Assert — a temporary negative id stands in until the real one arrives.
        const temps = Object.values(stateOf().sequences).filter((s) => s.id < 0);
        expect(temps).toEqual([
            expect.objectContaining({ layerId: 10, title: 'Untitled sequence', position: 2 }),
        ]);
    });
});

describe('renameSequence', () => {
    test('patches the title', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], title: 'Aerodynamics' });

        // Act
        await act(async () => {
            await result.current.renameSequence(100, 'Aerodynamics');
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { title: 'Aerodynamics' });
        expect(stateOf().sequences[100].title).toBe('Aerodynamics');
    });
});

describe('setSequenceBlocked', () => {
    test('sets the manual override', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], isBlocked: true });

        // Act
        await act(async () => {
            await result.current.setSequenceBlocked(100, true);
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { isBlocked: true });
        expect(stateOf().sequences[100].isBlocked).toBe(true);
    });

    test('clears it again', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], isBlocked: false });

        // Act
        await act(async () => {
            await result.current.setSequenceBlocked(100, false);
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { isBlocked: false });
        expect(stateOf().sequences[100].isBlocked).toBe(false);
    });
});

// Folding a card is stored on the sequence so a canvas comes back the way it was
// left. It is not status — it is chrome — but it travels the same optimistic
// path as everything else, because a chevron that waited on the network would
// feel broken.
describe('setSequenceCollapsed', () => {
    test('folds a card shut', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], isCollapsed: true });

        // Act
        await act(async () => {
            await result.current.setSequenceCollapsed(100, true);
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { isCollapsed: true });
        expect(stateOf().sequences[100].isCollapsed).toBe(true);
    });

    test('opens it again', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], isCollapsed: false });

        // Act
        await act(async () => {
            await result.current.setSequenceCollapsed(100, false);
        });

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/sequences/100', { isCollapsed: false });
        expect(stateOf().sequences[100].isCollapsed).toBe(false);
    });

    // Folding is chrome, and the manual block is status. Setting one must never
    // disturb the other.
    test('leaves the blocked override alone', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.patch.mockResolvedValue({ ...GRAPH.sequences[0], isCollapsed: true });

        // Act
        await act(async () => {
            await result.current.setSequenceCollapsed(100, true);
        });

        // Assert
        expect(stateOf().sequences[100].isBlocked).toBe(GRAPH.sequences[0].isBlocked);
    });
});

// The notice a move raises is glue: `cascadeSequenceMove` derives which edges
// break (tested on its own) and the reducer stores/clears a notice (tested on
// its own) — what is untested anywhere else is the counting and pluralization
// in between, so these three cases characterise it directly rather than
// through the one path `criticalFlow.spec.js` happens to drag through.
describe('moveSequence', () => {
    test('raises no notice when the move costs no connections', async () => {
        // Arrange — a same-layer reorder of a sequence with no edges of its own
        const { result, raiseNotice } = await renderMutations();
        api.put.mockResolvedValue({ ...GRAPH.sequences[1], position: 0 });

        // Act
        await act(async () => {
            await result.current.moveSequence(101, { layerId: 10, position: 0 });
        });

        // Assert
        expect(raiseNotice).not.toHaveBeenCalled();
    });

    test('raises a singular notice when exactly one connection is removed', async () => {
        // Arrange — moving "Learn aerodynamics" into Design leaves its one edge
        // pointing sideways instead of down
        const { result, raiseNotice } = await renderMutations();
        api.put.mockResolvedValue({ ...GRAPH.sequences[0], layerId: 20, position: 1 });

        // Act
        await act(async () => {
            await result.current.moveSequence(100, { layerId: 20, position: 1 });
        });

        // Assert
        expect(raiseNotice).toHaveBeenCalledTimes(1);
        const [message] = raiseNotice.mock.calls[0];
        expect(message).toContain('Learn aerodynamics');
        expect(message).toContain('1 connection was removed');
        expect(message).not.toContain('1 connections');
    });

    test('raises a plural notice when two or more connections are removed', async () => {
        // Arrange — tether "Design rotor system" to both learning sequences,
        // then move it down where neither can reach it any more
        const { result, raiseNotice } = await renderMutations();
        api.post.mockResolvedValue({ id: 501, projectId: 1, parentId: 101, childId: 200 });

        await act(async () => {
            await result.current.toggleEdge(101, 200);
        });

        api.put.mockResolvedValue({ ...GRAPH.sequences[2], layerId: 10, position: 2 });

        // Act
        await act(async () => {
            await result.current.moveSequence(200, { layerId: 10, position: 2 });
        });

        // Assert
        expect(raiseNotice).toHaveBeenCalledTimes(1);
        const [message] = raiseNotice.mock.calls[0];
        expect(message).toContain('Design rotor system');
        expect(message).toContain('2 connections were removed');
    });
});

describe('deleteSequence', () => {
    test('returns its to-dos to the unorganized panel and closes the gap', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.delete.mockResolvedValue({ id: 100 });

        // Act
        await act(async () => {
            await result.current.deleteSequence(100);
        });

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/sequences/100');
        expect(stateOf().todos[1001]).toMatchObject({ sequenceId: null, position: 1 });
        expect(stateOf().edges).toEqual({});
        expect(positionsIn(stateOf().sequences, (s) => s.layerId === 10)).toEqual([[101, 0]]);
    });

    test('puts the sequence and its to-dos back when the request fails', async () => {
        // Arrange
        const { result, stateOf } = await renderMutations();
        api.delete.mockRejectedValue(new ApiError('Delete failed.', 500));

        // Act
        await act(async () => {
            await result.current.deleteSequence(100);
        });

        // Assert
        expect(stateOf().sequences[100]).toEqual(GRAPH.sequences[0]);
        expect(stateOf().todos[1001]).toMatchObject({ sequenceId: 100, position: 0 });
        expect(stateOf().actionError).toBe('Delete failed.');
    });
});
