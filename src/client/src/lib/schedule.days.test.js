import { appendDay, removeDay, removePastDays, spillFrom } from './schedule';
import { isTempId } from './tempIds';

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const item = (todoId, dayId, startMinutes) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes: 60,
});

describe('appendDay', () => {
    test('adds an unsaved day at the end', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [] };

        // Act
        const next = appendDay(state);

        // Assert
        expect(next.days).toHaveLength(2);
        expect(isTempId(next.days[1].id)).toBe(true);
        expect(next.days[1].position).toBe(1);
    });

    test('starts an empty calendar at position 0', () => {
        expect(appendDay({ days: [], items: [] }).days[0].position).toBe(0);
    });

    test('does not mutate the state it is given', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [] };

        // Act
        appendDay(state);

        // Assert
        expect(state.days).toHaveLength(1);
    });
});

describe('removeDay', () => {
    test('drops the day and closes the gap in positions', () => {
        // Arrange
        const state = { days: [day(1, 0), day(2, 1), day(3, 2)], items: [] };

        // Act
        const next = removeDay(state, 2);

        // Assert
        expect(next.days).toEqual([
            { ...day(1, 0), position: 0 },
            { ...day(3, 2), position: 1 },
        ]);
    });

    test('keeps the identity of a day whose position does not change', () => {
        // Arrange — removing the rightmost day leaves day 1's position
        // untouched, so a rendered day column can memoize on it.
        const state = { days: [day(1, 0), day(2, 1)], items: [] };

        // Act
        const next = removeDay(state, 2);

        // Assert
        expect(next.days[0]).toBe(state.days[0]);
    });

    test('never mutates the state it is given', () => {
        // Arrange
        const state = {
            days: [day(1, 0), day(2, 1), day(3, 2)],
            items: [item(7, 1, 540), item(8, 2, 0), item(9, 3, 0)],
        };
        const before = JSON.parse(JSON.stringify(state));

        // Act
        removeDay(state, 2);

        // Assert
        expect(state).toEqual(before);
    });

    test('empties the calendar when the last day is removed', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [item(7, 1, 540)] };

        // Act
        const next = removeDay(state, 1);

        // Assert
        expect(next.days).toEqual([]);
        expect(next.items).toEqual([]);
    });

    test('releases the bookings in it and leaves the others', () => {
        // Arrange — decision 6: the container goes, the work does not
        const state = {
            days: [day(1, 0), day(2, 1)],
            items: [item(7, 1, 540), item(8, 2, 0)],
        };

        // Act
        const next = removeDay(state, 1);

        // Assert
        expect(next.items).toEqual([item(8, 2, 0)]);
    });

    test('throws for a day that is not in the calendar', () => {
        expect(() => removeDay({ days: [], items: [] }, 9)).toThrow(
            'No day with id 9 to remove'
        );
    });
});

const dated = (id, position, date) => ({ ...day(id, position), ...(date ? { date } : {}) });

describe('dated days', () => {
    test('appendDay gives the new day the last date plus one', () => {
        const state = { days: [dated(1, 0, '2026-10-31')], items: [] };

        expect(appendDay(state).days[1].date).toBe('2026-11-01');
    });

    test('appendDay leaves the new day undated after an undated day', () => {
        const next = appendDay({ days: [day(1, 0)], items: [] });

        expect('date' in next.days[1]).toBe(false);
    });

    test('a spill past the last day dates the new day the last date plus one', () => {
        const state = {
            days: [dated(1, 0, '2026-10-15')],
            items: [item(1, 1, 0), { ...item(2, 1, 0), startMinutes: 1400, durationMinutes: 60 }],
        };

        const next = spillFrom(state, 1, [2]);

        expect(next.days).toHaveLength(2);
        expect(next.days[1].date).toBe('2026-10-16');
    });

    test('a spill after an undated last day stays undated', () => {
        const state = {
            days: [day(1, 0)],
            items: [{ ...item(2, 1, 1400), durationMinutes: 60 }],
        };

        const next = spillFrom(state, 1, [2]);

        expect(next.days).toHaveLength(2);
        expect('date' in next.days[1]).toBe(false);
    });
});

describe('removePastDays', () => {
    test('drops days before today with their items, keeps today, future and undated, and re-densifies', () => {
        const state = {
            days: [
                dated(1, 0, '2026-10-13'),
                dated(2, 1, '2026-10-14'),
                dated(3, 2, '2026-10-15'),
                dated(4, 3, '2026-10-16'),
                dated(5, 4),
            ],
            items: [item(1, 1, 0), item(2, 3, 0), item(3, 4, 0)],
        };

        const next = removePastDays(state, '2026-10-15');

        expect(next.days.map((d) => [d.id, d.position])).toEqual([
            [3, 0],
            [4, 1],
            [5, 2],
        ]);
        expect(next.items.map((i) => i.todoId)).toEqual([2, 3]);
    });

    test('returns the same shape when nothing is past', () => {
        const state = { days: [dated(1, 0, '2026-10-15')], items: [] };

        expect(removePastDays(state, '2026-10-15').days).toEqual(state.days);
    });
});
