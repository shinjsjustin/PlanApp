'use strict';

const { toPositions } = require('./positions');

/**
 * Small shared helpers for the repository modules.
 *
 * Only column names — never values — are ever interpolated into SQL here, and
 * those come from a fixed allow-list owned by each repository, never from a
 * request body. Every value travels as a bound parameter.
 */

/** Returns the first row of a result set, or null when there is none. */
const firstRow = (rows) => (rows.length > 0 ? rows[0] : null);

/**
 * Builds the `SET` clause of an UPDATE from a patch object.
 *
 * `columns` maps patch keys to column names and doubles as the allow-list: keys
 * outside it are ignored, and keys whose value is `undefined` are treated as
 * "not supplied" so a patch only touches the fields it names.
 *
 * Throws when the patch names nothing to change — an empty UPDATE is a caller
 * bug, not something to silently succeed at.
 */
const buildAssignments = (patch, columns) => {
    const keys = Object.keys(columns).filter((key) => patch[key] !== undefined);

    if (keys.length === 0) {
        throw new Error(
            `No fields to update. Supply at least one of: ${Object.keys(columns).join(', ')}`
        );
    }

    return {
        clause: keys.map((key) => `\`${columns[key]}\` = ?`).join(', '),
        values: keys.map((key) => patch[key]),
    };
};

/**
 * Tables whose rows carry a dense `position` column. The set doubles as the
 * allow-list for the only place a table name is interpolated into SQL.
 */
const POSITIONED_TABLES = new Set(['layers', 'sequences', 'todos', 'calendar_days']);

/**
 * Rewrites `position` for an ordering so it is dense 0..n-1 again.
 *
 * Callers run this inside a transaction, right after the insert, delete or move
 * that disturbed the ordering. Updates are issued one at a time because a single
 * mysql2 connection runs one statement at a time.
 */
const applyPositions = async (conn, table, orderedIds) => {
    if (!POSITIONED_TABLES.has(table)) {
        throw new Error(`Table "${table}" has no dense position column`);
    }

    for (const { id, position } of toPositions(orderedIds)) {
        await conn.execute(`UPDATE \`${table}\` SET \`position\` = ? WHERE id = ?`, [
            position,
            id,
        ]);
    }
};

module.exports = { firstRow, buildAssignments, applyPositions };
