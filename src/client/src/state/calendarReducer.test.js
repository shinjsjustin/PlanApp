import {
    CALENDAR_STATUS,
    calendarReducer,
    initialCalendarState,
    scheduleOf,
} from './calendarReducer';
import {
    actionErrorCleared,
    loadFailed,
    loadStarted,
    loadSucceeded,
    rolledBack,
    scheduleReplaced,
} from './calendarActions';
import { MAX_DURATION } from '../lib/schedule';

const calendar = {
    days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }],
    items: [{ todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 }],
};

// A second day, distinct from anything already in `calendar` — used to make
// the schedule-replacing tests below load-bearing on `days`, not just `items`.
const secondDay = { id: 2, position: 1, createdAt: '2026-09-09T09:00:00.000Z' };

describe('calendarReducer', () => {
    test('starts idle and empty', () => {
        expect(initialCalendarState.status).toBe(CALENDAR_STATUS.idle);
        expect(initialCalendarState.days).toEqual([]);
        expect(initialCalendarState.items).toEqual([]);
    });

    test('a load in flight clears any earlier load error', () => {
        // Arrange
        const failed = calendarReducer(initialCalendarState, loadFailed('Offline'));

        // Act
        const next = calendarReducer(failed, loadStarted());

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.loading);
        expect(next.loadError).toBeNull();
    });

    test('a successful load installs the calendar', () => {
        // Act
        const next = calendarReducer(initialCalendarState, loadSucceeded(calendar));

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.ready);
        expect(next.days).toEqual(calendar.days);
        expect(next.items).toEqual(calendar.items);

        // Passed through by reference, not cloned — the same contract
        // `spillFrom` keeps one link up the chain (schedule.spill.test.js).
        expect(next.days).toBe(calendar.days);
        expect(next.items).toBe(calendar.items);
    });

    test('a failed load keeps the message for the retry screen', () => {
        // Act
        const next = calendarReducer(initialCalendarState, loadFailed('Offline'));

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.error);
        expect(next.loadError).toBe('Offline');
    });

    test('refuses a load whose payload carries an item that cannot be scheduled', () => {
        // Arrange — a NaN start, the shape a field the server left out would take
        const broken = {
            days: calendar.days,
            items: [{ todoId: 7, dayId: 1, startMinutes: NaN, durationMinutes: 60 }],
        };

        // Act + Assert — the guard's own message, not a stand-in the reducer
        // might start defining for itself
        expect(() => calendarReducer(initialCalendarState, loadSucceeded(broken))).toThrow(
            'needs a number for both startMinutes and durationMinutes'
        );
    });

    test('replacing the schedule swaps both collections at once', () => {
        // Arrange — `days` genuinely differs from `ready.days`, so a handler
        // that dropped it from the merge cannot pass this by accident
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const moved = {
            days: [...calendar.days, secondDay],
            items: [{ ...calendar.items[0], startMinutes: 600 }],
        };

        // Act
        const next = calendarReducer(ready, scheduleReplaced(moved));

        // Assert
        expect(next.days).toEqual(moved.days);
        expect(next.items[0].startMinutes).toBe(600);
        expect(next.status).toBe(CALENDAR_STATUS.ready);

        // Passed through by reference, not cloned — same contract as above.
        expect(next.days).toBe(moved.days);
        expect(next.items).toBe(moved.items);
    });

    test('refuses a schedule replacement carrying a booking longer than a day', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const tooLong = {
            days: calendar.days,
            items: [{ todoId: 7, dayId: 1, startMinutes: 0, durationMinutes: MAX_DURATION + 1 }],
        };

        // Act + Assert
        expect(() => calendarReducer(ready, scheduleReplaced(tooLong))).toThrow(
            `it must be at most ${MAX_DURATION}`
        );
    });

    test('a rollback restores the snapshot and raises the message', () => {
        // Arrange — the moved-to schedule has an extra day, so restoring the
        // snapshot's `days` is what this test actually checks
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const snapshot = scheduleOf(ready);
        const moved = calendarReducer(
            ready,
            scheduleReplaced({ days: [...calendar.days, secondDay], items: [] })
        );

        // Act
        const next = calendarReducer(moved, rolledBack(snapshot, 'Could not save'));

        // Assert
        expect(next.days).toEqual(calendar.days);
        expect(next.items).toEqual(calendar.items);
        expect(next.actionError).toBe('Could not save');
    });

    test('dismissing the action error leaves the schedule alone', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const failed = calendarReducer(ready, rolledBack(scheduleOf(ready), 'Nope'));

        // Act
        const next = calendarReducer(failed, actionErrorCleared());

        // Assert
        expect(next.actionError).toBeNull();
        expect(next.items).toEqual(calendar.items);
    });

    test('refuses an action it does not know', () => {
        expect(() => calendarReducer(initialCalendarState, { type: 'nonsense' })).toThrow(
            'Unknown calendar action "nonsense"'
        );
    });
});
