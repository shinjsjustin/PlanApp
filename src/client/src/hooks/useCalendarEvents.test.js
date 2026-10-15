import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendarEvents from './useCalendarEvents';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return { ...actual, api: { get: jest.fn(), post: jest.fn() } };
});

const event = (id, dayId) => ({ id, dayId, title: `event ${id}` });

const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

const renderLoaded = async (answer) => {
    api.get.mockResolvedValue(answer);

    const view = renderHook(() => useCalendarEvents());
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

describe('loading', () => {
    test('GETs the events on mount and groups them by day', async () => {
        const { result } = await renderLoaded({
            events: [event(1, 10), event(2, 11), event(3, 10)],
        });

        expect(api.get).toHaveBeenCalledWith('/calendar/events');
        expect(result.current.eventsForDay(10)).toEqual([event(1, 10), event(3, 10)]);
        expect(result.current.eventsForDay(11)).toEqual([event(2, 11)]);
    });

    test('hands back the same empty array for days with none, and stable arrays otherwise', async () => {
        const { result, rerender } = await renderLoaded({ events: [event(1, 10)] });

        expect(result.current.eventsForDay(5)).toEqual([]);
        expect(result.current.eventsForDay(5)).toBe(result.current.eventsForDay(6));

        const first = result.current.eventsForDay(10);
        rerender();
        expect(result.current.eventsForDay(10)).toBe(first);
    });

    test.each([
        ['an array', []],
        ['an array with items', [event(1, 10)]],
        ['a string', 'nope'],
        ['null', null],
        ['an object without events', {}],
        ['an object whose events is not an array', { events: 'x' }],
    ])('counts %s as no events', async (_name, answer) => {
        const { result } = await renderLoaded(answer);

        expect(result.current.events).toEqual([]);
        expect(result.current.loadError).toBeNull();
    });

    test('a failed load sets loadError and reload retries', async () => {
        api.get.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useCalendarEvents());

        await waitFor(() => expect(result.current.loadError).toBe('offline'));

        api.get.mockResolvedValueOnce({ events: [event(1, 10)] });
        await act(async () => {
            await result.current.reload();
        });

        expect(result.current.loadError).toBeNull();
        expect(result.current.eventsForDay(10)).toEqual([event(1, 10)]);
    });
});

describe('importing', () => {
    test('importAll POSTs {} and replaces the list with the answer', async () => {
        const { result } = await renderLoaded({ events: [event(1, 10)] });
        api.post.mockResolvedValue({ events: [event(2, 11)] });

        await act(async () => {
            await result.current.importAll();
        });

        expect(api.post).toHaveBeenCalledWith('/calendar/events/import', {});
        expect(result.current.events).toEqual([event(2, 11)]);
    });

    test('importDay POSTs the dayId and replaces the list with the answer', async () => {
        const { result } = await renderLoaded({ events: [] });
        api.post.mockResolvedValue({ events: [event(3, 12)] });

        await act(async () => {
            await result.current.importDay(12);
        });

        expect(api.post).toHaveBeenCalledWith('/calendar/events/import', { dayId: 12 });
        expect(result.current.eventsForDay(12)).toEqual([event(3, 12)]);
    });

    test('isImporting is true only while an import is in flight', async () => {
        const { result } = await renderLoaded({ events: [] });
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);

        let done;
        act(() => {
            done = result.current.importAll();
        });
        expect(result.current.isImporting).toBe(true);

        await act(async () => {
            pending.resolve({ events: [] });
            await done;
        });
        expect(result.current.isImporting).toBe(false);
    });

    test('a rejected import keeps the list, sets error, and dismissError clears it', async () => {
        const { result } = await renderLoaded({ events: [event(1, 10)] });
        api.post.mockRejectedValue(new Error('Google not connected'));

        await act(async () => {
            await result.current.importAll();
        });

        expect(result.current.error).toBe('Google not connected');
        expect(result.current.events).toEqual([event(1, 10)]);
        expect(result.current.isImporting).toBe(false);

        act(() => result.current.dismissError());

        expect(result.current.error).toBeNull();
    });
});
