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

    test('reload re-fetches and can recover from a prior error', async () => {
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
    });
});
