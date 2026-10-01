import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendar from './useCalendar';
import { ApiError, api } from '../lib/api';
import { CALENDAR_STATUS } from '../state/calendarReducer';

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

const days = [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }];

const booking = {
    id: 5,
    kind: 'todo',
    todoId: 5,
    dayId: 1,
    startMinutes: 540,
    durationMinutes: 60,
    text: 'Wire up the token refresh',
    status: 'incomplete',
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 5,
    sequenceTitle: 'Session handling',
};

const sequenceBooking = {
    id: 6,
    kind: 'sequence',
    todoId: null,
    dayId: 1,
    startMinutes: 600,
    durationMinutes: 60,
    text: null,
    status: 'incomplete',
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 5,
    sequenceTitle: 'Session handling',
};

const calendar = { days, items: [booking, sequenceBooking] };

const renderReady = async () => {
    api.get.mockResolvedValue(calendar);

    const view = renderHook(() => useCalendar());
    await waitFor(() => expect(view.result.current.state.status).toBe(CALENDAR_STATUS.ready));

    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useCalendar with sequence bookings', () => {
    test('sends a mixed gesture with placements and both release lists', async () => {
        const { result } = await renderReady();
        const third = { ...booking, id: 7, todoId: 8, startMinutes: 700 };
        api.get.mockResolvedValue({ days, items: [booking, sequenceBooking, third] });
        await act(() => result.current.reload());
        const next = {
            days,
            items: [{ ...booking, startMinutes: 560 }, { ...third, startMinutes: 700 }],
        };
        api.put.mockResolvedValue(next);

        await act(() => result.current.commit(next));

        expect(api.put).toHaveBeenCalledWith('/calendar/items', {
            appendDays: 0,
            placements: [{ todoId: 5, dayId: 1, startMinutes: 560, durationMinutes: 60 }],
            unschedule: [],
            unscheduleSequences: [5],
        });
    });

    test('commits a sequence-only release rather than treating it as a no-op', async () => {
        const { result } = await renderReady();
        const next = { days, items: [booking] };
        api.put.mockResolvedValue(next);

        await act(() => result.current.commit(next));

        expect(api.put).toHaveBeenCalledWith('/calendar/items', {
            appendDays: 0,
            placements: [],
            unschedule: [],
            unscheduleSequences: [5],
        });
    });

    test('unschedule with a sequence key deletes the sequence booking only', async () => {
        const { result } = await renderReady();
        api.delete.mockResolvedValue({});

        await act(() => result.current.unschedule('sequence:5'));

        expect(api.delete).toHaveBeenCalledWith('/calendar/items/sequences/5');
        expect(result.current.state.items.map((item) => item.kind)).toEqual(['todo']);
    });

    test('unschedule with a numeric todoId deletes the to-do booking only', async () => {
        const { result } = await renderReady();
        api.delete.mockResolvedValue({});

        await act(() => result.current.unschedule(5));

        expect(api.delete).toHaveBeenCalledWith('/calendar/items/5');
        expect(result.current.state.items.map((item) => item.kind)).toEqual(['sequence']);
    });

    test.each([
        ['sequence:5', 2],
        [5, 2],
    ])('rolls back a failed unschedule of %s', async (ref, count) => {
        const { result } = await renderReady();
        api.delete.mockRejectedValue(new ApiError('Could not release it.', 500));

        await act(() => result.current.unschedule(ref));

        expect(result.current.state.items).toHaveLength(count);
        expect(result.current.state.actionError).toBe('Could not release it.');
    });
});
