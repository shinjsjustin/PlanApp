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

const calendar = {
    days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }],
    items: [{ todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 }],
};

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
    });

    test('a failed load keeps the message for the retry screen', () => {
        // Act
        const next = calendarReducer(initialCalendarState, loadFailed('Offline'));

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.error);
        expect(next.loadError).toBe('Offline');
    });

    test('replacing the schedule swaps both collections at once', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const moved = { days: calendar.days, items: [{ ...calendar.items[0], startMinutes: 600 }] };

        // Act
        const next = calendarReducer(ready, scheduleReplaced(moved));

        // Assert
        expect(next.items[0].startMinutes).toBe(600);
        expect(next.status).toBe(CALENDAR_STATUS.ready);
    });

    test('a rollback restores the snapshot and raises the message', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const snapshot = scheduleOf(ready);
        const moved = calendarReducer(
            ready,
            scheduleReplaced({ days: calendar.days, items: [] })
        );

        // Act
        const next = calendarReducer(moved, rolledBack(snapshot, 'Could not save'));

        // Assert
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
