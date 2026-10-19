import { renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
    ...jest.requireActual('../lib/api'),
    api: { get: jest.fn() },
}));

const todoRow = (id, overrides = {}) => ({
    id,
    text: `Todo ${id}`,
    status: 'incomplete',
    position: 0,
    ...overrides,
});

const datedSequence = (id, todos, overrides = {}) => ({
    id,
    title: `Sequence ${id}`,
    date: '2999-01-05',
    owner: 'justin',
    description: null,
    isBlocked: false,
    layerId: 1,
    todos,
    ...overrides,
});

const loadSequence = async (sequence) => {
    api.get.mockResolvedValue([{ id: 2, title: 'Errands', datedSequences: [sequence] }]);
    const { result } = renderHook(() => usePool());
    await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

    return result.current.days[0].sequences[0];
};

describe('usePool visit length', () => {
    test('copies a numeric visitMinutes onto sequence and to-do pool items', async () => {
        const sequence = await loadSequence(
            datedSequence(4, [todoRow(7, { visitMinutes: 90 })], { visitMinutes: 45 }),
        );

        expect(sequence.visitMinutes).toBe(45);
        expect(sequence.todos[0].visitMinutes).toBe(90);
    });

    test('leaves out the visitMinutes key when the server sends none or a non-number', async () => {
        const sequence = await loadSequence(
            datedSequence(4, [todoRow(7), todoRow(8, { visitMinutes: null })], { visitMinutes: '60' }),
        );

        expect(sequence).not.toHaveProperty('visitMinutes');
        expect(sequence.todos[0]).not.toHaveProperty('visitMinutes');
        expect(sequence.todos[1]).not.toHaveProperty('visitMinutes');
    });
});
