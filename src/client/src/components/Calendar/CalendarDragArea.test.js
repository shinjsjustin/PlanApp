import {
    DRAG_KIND,
    dragKindOf,
    minutesAtRect,
    noteMoveFor,
    previewFor,
    withStableTempDays,
} from './CalendarDragArea';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const booking = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

describe('dragKindOf', () => {
    test('tells a pool row from a booking', () => {
        expect(dragKindOf({ poolTodo: { todoId: 1 } })).toBe('pool');
        expect(dragKindOf({ bookingTodoId: 1 })).toBe('booking');
        expect(dragKindOf({})).toBeNull();
        expect(dragKindOf(undefined)).toBeNull();
    });
});

describe('minutesAtRect', () => {
    test('reads the minute off the card’s top edge and snaps it', () => {
        // Arrange — the grid starts at y=100; 24px is one 30-minute slot
        const grid = { top: 100 };

        // Act + Assert
        expect(minutesAtRect(geometry, { top: 100 }, grid)).toBe(0);
        expect(minutesAtRect(geometry, { top: 124 }, grid)).toBe(30);
        expect(minutesAtRect(geometry, { top: 532 }, grid)).toBe(540);
    });

    test('clamps a card dragged above the top or below the bottom', () => {
        const grid = { top: 100 };

        expect(minutesAtRect(geometry, { top: -500 }, grid)).toBe(0);
        expect(minutesAtRect(geometry, { top: 99999 }, grid)).toBe(1410);
    });
});

describe('previewFor', () => {
    test('books an unbooked to-do for an hour', () => {
        // Arrange
        const schedule = { days: [day(1, 0)], items: [] };

        // Act
        const next = previewFor(schedule, {
            kind: 'pool',
            todo: { todoId: 7, text: 'Refresh tokens', projectId: 2, sequenceId: 9 },
            dayId: 1,
            startMinutes: 540,
        });

        // Assert
        expect(next.items).toEqual([
            expect.objectContaining({ todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 }),
        ]);
    });

    test('moves a booking and pushes what it lands on', () => {
        // Arrange
        const schedule = { days: [day(1, 0)], items: [booking(7, 1, 540), booking(8, 1, 660)] };

        // Act
        const next = previewFor(schedule, {
            kind: 'booking',
            todo: { todoId: 8 },
            dayId: 1,
            startMinutes: 540,
        });

        // Assert
        expect(
            next.items
                .slice()
                .sort((a, b) => a.startMinutes - b.startMinutes)
                .map((item) => [item.todoId, item.startMinutes])
        ).toEqual([
            [8, 540],
            [7, 600],
        ]);
    });

    test('returns the schedule untouched when there is no target', () => {
        // Arrange
        const schedule = { days: [day(1, 0)], items: [] };

        // Act + Assert — a drag over nothing previews nothing
        expect(previewFor(schedule, null)).toBe(schedule);
    });
});

describe('withStableTempDays', () => {
    test('keeps the previous frame’s id for a day the spill re-created', () => {
        // Arrange — two frames of the same drag, each spilling into a new day
        const previous = { days: [day(1, 0), day(-1, 1)], items: [booking(7, -1, 0)] };
        const next = { days: [day(1, 0), day(-2, 1)], items: [booking(7, -2, 0)] };

        // Act
        const stable = withStableTempDays(previous, next);

        // Assert — the React key does not change between frames
        expect(stable.days[1].id).toBe(-1);
        expect(stable.items[0].dayId).toBe(-1);
    });

    test('leaves saved days alone', () => {
        // Arrange
        const previous = { days: [day(1, 0)], items: [] };
        const next = { days: [day(1, 0)], items: [booking(7, 1, 540)] };

        // Act + Assert
        expect(withStableTempDays(previous, next)).toBe(next);
    });

    test('passes the first frame straight through', () => {
        // Arrange
        const next = { days: [day(1, 0), day(-1, 1)], items: [] };

        // Act + Assert
        expect(withStableTempDays(null, next)).toBe(next);
    });
});

describe('dragKindOf', () => {
    test('reads a note drag', () => {
        // Act & Assert
        expect(dragKindOf({ noteId: 5 })).toBe(DRAG_KIND.note);
    });

    test('still tells a pool row from a booking', () => {
        // Act & Assert
        expect(dragKindOf({ poolTodo: { todoId: 1 } })).toBe(DRAG_KIND.pool);
        expect(dragKindOf({ bookingTodoId: 1 })).toBe(DRAG_KIND.booking);
    });

    test('is null for a drag it does not recognise', () => {
        // Act & Assert
        expect(dragKindOf({})).toBeNull();
    });
});

describe('noteMoveFor', () => {
    const note = { id: 5, dayId: 1, text: 'on call', startMinutes: 540, durationMinutes: 60 };

    test('names the day and the minute the ribbon landed on', () => {
        // Act
        const move = noteMoveFor(note, { dayId: 2, startMinutes: 600 });

        // Assert
        expect(move).toEqual({ dayId: 2, startMinutes: 600 });
    });

    test('is null when nothing would change', () => {
        // Arrange — dropped exactly where it started; no request is worth sending
        // Act & Assert
        expect(noteMoveFor(note, { dayId: 1, startMinutes: 540 })).toBeNull();
    });

    test('is null when the note would run past midnight', () => {
        // Act & Assert
        expect(noteMoveFor(note, { dayId: 1, startMinutes: 1410 })).toBeNull();
    });
});
