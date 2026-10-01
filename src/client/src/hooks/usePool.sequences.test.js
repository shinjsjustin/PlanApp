import { renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
    api: { get: jest.fn() },
}));

const pinnedSequence = (id, title, overrides = {}) => ({
    id,
    title,
    description: 'Keeps sessions fresh',
    isBlocked: false,
    isPinned: true,
    layerId: 4,
    position: 1,
    todos: [{ id: 11, text: 'Expire tokens', status: 'incomplete', isPinned: false, position: 0 }],
    ...overrides,
});

const renderPool = async (payload) => {
    api.get.mockResolvedValue(payload);
    const view = renderHook(() => usePool());
    await waitFor(() => expect(view.result.current.status).toBe(POOL_STATUS.ready));
    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('usePool pinned sequences', () => {
    test('reads projects and pinned sequences in one request', async () => {
        await renderPool([]);

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/projects?include=pinnedSequences');
    });

    test('maps each pinned sequence to a pool item, in the server order', async () => {
        const { result } = await renderPool([{
            id: 2,
            title: 'Auth rewrite',
            pinnedTodos: [],
            pinnedSequences: [
                pinnedSequence(9, 'Session handling'),
                pinnedSequence(5, 'Login', { description: null, isBlocked: true, layerId: 1, position: 0 }),
            ],
        }]);

        expect(result.current.projects[0].sequences).toEqual([
            {
                kind: 'sequence',
                sequenceId: 9,
                todoId: null,
                text: 'Session handling',
                title: 'Session handling',
                description: 'Keeps sessions fresh',
                isBlocked: false,
                isPinned: true,
                layerId: 4,
                position: 1,
                projectId: 2,
                projectTitle: 'Auth rewrite',
                todos: [{ id: 11, text: 'Expire tokens', status: 'incomplete', isPinned: false, position: 0 }],
            },
            {
                kind: 'sequence',
                sequenceId: 5,
                todoId: null,
                text: 'Login',
                title: 'Login',
                description: null,
                isBlocked: true,
                isPinned: true,
                layerId: 1,
                position: 0,
                projectId: 2,
                projectTitle: 'Auth rewrite',
                todos: [{ id: 11, text: 'Expire tokens', status: 'incomplete', isPinned: false, position: 0 }],
            },
        ]);
    });

    test('yields no sequences when the payload has no pinnedSequences', async () => {
        const { result } = await renderPool([{ id: 3, title: 'Bare', pinnedTodos: [] }]);

        expect(result.current.projects[0].sequences).toEqual([]);
    });

    test('copies the server todos instead of aliasing them', async () => {
        const source = [{
            id: 2,
            title: 'Auth rewrite',
            pinnedTodos: [],
            pinnedSequences: [pinnedSequence(9, 'Session handling')],
        }];
        const { result } = await renderPool(source);

        const mapped = result.current.projects[0].sequences[0].todos;
        expect(mapped).not.toBe(source[0].pinnedSequences[0].todos);
        expect(mapped[0]).not.toBe(source[0].pinnedSequences[0].todos[0]);
    });
});
