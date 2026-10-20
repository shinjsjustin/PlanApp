import {
    DEFAULT_DURATION,
    MAX_DURATION,
    SLEEP_START_MINUTES,
    SLOT_MINUTES,
    WAKE_MINUTES,
    moveItem,
    placeFromPool,
    resizeItem,
    topEdgeFloor,
    unscheduleItem,
} from './schedule';

const days = (count) =>
    Array.from({ length: count }, (unused, index) => ({
        id: index + 1,
        position: index,
        createdAt: '2026-09-09T08:00:00.000Z',
    }));

const item = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

const dayLayout = (state, dayId) =>
    state.items
        .filter((entry) => entry.dayId === dayId)
        .sort((a, b) => a.startMinutes - b.startMinutes)
        .map((entry) => [entry.todoId, entry.startMinutes, entry.durationMinutes]);

describe('placeFromPool', () => {
    test('books an hour by default and carries the display fields across', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, {
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            text: 'Wire up the token refresh',
            projectId: 2,
            sequenceId: 9,
        });

        // Assert
        expect(next.items).toHaveLength(1);
        expect(next.items[0]).toMatchObject({
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            durationMinutes: DEFAULT_DURATION,
            text: 'Wire up the token refresh',
            projectId: 2,
            sequenceId: 9,
        });
    });

    test('pushes what it lands on down', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540)] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 540 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [7, 540, 60],
            [1, 600, 60],
        ]);
    });

    test('spills straight into a new day when dropped at the very bottom', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 1350 });

        // Assert
        expect(next.days).toHaveLength(2);
        expect(dayLayout(next, 1)).toEqual([]);
        expect(dayLayout(next, next.days[1].id)).toEqual([[7, 480, 60]]);
    });

    test('bounds a caller-supplied duration down to one day', () => {
        // Arrange — `spillFrom` refuses a booking longer than a day, and this
        // runs on a pointer move, where a throw is a frozen drag rather than a
        // visible failure. The refusal has to be unreachable from here.
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, {
            todoId: 7,
            dayId: 1,
            startMinutes: 480,
            durationMinutes: MAX_DURATION + SLOT_MINUTES,
        });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[7, 480, MAX_DURATION]]);
    });

    test('bounds a caller-supplied duration up to fifteen minutes', () => {
        // Arrange — `settleDay` refuses a duration of zero for the same reason.
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, {
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 0,
        });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[7, 540, 15]]);
    });

    // Bounding a duration must not validate one, and `Math.min`/`Math.max` run
    // `ToNumber`: unguarded they turn every value below into a legal duration —
    // `null`, `true` and `[]` into 30, `'60'` into 60 — and book it. `null` is
    // the likeliest of them, an absent field on a drag payload. The bound has to
    // hand them all to `settleDay` untouched instead.
    test.each([
        ['null', null],
        ['a boolean', true],
        ['an empty array', []],
        ['a numeric string', '60'],
        ['a word', 'an hour'],
    ])('still refuses a duration that is %s', (unused, durationMinutes) => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() =>
            placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 0, durationMinutes })
        ).toThrow('needs a number for both startMinutes and durationMinutes');
    });

    test('refuses to book a to-do that already has a booking', () => {
        // Arrange
        const state = { days: days(1), items: [item(7, 1, 540)] };

        // Act + Assert
        expect(() => placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 0 })).toThrow(
            'To-do 7 is already booked'
        );
    });
});

describe('the sleep window', () => {
    test('exports the wake and sleep times', () => {
        // Assert
        expect(WAKE_MINUTES).toBe(480);
        expect(SLEEP_START_MINUTES).toBe(1380);
    });

    test('a pool drop at 07:00 lands at 08:00', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 420 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[7, 480, 60]]);
    });

    test('a move to 07:00 lands at 08:00', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 600)] };

        // Act
        const next = moveItem(state, { todoId: 1, dayId: 1, startMinutes: 420 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 480, 60]]);
    });

    test('a resize starting at 07:00 starts at 08:00', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 600)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 420, durationMinutes: 180 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 480, 180]]);
    });

    test('a drop ending past 23:00 spills whole to 08:00 and pushes that day down', () => {
        // Arrange
        const state = { days: days(2), items: [item(2, 2, 480)] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 1350 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([]);
        expect(dayLayout(next, 2)).toEqual([
            [7, 480, 60],
            [2, 540, 60],
        ]);
    });

    test('a drop ending exactly at 23:00 stays', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 1320 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[7, 1320, 60]]);
        expect(next.days).toHaveLength(1);
    });

    test('an item starting at 08:00 that runs past 23:00 stays put', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 480, 1000)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 480, durationMinutes: 1000 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 480, 1000]]);
        expect(next.days).toHaveLength(1);
    });
});

describe('moveItem', () => {
    test('reorders within a day, pushing what it lands on', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = moveItem(state, { todoId: 2, dayId: 1, startMinutes: 540 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [2, 540, 60],
            [1, 600, 60],
        ]);
    });

    test('moves to another day and leaves the source day’s gap alone', () => {
        // Arrange — decision 7, seen from the other side
        const state = {
            days: days(2),
            items: [item(1, 1, 540), item(2, 1, 600), item(3, 1, 660)],
        };

        // Act
        const next = moveItem(state, { todoId: 2, dayId: 2, startMinutes: 480 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 60],
            [3, 660, 60],
        ]);
        expect(dayLayout(next, 2)).toEqual([[2, 480, 60]]);
    });

    test('throws for a to-do that is not booked', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => moveItem(state, { todoId: 9, dayId: 1, startMinutes: 0 })).toThrow(
            'To-do 9 is not booked'
        );
    });
});

describe('resizeItem', () => {
    test('growing the bottom edge pushes the stack below', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 540, durationMinutes: 120 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('shrinking leaves a gap', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540, 120), item(2, 1, 660)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 540, durationMinutes: 30 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 30],
            [2, 660, 60],
        ]);
    });

    test('growing at the bottom of a day spills the stack onward', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 1200), item(2, 1, 1260)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 1200, durationMinutes: 180 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 1200, 180]]);
        expect(dayLayout(next, 2)).toEqual([[2, 480, 60]]);
    });

    test('bounds a grow past midnight to one day', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 480)] };

        // Act
        const next = resizeItem(state, {
            todoId: 1,
            startMinutes: 480,
            durationMinutes: MAX_DURATION + SLOT_MINUTES,
        });

        // Assert — one day is the longest booking there is, so nothing spills
        expect(dayLayout(next, 1)).toEqual([[1, 480, MAX_DURATION]]);
        expect(next.days).toHaveLength(1);
    });

    test('bounds a shrink past fifteen minutes to fifteen minutes', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 540, durationMinutes: 0 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 540, 15]]);
    });
});

describe('topEdgeFloor', () => {
    test('is 08:00 for the first item in a day', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540)] };

        // Act + Assert
        expect(topEdgeFloor(state, 1)).toBe(480);
    });

    test('is the end of the item above', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 660)] };

        // Act + Assert — dragging 2’s top edge upward stops at 10:00
        expect(topEdgeFloor(state, 2)).toBe(600);
    });

    test('ignores items in other days', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 540, 600), item(2, 2, 660)] };

        // Act + Assert
        expect(topEdgeFloor(state, 2)).toBe(480);
    });

    test('throws for a to-do that is not booked', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => topEdgeFloor(state, 9)).toThrow('To-do 9 is not booked');
    });
});

describe('topEdgeFloor and the wake time', () => {
    test('lets a booking already before 08:00 keep its own start as the floor', () => {
        const state = { days: days(1), items: [item(1, 1, 300)] };

        expect(topEdgeFloor(state, 1)).toBe(0);
    });
});

describe('unscheduleItem', () => {
    test('drops the booking and leaves the rest of the day where it is', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 660)] };

        // Act
        const next = unscheduleItem(state, 1);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[2, 660, 60]]);
    });

    test('throws for a to-do that is not booked', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => unscheduleItem(state, 9)).toThrow('To-do 9 is not booked');
    });
});

describe('every gesture', () => {
    test('never mutates the state it is given', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 600)] };
        const before = JSON.parse(JSON.stringify(state));

        // Act
        placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 0 });
        moveItem(state, { todoId: 2, dayId: 1, startMinutes: 540 });
        resizeItem(state, { todoId: 1, startMinutes: 540, durationMinutes: 120 });
        unscheduleItem(state, 1);

        // Assert
        expect(state).toEqual(before);
    });

    test('passes the bookings it did not touch through by reference', () => {
        // Arrange — a rendered day column memoizes per item, so an untouched
        // booking has to keep its identity across a gesture.
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 900)] };

        // Act
        const next = moveItem(state, { todoId: 1, dayId: 1, startMinutes: 600 });

        // Assert
        expect(next.items.find((entry) => entry.todoId === 2)).toBe(state.items[1]);
    });
});
