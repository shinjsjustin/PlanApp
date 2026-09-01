import { DROP_TARGET, isEligibleDropTarget, resolveTodoPlacement } from './dragDrop';

// What a drop means, worked out from plain data (spec section 4.7).
//
// jsdom has no layout, so nothing here drags anything. These are the rules the
// drop handler applies once `@dnd-kit` has said which droppable the pointer — or
// the keyboard — ended on: whether that droppable will accept this to-do at all,
// and which index it lands on if it will.

const TODOS = [
    { id: 1000, sequenceId: null, position: 0 },
    { id: 1001, sequenceId: null, position: 1 },
    { id: 2000, sequenceId: 100, position: 0 },
    { id: 2001, sequenceId: 100, position: 1 },
    { id: 2002, sequenceId: 100, position: 2 },
    { id: 3000, sequenceId: 200, position: 0 },
];

const todo = (id) => TODOS.find((item) => item.id === id);

const placement = (activeId, target) =>
    resolveTodoPlacement({ activeTodo: todo(activeId), target, todos: TODOS });

const append = (sequenceId) => ({ kind: DROP_TARGET.append, sequenceId });
const gap = (sequenceId, index) => ({ kind: DROP_TARGET.gap, sequenceId, index });
const onItem = (sequenceId, index) => ({ kind: DROP_TARGET.item, sequenceId, index });

describe('isEligibleDropTarget', () => {
    test('accepts any sequence for a to-do waiting in the unorganized panel', () => {
        expect(isEligibleDropTarget(todo(1000), 100)).toBe(true);
        expect(isEligibleDropTarget(todo(1000), 200)).toBe(true);
    });

    test('accepts the sequence a filed to-do is already in, because that is a reorder', () => {
        expect(isEligibleDropTarget(todo(2000), 100)).toBe(true);
    });

    // Spec section 2: dragging a to-do between sequences is out of scope for v1.
    test('refuses another sequence for a to-do already filed in one', () => {
        expect(isEligibleDropTarget(todo(2000), 200)).toBe(false);
    });

    // Spec section 2: a to-do leaves a sequence through the per-item menu.
    test('refuses the unorganized panel, which is not a drop target at all', () => {
        expect(isEligibleDropTarget(todo(2000), null)).toBe(false);
        expect(isEligibleDropTarget(todo(1000), null)).toBe(false);
    });
});

describe('dropping a loose to-do into a sequence', () => {
    test('appends it when the drop lands on the card body', () => {
        expect(placement(1000, append(100))).toEqual({ sequenceId: 100, position: 3 });
    });

    test('appends it to an empty sequence at position 0', () => {
        expect(
            resolveTodoPlacement({ activeTodo: todo(1000), target: append(999), todos: TODOS })
        ).toEqual({ sequenceId: 999, position: 0 });
    });

    test('inserts it at the index of the gap it lands on', () => {
        expect(placement(1000, gap(100, 0))).toEqual({ sequenceId: 100, position: 0 });
        expect(placement(1000, gap(100, 2))).toEqual({ sequenceId: 100, position: 2 });
    });

    test('takes the place of a to-do it is dropped onto, pushing it down', () => {
        expect(placement(1000, onItem(100, 1))).toEqual({ sequenceId: 100, position: 1 });
    });
});

/**
 * `position` for a reorder is the index the to-do lands on once it has been
 * lifted out of the list, which is what both the sortable preset and the
 * server's `moveItem` mean by it. A gap index counts the to-do against itself
 * and so has to be converted; an index over another to-do does not.
 */
describe('reordering a to-do inside its own sequence', () => {
    test('lands on the index of the to-do it is dropped onto', () => {
        expect(placement(2000, onItem(100, 2))).toEqual({ sequenceId: 100, position: 2 });
        expect(placement(2002, onItem(100, 0))).toEqual({ sequenceId: 100, position: 0 });
    });

    test('discounts itself from a gap index below where it started', () => {
        // The gap at 3 is the end of the list; lifting 2000 out makes that 2.
        expect(placement(2000, gap(100, 3))).toEqual({ sequenceId: 100, position: 2 });
    });

    test('keeps a gap index above where it started as it is', () => {
        expect(placement(2002, gap(100, 1))).toEqual({ sequenceId: 100, position: 1 });
    });

    test('goes to the end of the list when dropped on the card body', () => {
        expect(placement(2000, append(100))).toEqual({ sequenceId: 100, position: 2 });
    });

    test('asks for no move when it is dropped back where it started', () => {
        expect(placement(2001, onItem(100, 1))).toBeNull();
        expect(placement(2001, gap(100, 1))).toBeNull();
        expect(placement(2001, gap(100, 2))).toBeNull();
        expect(placement(2002, append(100))).toBeNull();
    });
});

describe('a drop the target will not accept', () => {
    test('asks for no move when a filed to-do lands on another sequence', () => {
        expect(placement(2000, append(200))).toBeNull();
        expect(placement(2000, gap(200, 0))).toBeNull();
        expect(placement(2000, onItem(200, 0))).toBeNull();
    });

    test('asks for no move when a to-do lands back on the unorganized panel', () => {
        expect(placement(2000, append(null))).toBeNull();
        expect(placement(1000, onItem(null, 0))).toBeNull();
    });
});
