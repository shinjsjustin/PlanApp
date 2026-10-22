import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendarReminders from './useCalendarReminders';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return { ...actual, api: { get: jest.fn() } };
});

const reminder = (id, dueDate, dueTime) => ({ id, title: `r${id}`, dueDate, dueTime, priority: 'low' });

const renderLoaded = async (answer) => {
    api.get.mockResolvedValue(answer);

    const view = renderHook(() => useCalendarReminders());
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await act(async () => {});

    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('GETs open reminders once and returns blocks for a date', async () => {
    const { result } = await renderLoaded({
        reminders: [reminder(1, '2026-10-22', '09:30'), reminder(2, '2026-10-22', null)],
    });

    expect(api.get).toHaveBeenCalledWith('/reminders?status=open');
    expect(result.current.remindersForDate('2026-10-22')).toEqual([
        { id: 1, title: 'r1', startMinutes: 570, priority: 'low' },
    ]);
});

test('returns one shared empty array for dates with none, and stable arrays otherwise', async () => {
    const { result, rerender } = await renderLoaded({ reminders: [reminder(1, '2026-10-22', '09:30')] });

    expect(result.current.remindersForDate('2026-01-01')).toEqual([]);
    expect(result.current.remindersForDate('2026-01-01')).toBe(result.current.remindersForDate('2026-01-02'));

    const first = result.current.remindersForDate('2026-10-22');
    rerender();
    expect(result.current.remindersForDate('2026-10-22')).toBe(first);
    expect(api.get).toHaveBeenCalledTimes(1);
});

test.each([
    ['an array', []],
    ['a string', 'nope'],
    ['null', null],
    ['an object without reminders', {}],
    ['reminders not an array', { reminders: 'x' }],
])('counts %s as no reminders', async (_name, answer) => {
    const { result } = await renderLoaded(answer);

    expect(result.current.remindersForDate('2026-10-22')).toEqual([]);
    expect(result.current.loadError).toBeNull();
});

test('a failed load sets loadError and reload retries', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useCalendarReminders());

    await waitFor(() => expect(result.current.loadError).toBe('offline'));
    expect(result.current.remindersForDate('2026-10-22')).toEqual([]);

    api.get.mockResolvedValueOnce({ reminders: [reminder(1, '2026-10-22', '10:00')] });
    await act(async () => {
        await result.current.reload();
    });

    expect(result.current.loadError).toBeNull();
    expect(result.current.remindersForDate('2026-10-22')).toHaveLength(1);
});
