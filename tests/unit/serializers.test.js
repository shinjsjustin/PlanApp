'use strict';

const {
    toEdge,
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
});
