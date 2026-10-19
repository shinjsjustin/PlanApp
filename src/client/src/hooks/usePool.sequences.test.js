import { renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
    api: { get: jest.fn() },
}));

// Far-future and far-past dates keep these independent of the real clock.
const PAST = '2000-01-01';
const SOON = '2999-01-05';
const LATER = '2999-03-09';

const datedSequence = (id, title, overrides = {}) => ({
    id,
    title,
    date: SOON,
    owner: 'justin',
    description: 'Keeps sessions fresh',
    isBlocked: false,
    layerId: 4,
    visitMinutes: null,
    todos: [{ id: 11, text: 'Expire tokens', status: 'incomplete', position: 0, visitMinutes: null }],
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

describe('usePool dated sequences', () => {
    test('reads /projects once, with no query string', async () => {
        await renderPool([]);

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/projects');
    });

    test('maps a sequence to a pool item', async () => {
        const { result } = await renderPool([{
            id: 2,
            title: 'Auth rewrite',
            datedSequences: [datedSequence(9, 'Session handling')],
        }]);

        expect(result.current.days).toEqual([{
            date: SOON,
            sequences: [{
                kind: 'sequence',
                sequenceId: 9,
                todoId: null,
                text: 'Session handling',
                title: 'Session handling',
                description: 'Keeps sessions fresh',
                isBlocked: false,
                layerId: 4,
                date: SOON,
                projectId: 2,
                projectTitle: 'Auth rewrite',
                todos: [{
                    id: 11,
                    todoId: 11,
                    text: 'Expire tokens',
                    status: 'incomplete',
                    position: 0,
                    projectId: 2,
                    projectTitle: 'Auth rewrite',
                    sequenceId: 9,
                    sequenceTitle: 'Session handling',
                }],
            }],
        }]);
    });

    test('orders days ascending and keeps server order within a day', async () => {
        const { result } = await renderPool([
            {
                id: 2,
                title: 'A',
                datedSequences: [datedSequence(1, 'Later', { date: LATER }), datedSequence(2, 'Soon A')],
            },
            { id: 3, title: 'B', datedSequences: [datedSequence(3, 'Soon B')] },
        ]);

        expect(result.current.days.map((day) => day.date)).toEqual([SOON, LATER]);
        expect(result.current.days[0].sequences.map((sequence) => sequence.sequenceId)).toEqual([2, 3]);
    });

    test("drops Bourne's sequences and sequences dated before today", async () => {
        const { result } = await renderPool([{
            id: 2,
            title: 'A',
            datedSequences: [
                datedSequence(1, 'Mine'),
                datedSequence(2, 'Theirs', { owner: 'bourne' }),
                datedSequence(3, 'Old', { date: PAST }),
            ],
        }]);

        expect(result.current.days.flatMap((day) => day.sequences.map((s) => s.sequenceId))).toEqual([1]);
    });

    test('yields no days when nothing qualifies', async () => {
        const { result } = await renderPool([
            { id: 2, title: 'A', datedSequences: [datedSequence(2, 'Old', { date: PAST })] },
        ]);

        expect(result.current.days).toEqual([]);
    });

    test('copies the server todos instead of aliasing them', async () => {
        const source = [{ id: 2, title: 'A', datedSequences: [datedSequence(9, 'S')] }];
        const { result } = await renderPool(source);

        const mapped = result.current.days[0].sequences[0].todos;
        expect(mapped).not.toBe(source[0].datedSequences[0].todos);
        expect(mapped[0]).not.toBe(source[0].datedSequences[0].todos[0]);
    });
});
