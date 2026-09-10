import { isTempId } from './tempIds';
import { DAY_MINUTES, spillFrom } from './schedule';

/** A calendar of `count` empty days, ids 1..count. */
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

/** One day's layout as `[todoId, start, duration]` triples, top to bottom. */
const dayLayout = (state, dayId) =>
    state.items
        .filter((entry) => entry.dayId === dayId)
        .sort((a, b) => a.startMinutes - b.startMinutes)
        .map((entry) => [entry.todoId, entry.startMinutes, entry.durationMinutes]);

describe('spillFrom', () => {
    test('leaves a day that fits alone', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 60],
            [2, 600, 60],
        ]);
        expect(dayLayout(next, 2)).toEqual([]);
        expect(next.days).toHaveLength(2);
    });

    test('does not spill an item ending exactly at midnight', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 1380, 60)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 1380, 60]]);
        expect(dayLayout(next, 2)).toEqual([]);
    });

    test('spills an item one slot past midnight whole, not split', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 1410, 60)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert — the item leaves day 1 entirely and starts day 2 at 00:00
        expect(dayLayout(next, 1)).toEqual([]);
        expect(dayLayout(next, 2)).toEqual([[1, 0, 60]]);
    });

    test('spills only the tail that does not fit', () => {
        // Arrange
        const state = {
            days: days(2),
            items: [item(1, 1, 1260), item(2, 1, 1320), item(3, 1, 1380, 120)],
        };

        // Act
        const next = spillFrom(state, 1, [3]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 1260, 60],
            [2, 1320, 60],
        ]);
        expect(dayLayout(next, 2)).toEqual([[3, 0, 120]]);
    });

    test('spills a whole group to the top of the next day', () => {
        // Arrange — item 1 grows to fill the end of the day, so 2 and 3 are both
        // pushed past midnight and must travel together.
        //
        // They arrive touching, and that is not an accident of this fixture: the
        // push makes each spilled item start exactly where the one above it ends,
        // so a spilled tail is always contiguous below its first member.
        const state = {
            days: days(2),
            items: [item(1, 1, 1320, 120), item(2, 1, 1380), item(3, 1, 1410)],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 1320, 120]]);
        expect(dayLayout(next, 2)).toEqual([
            [2, 0, 60],
            [3, 60, 60],
        ]);
    });

    test('pushes the receiving day’s own items down', () => {
        // Arrange
        const state = {
            days: days(2),
            items: [item(1, 1, 1410, 60), item(2, 2, 0), item(3, 2, 60)],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert — the arrival takes 00:00 and everything already there moves
        expect(dayLayout(next, 2)).toEqual([
            [1, 0, 60],
            [2, 60, 60],
            [3, 120, 60],
        ]);
    });

    test('appends a day when there is nowhere left to spill', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 1410, 60)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(next.days).toHaveLength(2);
        expect(isTempId(next.days[1].id)).toBe(true);
        expect(next.days[1].position).toBe(1);
        expect(dayLayout(next, next.days[1].id)).toEqual([[1, 0, 60]]);
    });

    test('cascades across three days, creating what it needs', () => {
        // Arrange — day 1 is filled edge to edge, and the two items below it are
        // long enough that day 2 cannot hold both either. Two *full-day* items
        // are what genuinely forces a third day; a pair of one-hour ones would
        // both fit in day 2 and only two days would be created.
        const state = {
            days: days(1),
            items: [item(1, 1, 0, 1440), item(2, 1, 60, 1440), item(3, 1, 120, 60)],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(next.days).toHaveLength(3);
        expect(dayLayout(next, next.days[0].id)).toEqual([[1, 0, 1440]]);
        expect(dayLayout(next, next.days[1].id)).toEqual([[2, 0, 1440]]);
        expect(dayLayout(next, next.days[2].id)).toEqual([[3, 0, 60]]);
    });

    test('never mutates the state it is given', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 1410, 60)] };
        const before = JSON.parse(JSON.stringify(state));

        // Act
        spillFrom(state, 1, [1]);

        // Assert
        expect(state).toEqual(before);
    });

    test('passes untouched items and the day list through by reference', () => {
        // Arrange — nothing overflows, so nothing needs a new object.
        const state = { days: days(2), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert — a rendered day column memoizes per item and per day, and
        // re-renders only what actually moved.
        expect(next.days).toBe(state.days);
        expect(next.items.find((entry) => entry.todoId === 1)).toBe(state.items[0]);
        expect(next.items.find((entry) => entry.todoId === 2)).toBe(state.items[1]);
    });

    test('keeps the identity of what a spill leaves behind', () => {
        // Arrange — item 3 spills; the two above it do not move.
        const state = {
            days: days(2),
            items: [item(1, 1, 1260), item(2, 1, 1320), item(3, 1, 1380, 120)],
        };

        // Act
        const next = spillFrom(state, 1, [3]);

        // Assert
        expect(next.items.find((entry) => entry.todoId === 1)).toBe(state.items[0]);
        expect(next.items.find((entry) => entry.todoId === 2)).toBe(state.items[1]);
        expect(next.days[0]).toBe(state.days[0]);
        expect(next.days[1]).toBe(state.days[1]);
    });

    test('carries display fields across a move to another day', () => {
        // Arrange — the spill rewrites four scheduling fields and must copy the
        // rest of the row across the two spreads that move it.
        const state = {
            days: days(2),
            items: [{ ...item(1, 1, 1410, 60), text: 'Write it up', projectId: 7 }],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(next.items).toEqual([
            {
                todoId: 1,
                dayId: 2,
                startMinutes: 0,
                durationMinutes: 60,
                text: 'Write it up',
                projectId: 7,
            },
        ]);
    });

    test('spills from a day in the middle without disturbing the one before it', () => {
        // Arrange
        const state = {
            days: days(3),
            items: [item(1, 1, 1410, 60), item(2, 2, 1410, 60)],
        };

        // Act
        const next = spillFrom(state, 2, [2]);

        // Assert — day 1 is above the gesture and is never even settled
        expect(dayLayout(next, 1)).toEqual([[1, 1410, 60]]);
        expect(dayLayout(next, 2)).toEqual([]);
        expect(dayLayout(next, 3)).toEqual([[2, 0, 60]]);
        expect(next.days).toHaveLength(3);
    });

    test('throws for a booking longer than a day rather than spilling forever', () => {
        // Arrange — rebased to 00:00 it would still end past midnight, so it
        // would move on and append a day every pass, for ever.
        const state = { days: days(1), items: [item(1, 1, 0, DAY_MINUTES + 1)] };

        // Act + Assert
        expect(() => spillFrom(state, 1, [1])).toThrow('it must be at most 1440');
    });

    test('accepts a booking of exactly one day', () => {
        // Arrange — the boundary the guard above sits on: this one fits.
        const state = { days: days(1), items: [item(1, 1, 0, DAY_MINUTES)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 0, DAY_MINUTES]]);
        expect(next.days).toHaveLength(1);
    });

    test('throws for a day that is not in the calendar', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => spillFrom(state, 99, [])).toThrow('No day with id 99 to settle');
    });
});
