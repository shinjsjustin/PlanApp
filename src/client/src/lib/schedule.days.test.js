import { appendDay, removeDay } from './schedule';
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
