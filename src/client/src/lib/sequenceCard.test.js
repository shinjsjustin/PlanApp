import { CARD_STATE, sequenceCardModel } from './sequenceCard';

// The card's view model: its lifecycle face, its uniform outstanding list and
// the finished group, all derived from one stored list without changing it.

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

const todo = (id, status = 'incomplete', position = id, overrides = {}) => ({
    id,
    projectId: 1,
    sequenceId: 1,
    text: `To-do ${id}`,
    status,
    completedAt: null,
    position,
    isPinned: false,
    ...overrides,
});

describe('sequenceCardModel', () => {
    describe('the lists', () => {
        test('reads position order, not the order it was handed', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(3, 'incomplete', 2), todo(1, 'incomplete', 0)],
            });

            // Assert
            expect(model.outstanding.map((item) => item.id)).toEqual([1, 3]);
        });

        test('collects the finished ones separately', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete'), todo(2), todo(3, 'complete')],
            });

            // Assert
            expect(model.done.map((t) => t.id)).toEqual([1, 3]);
        });

        test('does not expose obsolete priority partitions', () => {
            // Act
            const model = sequenceCardModel({ sequence: sequence(), todos: [todo(1), todo(2)] });

            // Assert
            expect(model).not.toHaveProperty('next');
            expect(model).not.toHaveProperty('then');
        });

        test('returns every non-complete to-do in outstanding, in position order', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [
                    todo(3, 'blocked', 3),
                    todo(1, 'incomplete', 1),
                    todo(2, 'incomplete', 2),
                ],
            });

            // Assert
            expect(model.outstanding.map((item) => item.id)).toEqual([1, 2, 3]);
        });

        test('keeps complete to-dos out of outstanding and in done', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1, 'complete'), todo(2, 'incomplete')],
            });

            // Assert
            expect(model.outstanding.map((item) => item.id)).toEqual([2]);
            expect(model.done.map((item) => item.id)).toEqual([1]);
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

        test('exposes the top pinned to-do id', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [
                    todo(2, 'incomplete', 2, { isPinned: true }),
                    todo(1, 'complete', 1, { isPinned: true }),
                ],
            });

            // Assert
            expect(model.topPinnedTodoId).toBe(1);
        });

        test('exposes null when the sequence has no pin', () => {
            // Act
            const model = sequenceCardModel({ sequence: sequence(), todos: [todo(1)] });

            // Assert
            expect(model.topPinnedTodoId).toBeNull();
        });
    });

    describe('lifecycle faces', () => {
        test('wears the quiet default when there is outstanding work', () => {
            // Act
            const model = sequenceCardModel({ sequence: sequence(), todos: [todo(1)] });

            // Assert
            expect(model.state).toBe(CARD_STATE.notStarted);
        });

        test('keeps pin activity out of the lifecycle state', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence(),
                todos: [todo(1)],
                isActive: true,
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.notStarted);
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

        test('keeps blocked ahead of complete, as the rest of the app does', () => {
            // Act
            const model = sequenceCardModel({
                sequence: sequence({ isBlocked: true }),
                todos: [todo(1, 'complete')],
            });

            // Assert
            expect(model.state).toBe(CARD_STATE.blocked);
        });

        test('keeps blocked when the sequence is active through a pin', () => {
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
