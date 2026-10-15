import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendar from './useCalendar';
import { ApiError, api } from '../lib/api';
import { CALENDAR_STATUS } from '../state/calendarReducer';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

const PAST = '2000-01-01';
const FUTURE = '2999-01-01';

const booking = (id, dayId) => ({
    id, todoId: id + 100, dayId, startMinutes: 540, durationMinutes: 60, text: `Todo ${id}`,
    status: 'incomplete', projectId: 2, projectTitle: 'P', sequenceId: null, sequenceTitle: null,
});

const calendar = {
    days: [
        { id: 1, position: 0, date: PAST, createdAt: '2026-09-09T08:00:00.000Z' },
        { id: 2, position: 1, date: '2000-01-02', createdAt: '2026-09-09T08:00:00.000Z' },
        { id: 3, position: 2, date: FUTURE, createdAt: '2026-09-09T08:00:00.000Z' },
    ],
    items: [booking(5, 1), booking(6, 3)],
};

const saved = {
    days: [{ id: 3, position: 0, date: FUTURE, createdAt: '2026-09-09T08:00:00.000Z' }],
    items: [booking(6, 3)],
};

const renderReady = async (options) => {
    api.get.mockResolvedValue(calendar);

    const view = renderHook(() => useCalendar(options));
    await waitFor(() => expect(view.result.current.state.status).toBe(CALENDAR_STATUS.ready));

    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('clearPastDays', () => {
    test('removes past days at once and posts to clear-past', async () => {
        let settle;
        api.post.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
        const { result } = await renderReady();

        let pending;
        act(() => { pending = result.current.clearPastDays(); });

        expect(api.post).toHaveBeenCalledWith('/calendar/days/clear-past', {});
        expect(result.current.state.days.map((d) => d.id)).toEqual([3]);
        expect(result.current.state.items.map((i) => i.id)).toEqual([6]);

        await act(async () => { settle(saved); await pending; });
    });

    test('installs the calendar the server answers', async () => {
        const answer = { ...saved, days: [{ ...saved.days[0], createdAt: 'server' }] };
        api.post.mockResolvedValue(answer);
        const { result } = await renderReady();

        await act(async () => { await result.current.clearPastDays(); });

        expect(result.current.state.days).toEqual(answer.days);
    });

    test('calls onDayDeleted once per removed day id on success', async () => {
        api.post.mockResolvedValue(saved);
        const onDayDeleted = jest.fn();
        const { result } = await renderReady({ onDayDeleted });

        await act(async () => { await result.current.clearPastDays(); });

        expect(onDayDeleted).toHaveBeenCalledTimes(2);
        expect(onDayDeleted).toHaveBeenCalledWith(1);
        expect(onDayDeleted).toHaveBeenCalledWith(2);
    });

    test('rolls back, raises actionError and prunes nothing on failure', async () => {
        api.post.mockRejectedValue(new ApiError('Nope', 500));
        const onDayDeleted = jest.fn();
        const { result } = await renderReady({ onDayDeleted });

        await act(async () => { await result.current.clearPastDays(); });

        expect(result.current.state.days.map((d) => d.id)).toEqual([1, 2, 3]);
        expect(result.current.state.actionError).toBe('Nope');
        expect(onDayDeleted).not.toHaveBeenCalled();
    });

    test('does not install a stale answer over a write that settled meanwhile', async () => {
        let settle;
        api.post.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
        api.delete.mockResolvedValue({});
        const staleAnswer = {
            days: [
                { id: 3, position: 0, date: FUTURE, createdAt: '2026-09-09T08:00:00.000Z' },
            ],
            items: [booking(6, 3)],
        };
        const { result } = await renderReady();

        let pending;
        act(() => { pending = result.current.clearPastDays(); });
        await act(async () => { await result.current.deleteDay(3); });
        await act(async () => { settle(staleAnswer); await pending; });

        expect(result.current.state.days).toEqual([]);
        expect(result.current.state.items).toEqual([]);
    });

    test('keeps temp-id days when trimming a stale answer', async () => {
        let settle;
        api.post.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
        api.post.mockReturnValueOnce(new Promise(() => {}));
        const { result } = await renderReady();

        let pending;
        act(() => { pending = result.current.clearPastDays(); });
        act(() => { result.current.addDay(); });
        await act(async () => { settle(saved); await pending; });

        const ids = result.current.state.days.map((d) => d.id);
        expect(ids).toHaveLength(2);
        expect(ids[0]).toBe(3);
    });

    test('calls onDayDeleted only for days the server dropped, not ones it kept', async () => {
        const kept = {
            days: [
                { id: 1, position: 0, date: PAST, createdAt: '2026-09-09T08:00:00.000Z' },
                saved.days[0],
            ],
            items: [booking(5, 1), booking(6, 3)],
        };
        api.post.mockResolvedValue(kept);
        const onDayDeleted = jest.fn();
        const { result } = await renderReady({ onDayDeleted });

        await act(async () => { await result.current.clearPastDays(); });

        expect(onDayDeleted).toHaveBeenCalledTimes(1);
        expect(onDayDeleted).toHaveBeenCalledWith(2);
        expect(result.current.state.days.map((d) => d.id)).toEqual([1, 3]);
    });
});
