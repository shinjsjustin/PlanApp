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

const calendar = {
    days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }],
    items: [
        {
            id: 5,
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 60,
            text: 'Wire up the token refresh',
            status: 'incomplete',
            projectId: 2,
            projectTitle: 'Auth rewrite',
            sequenceId: 9,
            sequenceTitle: 'Session handling',
        },
    ],
};

/** A promise the test settles by hand, so mid-flight state can be asserted. */
const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

/** Renders the hook with the calendar already loaded. */
const renderReady = async () => {
    api.get.mockResolvedValue(calendar);

    const view = renderHook(() => useCalendar());
    await waitFor(() => expect(view.result.current.state.status).toBe(CALENDAR_STATUS.ready));

    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useCalendar loading', () => {
    test('loads the calendar in one request', async () => {
        // Arrange + Act
        const { result } = await renderReady();

        // Assert
        expect(api.get).toHaveBeenCalledWith('/calendar');
        expect(result.current.state.items).toHaveLength(1);
    });

    test('keeps a retry on screen when the load fails', async () => {
        // Arrange
        api.get.mockRejectedValue(new ApiError('Could not reach the server.', 0));

        // Act
        const { result } = renderHook(() => useCalendar());

        // Assert
        await waitFor(() => expect(result.current.state.status).toBe(CALENDAR_STATUS.error));
        expect(result.current.state.loadError).toBe('Could not reach the server.');
    });
});

describe('useCalendar.commit', () => {
    test('sends only what changed and installs the server’s answer', async () => {
        // Arrange
        const { result } = await renderReady();
        const moved = {
            days: calendar.days,
            items: [{ ...calendar.items[0], startMinutes: 600 }],
        };
        api.put.mockResolvedValue(moved);

        // Act
        await act(() => result.current.commit(moved));

        // Assert
        expect(api.put).toHaveBeenCalledWith('/calendar/items', {
            appendDays: 0,
            placements: [{ todoId: 7, dayId: 1, startMinutes: 600, durationMinutes: 60 }],
            unschedule: [],
        });
        expect(result.current.state.items[0].startMinutes).toBe(600);
    });

    test('sends nothing when the gesture changed nothing', async () => {
        // Arrange
        const { result } = await renderReady();

        // Act
        await act(() => result.current.commit({ days: calendar.days, items: calendar.items }));

        // Assert
        expect(api.put).not.toHaveBeenCalled();
    });

    test('rolls back and raises a message when the save fails', async () => {
        // Arrange
        const { result } = await renderReady();
        api.put.mockRejectedValue(new ApiError('Could not save the change.', 500));

        // Act
        await act(() =>
            result.current.commit({
                days: calendar.days,
                items: [{ ...calendar.items[0], startMinutes: 600 }],
            })
        );

        // Assert
        expect(result.current.state.items[0].startMinutes).toBe(540);
        expect(result.current.state.actionError).toBe('Could not save the change.');
    });
});

describe('useCalendar.addDay', () => {
    test('shows the day at once and re-keys it when the server answers', async () => {
        // Arrange
        const { result } = await renderReady();
        const saved = { id: 2, position: 1, createdAt: '2026-09-09T09:00:00.000Z' };
        api.post.mockResolvedValue(saved);

        // Act
        await act(() => result.current.addDay());

        // Assert
        expect(api.post).toHaveBeenCalledWith('/calendar/days', {});
        expect(result.current.state.days).toHaveLength(2);
        expect(result.current.state.days[1]).toEqual(saved);
    });

    test('rolls the day back if the request fails', async () => {
        // Arrange
        const { result } = await renderReady();
        api.post.mockRejectedValue(new ApiError('Nope', 500));

        // Act
        await act(() => result.current.addDay());

        // Assert — rolled back in place. The load is the one from `renderReady`
        // and no other: a rollback that resynced instead would refetch, and this
        // is what tells the two failure paths apart.
        expect(result.current.state.days).toHaveLength(1);
        expect(result.current.state.actionError).toBe('Nope');
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('re-syncs rather than rolling back when the strip moved on beneath it', async () => {
        // Arrange — the interleaving a snapshot cannot undo: `addDay` in flight,
        // the real day deleted for good while it is out, and only then the POST
        // failing. Rolling back to the pre-`addDay` snapshot would put the
        // deleted day back on screen after the server has dropped it.
        const { result } = await renderReady();
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        api.delete.mockResolvedValue({ id: 1 });

        let addition;
        act(() => {
            addition = result.current.addDay();
        });
        await act(() => result.current.deleteDay(1));

        const resynced = {
            days: [{ id: 3, position: 0, createdAt: '2026-09-09T10:00:00.000Z' }],
            items: [],
        };
        api.get.mockResolvedValue(resynced);

        // Act
        await act(async () => {
            pending.reject(new ApiError('Nope', 500));
            await addition;
        });

        // Assert — the server's own answer replaces the guesswork, and the
        // message survives the refetch so the failure is still on screen.
        await waitFor(() => expect(result.current.state.days).toEqual(resynced.days));
        expect(result.current.state.actionError).toBe('Nope');
        expect(api.get).toHaveBeenCalledTimes(2);
    });
});

describe('useCalendar.deleteDay', () => {
    test('drops the day and its bookings at once', async () => {
        // Arrange
        const { result } = await renderReady();
        api.delete.mockResolvedValue({ id: 1 });

        // Act
        await act(() => result.current.deleteDay(1));

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/calendar/days/1');
        expect(result.current.state.days).toEqual([]);
        expect(result.current.state.items).toEqual([]);
    });
});

describe('useCalendar.unschedule', () => {
    test('releases the booking', async () => {
        // Arrange
        const { result } = await renderReady();
        api.delete.mockResolvedValue({ todoId: 7 });

        // Act
        await act(() => result.current.unschedule(7));

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/calendar/items/7');
        expect(result.current.state.items).toEqual([]);
    });
});

describe('useCalendar.completeTodo', () => {
    test('ticks the item without moving it', async () => {
        // Arrange
        const { result } = await renderReady();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });

        // Act
        await act(() => result.current.completeTodo(7));

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/todos/7', { status: 'complete' });
        expect(result.current.state.items[0].status).toBe('complete');
        expect(result.current.state.items[0].startMinutes).toBe(540);
    });
});

describe('useCalendar error surface', () => {
    test('clears the toast when it is dismissed', async () => {
        // Arrange — a failed mutation, so there is something to dismiss.
        const { result } = await renderReady();
        api.delete.mockRejectedValue(new ApiError('Could not delete the day.', 500));
        await act(() => result.current.deleteDay(1));
        expect(result.current.state.actionError).toBe('Could not delete the day.');

        // Act
        act(() => result.current.dismissActionError());

        // Assert
        expect(result.current.state.actionError).toBeNull();
    });
});

describe('useCalendar context value', () => {
    test('hands back the same object when a render changed nothing', async () => {
        // Arrange — this object is the context value, so its identity is what
        // decides whether every calendar consumer re-renders.
        const { result, rerender } = await renderReady();
        const before = result.current;

        // Act — a render the calendar had no part in, of the kind the
        // independently-loaded pool causes on the page above it.
        rerender();

        // Assert
        expect(result.current).toBe(before);
    });

    test('hands back a new object when the schedule actually moves', async () => {
        // Arrange
        const { result } = await renderReady();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });
        const before = result.current;

        // Act
        await act(() => result.current.completeTodo(7));

        // Assert — memoised, not frozen: consumers must see this one.
        expect(result.current).not.toBe(before);
        expect(result.current.state.items[0].status).toBe('complete');
    });
});

describe('useCalendar unreconciled days', () => {
    test('tells a column whether its own day is still waiting for an id', async () => {
        // Arrange
        const { result } = await renderReady();

        // Act + Assert — the × is hidden on the first, offered on the second.
        expect(result.current.isUnsavedDay(-1)).toBe(true);
        expect(result.current.isUnsavedDay(1)).toBe(false);
    });

    test('reports the strip as unsettled only while a day is waiting for an id', async () => {
        // Arrange
        const { result } = await renderReady();
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        expect(result.current.hasUnsavedDay).toBe(false);

        // Act — the day is on screen, its POST is not back yet.
        let addition;
        act(() => {
            addition = result.current.addDay();
        });

        // Assert
        expect(result.current.hasUnsavedDay).toBe(true);

        // Act — and settled again once the server names it.
        await act(async () => {
            pending.resolve({ id: 2, position: 1, createdAt: '2026-09-09T09:00:00.000Z' });
            await addition;
        });

        // Assert
        expect(result.current.hasUnsavedDay).toBe(false);
    });

    test('commit throws in the caller’s own frame rather than rejecting a promise nobody awaits', async () => {
        // Arrange — the backstop behind the gate, not the gate itself: the test
        // above covers `hasUnsavedDay`. This one pins that `commit` is not
        // `async`, so `toBulkRequest`'s refusal reaches the drop handler that
        // called it instead of becoming an unhandled rejection.
        const { result } = await renderReady();
        api.post.mockReturnValue(deferred().promise);
        act(() => {
            result.current.addDay();
        });
        const next = {
            days: result.current.state.days,
            items: [{ ...calendar.items[0], startMinutes: 600 }],
        };

        // Act + Assert — synchronous, so the drop handler's own frame sees it
        // rather than an unhandled rejection nobody is watching.
        expect(() => result.current.commit(next)).toThrow(/reconciled/);
        expect(api.put).not.toHaveBeenCalled();
    });

    test('does not resurrect a day deleted while the new day’s request is in flight', async () => {
        // Arrange — `addDay` in flight, and the × on the real day still live.
        const { result } = await renderReady();
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        api.delete.mockResolvedValue({ id: 1 });

        let addition;
        act(() => {
            addition = result.current.addDay();
        });

        // Act — the real day goes while the new day's POST is still out.
        await act(() => result.current.deleteDay(1));
        const saved = { id: 2, position: 0, createdAt: '2026-09-09T09:00:00.000Z' };
        await act(async () => {
            pending.resolve(saved);
            await addition;
        });

        // Assert — the reconcile re-keys the new day onto the state as it now
        // is, rather than onto the pre-delete snapshot it was applied to.
        expect(result.current.state.days).toEqual([saved]);
        expect(result.current.state.items).toEqual([]);
    });
});

describe('useCalendar refused gestures', () => {
    test('surfaces a gesture the schedule refuses as a rolled-back failure, not a silent rejection', async () => {
        // Arrange — `removeDay` throws for a day that is not in the strip.
        const { result } = await renderReady();
        const MISSING_DAY_ID = 999;

        // Act — resolves rather than rejecting: the failure is handled here, not
        // left to `window.onunhandledrejection`.
        await act(() => result.current.deleteDay(MISSING_DAY_ID));

        // Assert
        expect(api.delete).not.toHaveBeenCalled();
        expect(result.current.state.days).toEqual(calendar.days);
        expect(result.current.state.actionError).toMatch(/No day with id 999/);
    });

    test('refuses an unbookable item before it reaches the wire, and says why', async () => {
        // Arrange — a gesture whose settled result the ingest guard rejects.
        const { result } = await renderReady();
        const malformed = {
            days: calendar.days,
            items: [{ ...calendar.items[0], durationMinutes: null }],
        };

        // Act
        await act(() => result.current.commit(malformed));

        // Assert — nothing sent, nothing installed, and the reason on screen.
        expect(api.put).not.toHaveBeenCalled();
        expect(result.current.state.items[0].durationMinutes).toBe(60);
        expect(result.current.state.actionError).toMatch(/needs a number/);
    });

    test('keeps the retry on screen when the server sends a calendar it cannot ingest', async () => {
        // Arrange
        api.get.mockResolvedValue({
            days: calendar.days,
            items: [{ ...calendar.items[0], startMinutes: undefined }],
        });

        // Act
        const { result } = renderHook(() => useCalendar());

        // Assert — a refused payload is a failed load, not a crashed page.
        await waitFor(() => expect(result.current.state.status).toBe(CALENDAR_STATUS.error));
        expect(result.current.state.loadError).toMatch(/needs a number/);
    });
});
