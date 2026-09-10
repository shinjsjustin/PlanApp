import { DAY_MINUTES, DEFAULT_DURATION, MIN_DURATION, SLOT_MINUTES, settleDay } from './schedule';

/** A booking. Times in minutes from midnight. */
const item = (todoId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId: 1,
    startMinutes,
    durationMinutes,
});

/** The settled day as `[todoId, start, duration]` triples, top to bottom. */
const layout = (items) =>
    items.map((entry) => [entry.todoId, entry.startMinutes, entry.durationMinutes]);

describe('schedule constants', () => {
    test('a day is 24 hours on a 30-minute grid', () => {
        expect(DAY_MINUTES).toBe(1440);
        expect(SLOT_MINUTES).toBe(30);
        expect(MIN_DURATION).toBe(30);
        expect(DEFAULT_DURATION).toBe(60);
    });
});

describe('settleDay', () => {
    test('leaves a day whose items already fit exactly as it found it', () => {
        // Arrange
        const items = [item(1, 540), item(2, 600), item(3, 720)];

        // Act
        const settled = settleDay(items);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 60],
            [2, 600, 60],
            [3, 720, 60],
        ]);
    });

    test('never mutates the items it is given', () => {
        // Arrange
        const items = [item(1, 540, 120), item(2, 570)];
        const before = JSON.parse(JSON.stringify(items));

        // Act
        settleDay(items, [1]);

        // Assert
        expect(items).toEqual(before);
    });

    test('sorts a day given out of order', () => {
        // Arrange
        const items = [item(3, 720), item(1, 540), item(2, 600)];

        // Act + Assert
        expect(layout(settleDay(items)).map((entry) => entry[0])).toEqual([1, 2, 3]);
    });

    test('squeezes the gap below a grown item before pushing anything', () => {
        // Arrange — 09:00 grows to 2h; the next item sits at 11:00 with an hour
        // of slack above it, so it should not move at all.
        const items = [item(1, 540, 120), item(2, 660)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('pushes the item below once the gap is used up', () => {
        // Arrange — 09:00 grows to 2h and 09:30 is only half an hour below it
        const items = [item(1, 540, 120), item(2, 570)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('pushes a whole touching stack, all of it', () => {
        // Arrange
        const items = [item(1, 540, 120), item(2, 600), item(3, 660), item(4, 720)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
            [3, 720, 60],
            [4, 780, 60],
        ]);
    });

    test('absorbs a gap partway down the stack instead of pushing past it', () => {
        // Arrange — the push runs out of force at the gap before item 3
        const items = [item(1, 540, 90), item(2, 600), item(3, 720)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 90],
            [2, 630, 60],
            [3, 720, 60],
        ]);
    });

    test('leaves a gap when an item shrinks and pulls nothing up', () => {
        // Arrange — decision 7: the push is destructive and downward only
        const items = [item(1, 540, 30), item(2, 660), item(3, 720)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 30],
            [2, 660, 60],
            [3, 720, 60],
        ]);
    });

    test('never moves an item above the anchor', () => {
        // Arrange
        const items = [item(1, 0), item(2, 540, 120), item(3, 600)];

        // Act
        const settled = settleDay(items, [2]);

        // Assert — item 1 is untouched; only what is below the anchor moves
        expect(layout(settled)).toEqual([
            [1, 0, 60],
            [2, 540, 120],
            [3, 660, 60],
        ]);
    });

    test('puts the anchor above an item it was dropped exactly on top of', () => {
        // Arrange — this is what makes "drop between two items" work
        const items = [item(2, 600), item(1, 600)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 600, 60],
            [2, 660, 60],
        ]);
    });

    test('slides the anchor down when the item above overlaps it', () => {
        // Arrange — dropped at 09:30 under a two-hour 09:00 booking
        const items = [item(1, 540, 120), item(2, 570)];

        // Act
        const settled = settleDay(items, [2]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('treats multiple anchors as one group at the top', () => {
        // Arrange — the shape a spill hands the next day
        const items = [item(9, 0), item(1, 0), item(2, 60)];

        // Act
        const settled = settleDay(items, [1, 2]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 0, 60],
            [2, 60, 60],
            [9, 120, 60],
        ]);
    });

    test('handles an empty day', () => {
        expect(settleDay([])).toEqual([]);
    });
});
