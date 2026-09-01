const {
    insertAt,
    removeItem,
    moveItem,
    toPositions,
} = require('../../src/db/repositories/positions');

/**
 * `positions` holds the dense-position reindexing helpers described in spec
 * section 4.2: every ordered list keeps positions 0..n-1 with no gaps, and every
 * helper returns a brand new array rather than touching the one it was given.
 */

const isDense = (orderedIds) =>
    toPositions(orderedIds).every((row, index) => row.position === index);

describe('toPositions', () => {
    test('maps an ordered id list to dense 0..n-1 positions', () => {
        // Arrange
        const orderedIds = [7, 3, 9];

        // Act
        const positions = toPositions(orderedIds);

        // Assert
        expect(positions).toEqual([
            { id: 7, position: 0 },
            { id: 3, position: 1 },
            { id: 9, position: 2 },
        ]);
    });

    test('returns an empty list for an empty ordering', () => {
        expect(toPositions([])).toEqual([]);
    });

    test('rejects a non-array ordering', () => {
        expect(() => toPositions(null)).toThrow(TypeError);
    });
});

describe('insertAt', () => {
    test('inserts at the requested index and keeps positions dense', () => {
        // Arrange
        const orderedIds = [10, 20, 30];

        // Act
        const result = insertAt(orderedIds, 99, 1);

        // Assert
        expect(result).toEqual([10, 99, 20, 30]);
        expect(isDense(result)).toBe(true);
    });

    test('inserts at the head', () => {
        expect(insertAt([10, 20], 99, 0)).toEqual([99, 10, 20]);
    });

    test('inserts at the tail when index equals the list length', () => {
        expect(insertAt([10, 20], 99, 2)).toEqual([10, 20, 99]);
    });

    test('inserts into an empty list', () => {
        expect(insertAt([], 99, 0)).toEqual([99]);
    });

    test('returns a new array and leaves the input untouched', () => {
        // Arrange
        const orderedIds = [10, 20, 30];

        // Act
        const result = insertAt(orderedIds, 99, 1);

        // Assert
        expect(result).not.toBe(orderedIds);
        expect(orderedIds).toEqual([10, 20, 30]);
    });

    test('rejects an index past the end of the list', () => {
        expect(() => insertAt([10, 20], 99, 3)).toThrow(RangeError);
    });

    test('rejects a negative index', () => {
        expect(() => insertAt([10, 20], 99, -1)).toThrow(RangeError);
    });

    test('rejects a non-integer index', () => {
        expect(() => insertAt([10, 20], 99, 1.5)).toThrow(RangeError);
    });

    test('rejects an id that is already in the list', () => {
        expect(() => insertAt([10, 20], 20, 0)).toThrow(/already/i);
    });
});

describe('removeItem', () => {
    test('removes from the middle and closes the gap', () => {
        // Arrange
        const orderedIds = [10, 20, 30, 40];

        // Act
        const result = removeItem(orderedIds, 20);

        // Assert
        expect(result).toEqual([10, 30, 40]);
        expect(isDense(result)).toBe(true);
    });

    test('removes the head', () => {
        expect(removeItem([10, 20, 30], 10)).toEqual([20, 30]);
    });

    test('removes the tail', () => {
        expect(removeItem([10, 20, 30], 30)).toEqual([10, 20]);
    });

    test('removes the only item', () => {
        expect(removeItem([10], 10)).toEqual([]);
    });

    test('returns a new array and leaves the input untouched', () => {
        // Arrange
        const orderedIds = [10, 20, 30];

        // Act
        const result = removeItem(orderedIds, 20);

        // Assert
        expect(result).not.toBe(orderedIds);
        expect(orderedIds).toEqual([10, 20, 30]);
    });

    test('rejects an id that is not in the list', () => {
        expect(() => removeItem([10, 20], 99)).toThrow(/not in/i);
    });
});

describe('moveItem', () => {
    test('moves an item forward within the list', () => {
        // Arrange
        const orderedIds = [10, 20, 30, 40];

        // Act
        const result = moveItem(orderedIds, 10, 2);

        // Assert
        expect(result).toEqual([20, 30, 10, 40]);
        expect(isDense(result)).toBe(true);
    });

    test('moves an item backward within the list', () => {
        // Arrange
        const orderedIds = [10, 20, 30, 40];

        // Act
        const result = moveItem(orderedIds, 40, 1);

        // Assert
        expect(result).toEqual([10, 40, 20, 30]);
        expect(isDense(result)).toBe(true);
    });

    test('moving an item to its current index is a no-op ordering', () => {
        expect(moveItem([10, 20, 30], 20, 1)).toEqual([10, 20, 30]);
    });

    test('moves an item to the tail', () => {
        expect(moveItem([10, 20, 30], 10, 2)).toEqual([20, 30, 10]);
    });

    test('returns a new array and leaves the input untouched', () => {
        // Arrange
        const orderedIds = [10, 20, 30];

        // Act
        const result = moveItem(orderedIds, 30, 0);

        // Assert
        expect(result).not.toBe(orderedIds);
        expect(orderedIds).toEqual([10, 20, 30]);
    });

    test('rejects an index past the last slot', () => {
        expect(() => moveItem([10, 20, 30], 10, 3)).toThrow(RangeError);
    });

    test('rejects a negative index', () => {
        expect(() => moveItem([10, 20, 30], 10, -1)).toThrow(RangeError);
    });

    test('rejects an id that is not in the list', () => {
        expect(() => moveItem([10, 20], 99, 0)).toThrow(/not in/i);
    });
});
