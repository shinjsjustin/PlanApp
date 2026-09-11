'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');

/**
 * What appending a day costs, in statements.
 *
 * `calendarDaysRepo.create` is called once per appended day inside the bulk
 * endpoint's transaction, so anything it does per call is multiplied by the
 * number of days a single gesture adds. Appending at the end of a dense strip
 * cannot disturb the ordering, so it must not rewrite one: a reindex here would
 * rewrite every existing day's `position` to the value it already holds, once
 * per appended day.
 *
 * The density this relies on is asserted against a real database in
 * `tests/integration/calendarDaysRepo.test.js`; this pins the statements.
 */

const NEW_DAY_ID = 501;
const OWNER_ID = 3;

const dayRow = (id, ownerId, position) => ({ id, owner_id: ownerId, position });

/**
 * A strip that already holds `existingDays` days, dense 0..n-1, standing in for
 * the database. It answers whichever read it is given — a count, the owner's
 * days in order, or one day by id — so that a `create` which reindexes reaches
 * its UPDATEs rather than tripping over the stub.
 */
const recordingConn = (existingDays, ownerId) => {
    const calls = [];
    const strip = Array.from({ length: existingDays }, (unused, index) =>
        dayRow(index + 1, ownerId, index)
    );

    return {
        calls,
        statements: () => calls.map((call) => call.sql.trim().split(/\s+/)[0]),
        execute: async (sql, values) => {
            calls.push({ sql, values });

            if (sql.includes('COUNT(*)')) return [[{ total: strip.length }]];
            if (sql.startsWith('INSERT')) return [{ insertId: NEW_DAY_ID }];
            if (sql.includes('WHERE id = ?')) {
                return [[dayRow(NEW_DAY_ID, ownerId, strip.length)]];
            }

            return [strip];
        },
    };
};

describe('calendarDaysRepo.create', () => {
    test('appends without rewriting the positions already on the strip', async () => {
        // Arrange — a strip that is already forty days long.
        const conn = recordingConn(40, OWNER_ID);

        // Act
        await calendarDaysRepo.create(conn, { ownerId: OWNER_ID });

        // Assert
        expect(conn.statements()).not.toContain('UPDATE');
    });

    test('places the new day at the end of the strip', async () => {
        // Arrange
        const conn = recordingConn(40, OWNER_ID);

        // Act
        const day = await calendarDaysRepo.create(conn, { ownerId: OWNER_ID });

        // Assert
        const insert = conn.calls.find((call) => call.sql.startsWith('INSERT'));
        expect(insert.values).toEqual([OWNER_ID, 40]);
        expect(day.position).toBe(40);
    });

    test('places the first day of an empty strip at position 0', async () => {
        // Arrange
        const conn = recordingConn(0, OWNER_ID);

        // Act
        await calendarDaysRepo.create(conn, { ownerId: OWNER_ID });

        // Assert
        const insert = conn.calls.find((call) => call.sql.startsWith('INSERT'));
        expect(insert.values).toEqual([OWNER_ID, 0]);
    });

    test('costs the same number of statements however long the strip is', async () => {
        // Arrange
        const short = recordingConn(1, OWNER_ID);
        const long = recordingConn(300, OWNER_ID);

        // Act
        await calendarDaysRepo.create(short, { ownerId: OWNER_ID });
        await calendarDaysRepo.create(long, { ownerId: OWNER_ID });

        // Assert
        expect(long.calls).toHaveLength(short.calls.length);
    });
});
