import { renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
    ...jest.requireActual('../lib/api'),
    api: { get: jest.fn() },
}));

const pinnedTodo = (id, overrides = {}) => ({
    id,
    text: `Todo ${id}`,
    status: 'incomplete',
    sequenceId: null,
    sequenceTitle: null,
    isPinned: true,
    ...overrides,
});

const pinnedSequence = (id, overrides = {}) => ({
    id,
    title: `Sequence ${id}`,
    description: '',
    isBlocked: false,
    isPinned: true,
    layerId: 1,
    position: 0,
    todos: [],
    ...overrides,
});

const loadPool = async (project) => {
    api.get.mockResolvedValue([{ id: 2, title: 'Errands', ...project }]);
    const { result } = renderHook(() => usePool());
    await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

    return result.current.projects[0];
};

describe('usePool visit length', () => {
    test('copies a numeric visitMinutes onto to-do and sequence pool items', async () => {
        const project = await loadPool({
            pinnedTodos: [pinnedTodo(7, { visitMinutes: 90 })],
            pinnedSequences: [pinnedSequence(4, { visitMinutes: 45 })],
        });

        expect(project.todos[0].visitMinutes).toBe(90);
        expect(project.sequences[0].visitMinutes).toBe(45);
    });

    test('leaves out the visitMinutes key when the server sends none or a non-number', async () => {
        const project = await loadPool({
            pinnedTodos: [pinnedTodo(7), pinnedTodo(8, { visitMinutes: null })],
            pinnedSequences: [pinnedSequence(4, { visitMinutes: '60' })],
        });

        expect(project.todos[0]).not.toHaveProperty('visitMinutes');
        expect(project.todos[1]).not.toHaveProperty('visitMinutes');
        expect(project.sequences[0]).not.toHaveProperty('visitMinutes');
    });
});
