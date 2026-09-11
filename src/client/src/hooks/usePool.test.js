import { act, renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
        },
    };
});

const projects = [
    {
        id: 2,
        title: 'Auth rewrite',
        frontier: [
            {
                sequenceId: 9,
                sequenceTitle: 'Session handling',
                nextTodo: { id: 7, text: 'Wire up the token refresh' },
                isStalled: false,
            },
            {
                sequenceId: 10,
                sequenceTitle: 'Blocked work',
                nextTodo: null,
                isStalled: true,
            },
        ],
    },
    { id: 3, title: 'Empty project', frontier: [] },
];

/** Renders the hook with the pool already loaded. */
const renderReady = async () => {
    api.get.mockResolvedValue(projects);

    const view = renderHook(() => usePool());
    await waitFor(() => expect(view.result.current.status).toBe(POOL_STATUS.ready));

    return view;
};

/** A promise the test settles by hand, so mid-flight state can be asserted. */
const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('usePool', () => {
    test('offers one to-do per ready sequence', async () => {
        // Arrange + Act
        const { result } = await renderReady();

        // Assert
        expect(api.get).toHaveBeenCalledWith('/projects');
        expect(result.current.projects[0].todos).toEqual([
            {
                todoId: 7,
                text: 'Wire up the token refresh',
                projectId: 2,
                projectTitle: 'Auth rewrite',
                sequenceId: 9,
                sequenceTitle: 'Session handling',
            },
        ]);
    });

    test('leaves out a stalled sequence, which has nothing to schedule', async () => {
        // Arrange — every sequence in this project is stalled, so the
        // assertion below is about the filter alone: nothing here is a ready
        // sequence for the first test's fixture to already have pinned.
        api.get.mockResolvedValue([
            {
                id: 6,
                title: 'Every path blocked',
                frontier: [
                    {
                        sequenceId: 20,
                        sequenceTitle: 'Waiting on design',
                        nextTodo: null,
                        isStalled: true,
                    },
                    {
                        sequenceId: 21,
                        sequenceTitle: 'Waiting on legal',
                        nextTodo: null,
                        isStalled: true,
                    },
                ],
            },
        ]);

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        // Assert
        expect(result.current.projects[0].todos).toEqual([]);
    });

    test('leaves out a ready sequence with no to-dos at all, which is startable but empty', async () => {
        // Arrange — `nextTodo: null` with `isStalled: false`: `readyFrontier`
        // lists an incomplete sequence with zero to-dos as ready, same as any
        // other. A filter reading `!entry.isStalled` instead of `entry.nextTodo`
        // would let this entry through and then crash dereferencing `nextTodo.id`
        // on `null` — this is the case that substitution cannot see, since
        // nothing about it is stalled.
        api.get.mockResolvedValue([
            {
                id: 7,
                title: 'Nothing planned yet',
                frontier: [
                    {
                        sequenceId: 30,
                        sequenceTitle: 'Untouched',
                        nextTodo: null,
                        isStalled: false,
                    },
                ],
            },
        ]);

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        // Assert
        expect(result.current.projects[0].todos).toEqual([]);
    });

    test('keeps a project with nothing startable, so it can say so', async () => {
        // Arrange + Act
        const { result } = await renderReady();

        // Assert
        expect(result.current.projects[1]).toEqual({
            id: 3,
            title: 'Empty project',
            todos: [],
        });
    });

    test('reports a failed load without emptying the panel silently', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('Could not reach the server.'));

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));

        // Assert
        expect(result.current.loadError).toBe('Could not reach the server.');
        expect(result.current.projects).toEqual([]);
    });

    test('starts in the loading status before the request settles', () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        const { result } = renderHook(() => usePool());

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.loading);
        expect(result.current.projects).toEqual([]);
    });

    test('reload re-fetches, clearing the prior error along with the rows it left behind', async () => {
        // Arrange
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));

        // Act
        api.get.mockResolvedValueOnce(projects);
        await act(() => result.current.reload());

        // Assert
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));
        expect(result.current.projects[1].title).toBe('Empty project');
        expect(result.current.loadError).toBe('');
    });

    test('refresh re-reads behind the rows already on screen', async () => {
        // Arrange — a completed booking refills the pool, and that must not
        // unmount the rows: dropping to loading would collapse every open
        // accordion card over a read the user did not ask to wait for.
        const { promise, resolve } = deferred();
        const { result } = await renderReady();
        api.get.mockReturnValueOnce(promise);

        // Act
        act(() => {
            result.current.refresh();
        });

        // Assert — still ready, still listing what it listed, mid-flight.
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(result.current.projects[0].todos[0].todoId).toBe(7);

        // Act — and the answer replaces the rows without a reload.
        await act(async () => {
            resolve([
                {
                    id: 2,
                    title: 'Auth rewrite',
                    frontier: [
                        {
                            sequenceId: 9,
                            sequenceTitle: 'Session handling',
                            nextTodo: { id: 8, text: 'Rotate the signing keys' },
                            isStalled: false,
                        },
                    ],
                },
            ]);
            await promise;
        });

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(result.current.projects[0].todos[0].todoId).toBe(8);
    });

    test('a failed refresh surfaces on the pool rather than passing silently', async () => {
        // Arrange
        const { result } = await renderReady();
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));

        // Act
        await act(() => result.current.refresh());

        // Assert
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));
        expect(result.current.loadError).toBe('Could not reach the server.');
    });

    test('reload passes back through loading, since it only ever runs from the error screen', async () => {
        // Arrange — the retry button is the only thing that calls `reload`
        // today, and it is only reachable from the error screen, which has no
        // rows on it to preserve while the retry is in flight.
        const { promise, resolve } = deferred();
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));
        api.get.mockReturnValueOnce(promise);

        // Act
        act(() => {
            result.current.reload();
        });

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.loading);

        await act(async () => {
            resolve(projects);
            await promise;
        });
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));
    });
});
