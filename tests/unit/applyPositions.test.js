'use strict';

const { applyPositions } = require('../../src/db/repositories/sql');

/**
 * The allow-list is the only thing standing between a table name and a SQL
 * string, so these tests pin both of its sides: the tables that are allowed
 * through, and the refusal for everything else.
 */
describe('applyPositions', () => {
    /** A connection stub that records the statements it was asked to run. */
    const recordingConn = () => {
        const calls = [];

        return {
            calls,
            execute: async (sql, values) => {
                calls.push({ sql, values });
                return [{}];
            },
        };
    };

    test('reindexes calendar_days to dense 0..n-1', async () => {
        // Arrange
        const conn = recordingConn();

        // Act
        await applyPositions(conn, 'calendar_days', [7, 3, 9]);

        // Assert
        expect(conn.calls.map((call) => call.values)).toEqual([
            [0, 7],
            [1, 3],
            [2, 9],
        ]);
    });

    test('refuses a table with no dense position column', async () => {
        // Arrange
        const conn = recordingConn();

        // Act + Assert
        await expect(applyPositions(conn, 'users', [1])).rejects.toThrow(
            'Table "users" has no dense position column'
        );
        expect(conn.calls).toHaveLength(0);
    });
});
