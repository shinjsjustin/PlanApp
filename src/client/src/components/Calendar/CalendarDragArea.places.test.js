import { previewFor } from './CalendarDragArea';

const schedule = { days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }], items: [] };

const dropOf = (todo) =>
    previewFor(schedule, { kind: 'pool', todo, dayId: 1, startMinutes: 540 }).items[0];

describe('previewFor with a place visit length', () => {
    test('books a pool item for its visitMinutes', () => {
        const item = dropOf({ todoId: 7, text: 'Groceries', visitMinutes: 90 });

        expect(item.durationMinutes).toBe(90);
    });

    test('books a pool item without visitMinutes for the default hour', () => {
        const item = dropOf({ todoId: 7, text: 'Groceries' });

        expect(item.durationMinutes).toBe(60);
    });

    test('keeps visitMinutes out of the booking', () => {
        const item = dropOf({ todoId: 7, text: 'Groceries', visitMinutes: 90 });

        expect(item).not.toHaveProperty('visitMinutes');
    });
});
