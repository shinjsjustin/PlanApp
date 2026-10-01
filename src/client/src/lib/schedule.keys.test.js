import {
    itemKeyOf,
    moveItem,
    placeFromPool,
    resizeItem,
    settleDay,
    spillFrom,
    topEdgeFloor,
    unscheduleItem,
} from './schedule';

const todo = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    sequenceId: 9,
    dayId,
    startMinutes,
    durationMinutes,
});

const sequence = (sequenceId, dayId, startMinutes, durationMinutes = 60) => ({
    kind: 'sequence',
    todoId: null,
    sequenceId,
    dayId,
    startMinutes,
    durationMinutes,
});

const days = [
    { id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' },
    { id: 2, position: 1, createdAt: '2026-09-09T08:00:00.000Z' },
];

const mixed = () => ({ days, items: [todo(5, 1, 0), sequence(5, 1, 60)] });

const startsOf = (state) =>
    Object.fromEntries(state.items.map((entry) => [itemKeyOf(entry), entry.startMinutes]));

describe('itemKeyOf', () => {
    test.each([
        [{ kind: 'sequence', todoId: null, sequenceId: 5 }, 'sequence:5'],
        [{ todoId: 5, sequenceId: 5 }, 'todo:5'],
        [{ kind: 'todo', todoId: 7, sequenceId: 5 }, 'todo:7'],
    ])('keys %j as %s', (entry, key) => {
        expect(itemKeyOf(entry)).toBe(key);
    });
});

describe('sequence bookings', () => {
    test('moveItem moves only the sequence booking when ids are equal', () => {
        const next = moveItem(mixed(), { kind: 'sequence', sequenceId: 5, dayId: 2, startMinutes: 120 });

        expect(startsOf(next)).toEqual({ 'todo:5': 0, 'sequence:5': 120 });
        expect(next.items.find((i) => i.kind === 'sequence').dayId).toBe(2);
        expect(next.items.find((i) => i.todoId === 5).dayId).toBe(1);
    });

    test('moveItem with a numeric todoId moves only the to-do', () => {
        const next = moveItem(mixed(), { todoId: 5, dayId: 2, startMinutes: 300 });

        expect(next.items.find((i) => i.todoId === 5).dayId).toBe(2);
        expect(next.items.find((i) => i.kind === 'sequence').dayId).toBe(1);
    });

    test('resizeItem resizes only the sequence booking', () => {
        const next = resizeItem(mixed(), {
            kind: 'sequence',
            sequenceId: 5,
            startMinutes: 60,
            durationMinutes: 180,
        });

        expect(next.items.find((i) => i.kind === 'sequence').durationMinutes).toBe(180);
        expect(next.items.find((i) => i.todoId === 5).durationMinutes).toBe(60);
    });

    test('unscheduleItem removes by key and leaves the same-numbered to-do', () => {
        const next = unscheduleItem(mixed(), 'sequence:5');

        expect(next.items.map(itemKeyOf)).toEqual(['todo:5']);
        expect(unscheduleItem(mixed(), 5).items.map(itemKeyOf)).toEqual(['sequence:5']);
        expect(unscheduleItem(mixed(), 'todo:5').items.map(itemKeyOf)).toEqual(['sequence:5']);
    });

    test('unscheduleItem throws naming the sequence when it is not booked', () => {
        expect(() => unscheduleItem({ days, items: [todo(5, 1, 0)] }, 'sequence:5')).toThrow(
            /Sequence 5 is not booked/
        );
    });

    test('placeFromPool books a sequence beside a to-do of the same id', () => {
        const state = { days, items: [todo(5, 1, 0)] };

        const next = placeFromPool(state, {
            kind: 'sequence',
            sequenceId: 5,
            dayId: 1,
            startMinutes: 0,
        });

        const booked = next.items.find((i) => i.kind === 'sequence');
        expect(booked).toMatchObject({ kind: 'sequence', sequenceId: 5, durationMinutes: 60 });
        expect(startsOf(next)).toEqual({ 'todo:5': 60, 'sequence:5': 0 });
    });

    test('placeFromPool refuses a second booking of the same sequence', () => {
        expect(() =>
            placeFromPool(mixed(), { kind: 'sequence', sequenceId: 5, dayId: 2, startMinutes: 0 })
        ).toThrow(/Sequence 5 is already booked/);
    });

    test('placeFromPool still refuses a second booking of the same to-do', () => {
        expect(() =>
            placeFromPool(mixed(), { todoId: 5, dayId: 2, startMinutes: 0 })
        ).toThrow(/To-do 5 is already booked/);
    });

    test('topEdgeFloor finds a sequence booking by key', () => {
        expect(topEdgeFloor(mixed(), 'sequence:5')).toBe(60);
        expect(topEdgeFloor(mixed(), 'todo:5')).toBe(0);
        expect(topEdgeFloor(mixed(), 5)).toBe(0);
    });

    test('settleDay anchors a sequence by key and wins the tie over the to-do', () => {
        const items = [todo(5, 1, 0), sequence(5, 1, 0)];

        const settled = settleDay(items, 'sequence:5');

        expect(settled.map(itemKeyOf)).toEqual(['sequence:5', 'todo:5']);
        expect(settled.map((i) => i.startMinutes)).toEqual([0, 60]);
    });

    test('spillFrom anchors a sequence and carries it to the next day', () => {
        const state = {
            days,
            items: [todo(5, 1, 0, 1380), sequence(5, 1, 1380, 120)],
        };

        const next = spillFrom(state, 1, ['sequence:5']);

        expect(next.items.find((i) => i.kind === 'sequence')).toMatchObject({
            dayId: 2,
            startMinutes: 0,
        });
        expect(next.items.find((i) => i.todoId === 5).dayId).toBe(1);
    });

    test('spillFrom keeps the to-do anchored by a bare numeric id', () => {
        const state = {
            days,
            items: [sequence(5, 1, 0, 60), todo(5, 1, 0, 60)],
        };

        const next = spillFrom(state, 1, [5]);

        expect(next.items.map(itemKeyOf).sort()).toEqual(['sequence:5', 'todo:5']);
        expect(startsOf(next)).toEqual({ 'todo:5': 0, 'sequence:5': 60 });
    });
});
