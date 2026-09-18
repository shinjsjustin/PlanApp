import { act, renderHook, waitFor } from '@testing-library/react';

import { ApiError, api } from '../lib/api';
import { PROJECT_STATUS } from '../state/projectReducer';
import { entityRemoved, entityUpdated } from '../state/projectActions';
import useProjectGraph from './useProjectGraph';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            delete: jest.fn(),
        },
    };
});

const GRAPH = {
    project: { id: 1, title: 'Build a drone', description: null, todoCount: 0, completedTodoCount: 0 },
    layers: [{ id: 10, projectId: 1, title: 'Learning', position: 0 }],
    sequences: [
        { id: 100, projectId: 1, layerId: 10, title: 'Learn aerodynamics', isBlocked: false, position: 0 },
    ],
    todos: [],
};

/** A promise the test resolves by hand, so mid-flight state can be asserted. */
const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

const renderLoaded = async () => {
    api.get.mockResolvedValue(GRAPH);

    const rendered = renderHook(() => useProjectGraph(1));
    await waitFor(() => expect(rendered.result.current.state.status).toBe(PROJECT_STATUS.ready));

    return rendered;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useProjectGraph', () => {
    describe('loading', () => {
        test('loads the graph for the project and normalises it', async () => {
            // Act
            const { result } = await renderLoaded();

            // Assert
            expect(api.get).toHaveBeenCalledWith('/projects/1');
            expect(result.current.state.project).toEqual(GRAPH.project);
            expect(result.current.state.sequences[100]).toEqual(GRAPH.sequences[0]);
        });

        test('surfaces a failed load as a retryable error rather than an empty canvas', async () => {
            // Arrange
            api.get.mockRejectedValue(new ApiError('Could not reach the server.', 0));

            // Act
            const { result } = renderHook(() => useProjectGraph(1));

            // Assert
            await waitFor(() =>
                expect(result.current.state.status).toBe(PROJECT_STATUS.error)
            );
            expect(result.current.state.loadError).toBe('Could not reach the server.');
        });

        test('reload asks the server again', async () => {
            // Arrange
            api.get.mockRejectedValueOnce(new ApiError('Could not reach the server.', 0));
            const { result } = renderHook(() => useProjectGraph(1));
            await waitFor(() => expect(result.current.state.status).toBe(PROJECT_STATUS.error));
            api.get.mockResolvedValue(GRAPH);

            // Act
            await act(async () => {
                result.current.reload();
            });

            // Assert
            await waitFor(() => expect(result.current.state.status).toBe(PROJECT_STATUS.ready));
            expect(api.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('createEntity', () => {
        test('shows the new entity before the server answers, then reconciles its id', async () => {
            // Arrange
            const { result } = await renderLoaded();
            const pending = deferred();
            api.post.mockReturnValue(pending.promise);

            // Act — dispatch optimistically...
            let call;
            await act(async () => {
                call = result.current.createEntity('layers', {
                    path: '/projects/1/layers',
                    optimistic: { projectId: 1, title: 'Untitled layer', position: 1 },
                });
            });

            // Assert — a temporary negative id is already on the canvas.
            const tempIds = Object.keys(result.current.state.layers).map(Number).filter((id) => id < 0);
            expect(tempIds).toHaveLength(1);

            // Act — ...then the server answers.
            const saved = { id: 20, projectId: 1, title: 'Untitled layer', position: 1 };
            await act(async () => {
                pending.resolve(saved);
                await call;
            });

            // Assert — re-keyed to the server's id, still carrying the
            // temporary one so the row it drew stays the same component.
            expect(result.current.state.layers[20]).toEqual({
                ...saved,
                clientKey: tempIds[0],
            });
            expect(Object.keys(result.current.state.layers)).toEqual(['10', '20']);
        });

        test('rolls the optimistic entity back and raises the error when the POST fails', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.post.mockRejectedValue(new ApiError('Something went wrong.', 500));

            // Act
            let created;
            await act(async () => {
                created = await result.current.createEntity('layers', {
                    path: '/projects/1/layers',
                    optimistic: { projectId: 1, title: 'Untitled layer', position: 1 },
                });
            });

            // Assert
            expect(created).toBeNull();
            expect(Object.keys(result.current.state.layers)).toEqual(['10']);
            expect(result.current.state.actionError).toBe('Something went wrong.');
        });
    });

    describe('updateEntity', () => {
        test('applies the change immediately and keeps the server\'s row', async () => {
            // Arrange
            const { result } = await renderLoaded();
            const saved = { ...GRAPH.sequences[0], title: 'Renamed' };
            api.patch.mockResolvedValue(saved);

            // Act
            await act(async () => {
                await result.current.updateEntity('sequences', 100, {
                    path: '/sequences/100',
                    changes: { title: 'Renamed' },
                });
            });

            // Assert
            expect(api.patch).toHaveBeenCalledWith('/sequences/100', { title: 'Renamed' });
            expect(result.current.state.sequences[100]).toEqual(saved);
        });

        test('puts the old value back when the PATCH fails', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.patch.mockRejectedValue(new ApiError('Rename failed.', 500));

            // Act
            await act(async () => {
                await result.current.updateEntity('sequences', 100, {
                    path: '/sequences/100',
                    changes: { title: 'Renamed' },
                });
            });

            // Assert
            expect(result.current.state.sequences[100].title).toBe('Learn aerodynamics');
            expect(result.current.state.actionError).toBe('Rename failed.');
        });
    });

    describe('removeEntity', () => {
        test('removes the entity and leaves it removed when the DELETE succeeds', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.delete.mockResolvedValue({ id: 100 });

            // Act
            await act(async () => {
                await result.current.removeEntity('sequences', 100, { path: '/sequences/100' });
            });

            // Assert
            expect(result.current.state.sequences[100]).toBeUndefined();
        });

        test('brings the entity back when the DELETE fails', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.delete.mockRejectedValue(new ApiError('Delete failed.', 500));

            // Act
            await act(async () => {
                await result.current.removeEntity('sequences', 100, { path: '/sequences/100' });
            });

            // Assert
            expect(result.current.state.sequences[100]).toEqual(GRAPH.sequences[0]);
            expect(result.current.state.actionError).toBe('Delete failed.');
        });
    });

    describe('cascading changes', () => {
        test('applies the extra actions alongside the entity it creates', async () => {
            // Arrange — inserting a layer above an existing one has to push that
            // one down, or two layers claim the same position.
            const { result } = await renderLoaded();
            api.post.mockResolvedValue({
                id: 20,
                projectId: 1,
                title: 'Untitled layer',
                position: 0,
            });

            // Act
            await act(async () => {
                await result.current.createEntity('layers', {
                    path: '/projects/1/layers',
                    optimistic: { projectId: 1, title: 'Untitled layer', position: 0 },
                    also: [entityUpdated('layers', 10, { position: 1 })],
                });
            });

            // Assert
            expect(result.current.state.layers[10].position).toBe(1);
        });

        test('applies the extra actions alongside the entity it removes', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.delete.mockResolvedValue({ id: 10 });

            // Act
            await act(async () => {
                await result.current.removeEntity('layers', 10, {
                    path: '/layers/10',
                    also: [entityRemoved('sequences', 100)],
                });
            });

            // Assert
            expect(result.current.state.layers[10]).toBeUndefined();
            expect(result.current.state.sequences[100]).toBeUndefined();
        });

        test('rolls the extra actions back too when the request fails', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.delete.mockRejectedValue(new ApiError('Delete failed.', 500));

            // Act
            await act(async () => {
                await result.current.removeEntity('layers', 10, {
                    path: '/layers/10',
                    also: [entityRemoved('sequences', 100)],
                });
            });

            // Assert — a half-applied cascade would be worse than none at all.
            expect(result.current.state.layers[10]).toEqual(GRAPH.layers[0]);
            expect(result.current.state.sequences[100]).toEqual(GRAPH.sequences[0]);
            expect(result.current.state.actionError).toBe('Delete failed.');
        });
    });

    describe('dismissActionError', () => {
        test('clears the toast', async () => {
            // Arrange
            const { result } = await renderLoaded();
            api.patch.mockRejectedValue(new ApiError('Rename failed.', 500));
            await act(async () => {
                await result.current.updateEntity('sequences', 100, {
                    path: '/sequences/100',
                    changes: { title: 'Renamed' },
                });
            });

            // Act
            await act(async () => {
                result.current.dismissActionError();
            });

            // Assert
            expect(result.current.state.actionError).toBeNull();
        });
    });
});
