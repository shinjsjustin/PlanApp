import { CARD_STATE, sequenceCardModel } from './sequenceCard';

// The card's view model: which of the four faces a card wears, and the three
// lists it draws from one stored list.
//
// The precedence here is deliberately the app's rather than the design mock's —
// `blocked` wins over everything, as `sequenceStatus` has always said — and the
// test near the bottom pins that, because it is the one place the two disagree.

const sequence = (overrides = {}) => ({
    id: 1,
    projectId: 1,
    layerId: 10,
    title: 'Learn aerodynamics',
    isBlocked: false,
    isCollapsed: false,
    position: 0,
    ...overrides,
});

const todo = (id, status = 'incomplete', position = id) => ({
    id,
    projectId: 1,
    sequenceId: 1,
    text: `To-do ${id}`,
    status,
    completedAt: null,
    position,
});

describe('sequenceCardModel', () => {
    describe('the three lists', () => {
        test('puts the first outstanding to-do in the spotlight', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1), todo(2)],
            });

            // Assert
            expect(model.next.id).toBe(1);
        });

        test('reads position order, not the order it was handed', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(3, 'incomplete', 2), todo(1, 'incomplete', 0)],
            });

            // Assert
            expect(model.next.id).toBe(1);
            expect(model.then.map((t) => t.id)).toEqual([3]);
        });

        test('skips finished to-dos when choosing the next step', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete'), todo(2)],
            });

            // Assert
            expect(model.next.id).toBe(2);
        });

        // A blocked to-do is not finished, so it is still something to do.
        test('will put a blocked to-do in the spotlight', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'blocked'), todo(2)],
            });

            // Assert
            expect(model.next.id).toBe(1);
        });

        test('has no next step when everything is finished', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete')],
            });

            // Assert
            expect(model.next).toBeNull();
        });

        test('has no next step when the sequence is empty', () => {
            expect(sequenceCardModel({ sequence: sequence(), todos: [] }).next).toBeNull();
        });

        // No to-do is ever drawn twice: THEN is what is left after the
        // spotlight, and DONE is everything finished.
        test('never lists the spotlight to-do under THEN as well', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1), todo(2), todo(3)],
            });

            // Assert
            expect(model.then.map((t) => t.id)).toEqual([2, 3]);
        });

        test('collects the finished ones separately', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete'), todo(2), todo(3, 'complete')],
            });

            // Assert
            expect(model.done.map((t) => t.id)).toEqual([1, 3]);
            expect(model.then).toEqual([]);
        });

        test('keeps the whole list too, for the things that count in it', () => {
            // Act — drop targets and the delete prompt work in the stored order.
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete'), todo(2)],
            });

            // Assert
            expect(model.own.map((t) => t.id)).toEqual([1, 2]);
        });

        test('ignores to-dos filed elsewhere', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [
                    { ...todo(1), sequenceId: 2 },
                    { ...todo(2), sequenceId: null },
                    todo(3),
                ],
            });

            // Assert
            expect(model.own.map((t) => t.id)).toEqual([3]);
        });

        test('leaves its input untouched', () => {
            // Arrange
            const todos = [todo(2, 'incomplete', 1), todo(1, 'incomplete', 0)];
            const before = todos.map((t) => t.id);

            // Act
            sequenceCardModel({ sequence: sequence(), todos });

            // Assert
            expect(todos.map((t) => t.id)).toEqual(before);
        });
    });

    describe('the four faces', () => {
        test('wears the quiet default when there is work but it is not next', () => {
            // Act
            const model = sequenceCardModel({ sequence: sequence(), todos: [todo(1)] });

            // Assert
            expect(model.state).toBe(CARD_STATE.notStarted);
        });

        test('wears the spotlight when it is the sequence in operation', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1)],
                isActive: true,
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.active);
        });

        test('wears complete once every to-do is done', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete')],
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.complete);
        });

        // An empty sequence is not finished, it has not been started.
        test('does not call an empty sequence complete', () => {
            // Act
            const model = sequenceCardModel({ sequence: sequence(), todos: [] });

            // Assert
            expect(model.state).toBe(CARD_STATE.notStarted);
        });

        test('wears blocked when the sequence is blocked', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence({ isBlocked: true }),
                todos: [todo(1)],
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.blocked);
        });

        // The one place this deviates from the design handoff, deliberately: it
        // orders complete ahead of blocked, and the app has always done the
        // reverse. Letting the card call this "complete" while the footer, the
        // frontier and the server all called it "blocked" would be worse than
        // the deviation.
        test('keeps blocked ahead of complete, as the rest of the app does', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence({ isBlocked: true }),
                todos: [todo(1, 'complete')],
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.blocked);
        });

        test('keeps blocked ahead of the spotlight too', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence({ isBlocked: true }),
                todos: [todo(1)],
                isActive: true,
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.blocked);
        });
    });

    describe('the counts', () => {
        test('reports what is done, what there is, and what is left', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete'), todo(2), todo(3)],
            });

            // Assert
            expect(model.counts).toEqual({ done: 1, total: 3, remaining: 2 });
        });
    });
});
