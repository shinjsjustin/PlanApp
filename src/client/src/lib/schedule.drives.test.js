import { moveItem, placeFromPool, resizeItem, settleDay, spillFrom } from './schedule';

const booking = (todoId, startMinutes, durationMinutes, placeId, dayId = 1) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
    placeId,
});

const starts = (items) => items.map((entry) => [entry.todoId, entry.startMinutes]);

const places = [
    { id: 1, kind: 'work' },
    { id: 2, kind: 'home' },
    { id: 3, kind: 'other' },
];

const drivesWith = (minutes, startPlaceId = null) => ({
    places,
    startPlaceId,
    minutesFor: jest.fn((from, to) => minutes[`${from}-${to}`] ?? 0),
});

describe('settleDay with drives', () => {
    test('pushes the second of two touching bookings at different places down by the drive', () => {
        const drives = drivesWith({ '2-3': 20 });
        const items = [booking(1, 540, 60, 2), booking(2, 600, 60, 3)];

        expect(starts(settleDay(items, [], drives))).toEqual([[1, 540], [2, 620]]);
    });

    test('pushes later bookings after the pushed one', () => {
        const drives = drivesWith({ '2-3': 20 });
        const items = [booking(1, 540, 60, 2), booking(2, 600, 60, 3), booking(3, 660, 30, 3)];

        expect(starts(settleDay(items, [], drives))).toEqual([[1, 540], [2, 620], [3, 680]]);
    });

    test('adds no drive between bookings at the same place', () => {
        const drives = drivesWith({ '2-2': 20 });
        const items = [booking(1, 540, 60, 2), booking(2, 600, 60, 2)];

        expect(starts(settleDay(items, [], drives))).toEqual([[1, 540], [2, 600]]);
    });

    test('keeps a gap that already holds the drive', () => {
        const drives = drivesWith({ '2-3': 20 });
        const items = [booking(1, 540, 60, 2), booking(2, 630, 60, 3)];

        expect(starts(settleDay(items, [], drives))).toEqual([[1, 540], [2, 630]]);
    });

    test('gives the first placed booking at a work place no drive', () => {
        const drives = drivesWith({ '2-1': 40 }, 2);

        expect(starts(settleDay([booking(1, 480, 60, 1)], [], drives))).toEqual([[1, 480]]);
    });

    test('starts the first placed booking elsewhere after the drive from the start place', () => {
        const drives = drivesWith({ '2-3': 40 }, 2);

        expect(starts(settleDay([booking(1, 480, 60, 3)], [], drives))).toEqual([[1, 520]]);
    });

    test('adds no first drive when there is no start place', () => {
        const drives = drivesWith({ '2-3': 40 }, null);

        expect(starts(settleDay([booking(1, 480, 60, 3)], [], drives))).toEqual([[1, 480]]);
    });

    test('gives an unplaced booking no drive and keeps the last place', () => {
        const drives = drivesWith({ '2-3': 20, '3-2': 99 });
        const items = [booking(1, 540, 60, 2), booking(2, 600, 30, null), booking(3, 630, 30, 3)];

        expect(starts(settleDay(items, [], drives))).toEqual([[1, 540], [2, 600], [3, 650]]);
    });

    test('settles as before without drives', () => {
        const items = [booking(1, 540, 60, 2), booking(2, 600, 60, 3)];

        expect(starts(settleDay(items))).toEqual([[1, 540], [2, 600]]);
    });
});

describe('spillFrom with drives', () => {
    const state = (items) => ({ days: [{ id: 1, position: 0 }], items });

    test('keeps a 900-minute booking alone on its day after a 30-minute drive', () => {
        const drives = drivesWith({ '2-3': 30 }, 2);
        const result = spillFrom(state([booking(1, 480, 900, 3)]), 1, [], drives);

        expect(result.days).toHaveLength(1);
        expect(starts(result.items)).toEqual([[1, 510]]);
    });

    test('spills a pushed booking to the next day and starts it after its drive there', () => {
        const drives = drivesWith({ '2-3': 30 }, 2);
        const result = spillFrom(state([booking(1, 1330, 60, 3)]), 1, [], drives);

        expect(result.days).toHaveLength(2);
        expect(result.items[0].dayId).toBe(result.days[1].id);
        expect(result.items[0].startMinutes).toBe(510);
    });
});

describe('gestures with drives', () => {
    const base = () => ({
        days: [{ id: 1, position: 0 }],
        items: [booking(1, 540, 60, 2), booking(2, 720, 60, 3)],
    });
    const drives = () => drivesWith({ '2-3': 20 });

    test('moveItem pushes by the drive', () => {
        const result = moveItem(base(), { todoId: 2, dayId: 1, startMinutes: 600 }, drives());

        expect(starts(result.items.filter((entry) => entry.todoId === 2))).toEqual([[2, 620]]);
    });

    test('resizeItem pushes the next booking by the drive', () => {
        const result = resizeItem(
            base(),
            { todoId: 1, startMinutes: 540, durationMinutes: 180 },
            drives()
        );

        expect(starts(result.items.filter((entry) => entry.todoId === 2))).toEqual([[2, 740]]);
    });

    test('placeFromPool pushes the dropped booking by the drive', () => {
        const result = placeFromPool(
            base(),
            { todoId: 3, dayId: 1, startMinutes: 600, durationMinutes: 60, placeId: 3 },
            drives()
        );

        expect(starts(result.items.filter((entry) => entry.todoId === 3))).toEqual([[3, 620]]);
    });
});
