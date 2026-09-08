'use strict';

const {
    toEdge,
    toFrontierEntry,
    toLayer,
    toProject,
    toSequence,
    toTodo,
} = require('../../src/lib/serializers');

/**
 * The serializers are the API boundary: snake_case rows in, camelCase payloads
 * out, with server-only columns left behind.
 */
describe('serializers', () => {
    describe('toLayer', () => {
        test('maps a layer row to its camelCase payload', () => {
            // Arrange
            const row = {
                id: 7,
                project_id: 3,
                title: 'Learning',
                position: 0,
                created_at: 'then',
                updated_at: 'later',
            };

            // Act
            const layer = toLayer(row);

            // Assert
            expect(layer).toEqual({
                id: 7,
                projectId: 3,
                title: 'Learning',
                position: 0,
                createdAt: 'then',
                updatedAt: 'later',
            });
        });
    });

    describe('toSequence', () => {
        test('maps a sequence row and turns is_blocked into a boolean', () => {
            // Arrange
            const row = {
                id: 11,
                project_id: 3,
                layer_id: 7,
                title: 'Learn aerodynamics',
                description: null,
                is_blocked: 1,
                is_collapsed: 0,
                position: 2,
                created_at: 'then',
                updated_at: 'later',
            };

            // Act
            const sequence = toSequence(row);

            // Assert
            expect(sequence).toEqual({
                id: 11,
                projectId: 3,
                layerId: 7,
                title: 'Learn aerodynamics',
                description: null,
                isBlocked: true,
                isCollapsed: false,
                position: 2,
                createdAt: 'then',
                updatedAt: 'later',
            });
        });

        test('reports an unblocked sequence as false, not 0', () => {
            expect(toSequence({ is_blocked: 0 }).isBlocked).toBe(false);
        });

        test('turns is_collapsed into a boolean too', () => {
            expect(toSequence({ is_collapsed: 1 }).isCollapsed).toBe(true);
            expect(toSequence({ is_collapsed: 0 }).isCollapsed).toBe(false);
        });
    });

    describe('toTodo', () => {
        test('maps a to-do row inside a sequence', () => {
            // Arrange
            const row = {
                id: 21,
                project_id: 3,
                sequence_id: 11,
                text: 'Read about lift',
                status: 'incomplete',
                completed_at: null,
                position: 0,
                created_at: 'then',
                updated_at: 'later',
            };

            // Act & Assert
            expect(toTodo(row)).toEqual({
                id: 21,
                projectId: 3,
                sequenceId: 11,
                text: 'Read about lift',
                status: 'incomplete',
                completedAt: null,
                position: 0,
                createdAt: 'then',
                updatedAt: 'later',
            });
        });

        test('keeps an unorganized to-do\'s sequenceId null', () => {
            expect(toTodo({ sequence_id: null }).sequenceId).toBeNull();
        });

        // The DONE group on a sequence card dates its rows from this, so it has
        // to survive the boundary as a value rather than as a missing key.
        test('carries the completion stamp through', () => {
            expect(toTodo({ status: 'complete', completed_at: 'friday' }).completedAt).toBe(
                'friday'
            );
        });

        test('reports a to-do that was never completed as null, not undefined', () => {
            expect(toTodo({ status: 'incomplete' }).completedAt).toBeNull();
        });
    });

    describe('toEdge', () => {
        test('maps an edge row to its camelCase payload', () => {
            // Arrange
            const row = { id: 31, project_id: 3, parent_id: 11, child_id: 12, created_at: 'then' };

            // Act & Assert
            expect(toEdge(row)).toEqual({
                id: 31,
                projectId: 3,
                parentId: 11,
                childId: 12,
                createdAt: 'then',
            });
        });
    });

    describe('toProject', () => {
        test('never leaks the owner id', () => {
            expect(toProject({ id: 3, owner_id: 99, title: 'Build a drone' })).not.toHaveProperty(
                'ownerId'
            );
        });
    });

    /**
     * `readyFrontier` skips a blocked to-do the way it skips a complete one
     * (spec section 3), so a null `nextTodo` no longer means only "this sequence
     * is empty". The entry carries which of the two it is, because the home card
     * says different things about them.
     */
    describe('toFrontierEntry', () => {
        const sequence = { id: 2, title: 'Learn aerodynamics' };

        test('carries the next to-do, narrowed to its id and text', () => {
            // Arrange
            const nextTodo = { id: 202, sequenceId: 2, text: 'Read up on lift', position: 0 };

            // Act & Assert — `position` and `status` stay off the wire.
            expect(toFrontierEntry({ sequence, nextTodo }, [nextTodo])).toEqual({
                sequenceId: 2,
                sequenceTitle: 'Learn aerodynamics',
                nextTodo: { id: 202, text: 'Read up on lift' },
                isStalled: false,
            });
        });

        test('reports a sequence holding no to-dos as not stalled', () => {
            // Act & Assert — nothing to pick up because there is nothing in it.
            expect(toFrontierEntry({ sequence, nextTodo: null }, [])).toMatchObject({
                nextTodo: null,
                isStalled: false,
            });
        });

        test('reports a sequence whose outstanding work is all blocked as stalled', () => {
            // Arrange — one done, one blocked, so nothing is startable.
            const todos = [
                { id: 201, sequenceId: 2, text: 'Read up on lift', status: 'complete' },
                { id: 202, sequenceId: 2, text: 'Wait on the wind tunnel', status: 'blocked' },
            ];

            // Act & Assert
            expect(toFrontierEntry({ sequence, nextTodo: null }, todos)).toMatchObject({
                nextTodo: null,
                isStalled: true,
            });
        });

        test('ignores to-dos belonging to other sequences', () => {
            // Arrange — the project's to-dos, none of them this sequence's.
            const todos = [{ id: 301, sequenceId: 9, text: 'Learn to solder', status: 'blocked' }];

            // Act & Assert
            expect(toFrontierEntry({ sequence, nextTodo: null }, todos)).toMatchObject({
                isStalled: false,
            });
        });
    });
});
