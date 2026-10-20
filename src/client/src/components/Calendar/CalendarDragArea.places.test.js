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

describe('previewFor with drives', () => {
    const booked = {
        days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }],
        items: [{ todoId: 1, dayId: 1, startMinutes: 540, durationMinutes: 60, placeId: 1 }],
    };
    const drives = {
        places: [{ id: 1, kind: 'other' }, { id: 2, kind: 'other' }],
        startPlaceId: null,
        minutesFor: () => 20,
    };
    const drop = (todo, withDrives) =>
        previewFor(booked, { kind: 'pool', todo, dayId: 1, startMinutes: 600 }, withDrives)
            .items.find((item) => item.todoId === todo.todoId);

    test('pushes a pool drop down by the drive from the booking above', () => {
        expect(drop({ todoId: 7, text: 'Bank', placeId: 2 }, drives).startMinutes).toBe(620);
    });

    test('adds no drive without drives', () => {
        expect(drop({ todoId: 7, text: 'Bank', placeId: 2 }).startMinutes).toBe(600);
    });

    test('pushes a moved booking down by the drive', () => {
        const two = {
            ...booked,
            items: [...booked.items, { todoId: 2, dayId: 1, startMinutes: 900, durationMinutes: 60, placeId: 2 }],
        };
        const moved = previewFor(two, { kind: 'booking', todo: { todoId: 2 }, dayId: 1, startMinutes: 600 }, drives);

        expect(moved.items.find((item) => item.todoId === 2).startMinutes).toBe(620);
    });
});
