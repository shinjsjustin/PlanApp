'use strict';

const { toUtcDatetime } = require('../../lib/rhythm');

/**
 * Data access for Rhythm anchors, gates and their deletion tombstones. Every
 * query is scoped to the owner. Instants are DATETIME(3) UTC, set with
 * UTC_TIMESTAMP(3) and read back as ISO strings ending in Z, never Date objects.
 */

const TOMBSTONE_DAYS = 30;

// DATE_FORMAT's %f is microseconds, so the milliseconds are spliced in by hand.
const isoInstant = (expr) =>
    `CONCAT(DATE_FORMAT(${expr}, '%Y-%m-%dT%H:%i:%s.'), LPAD(MICROSECOND(${expr}) DIV 1000, 3, '0'), 'Z')`;

const TABLES = {
    anchor: {
        table: 'rhythm_anchors',
        fields: ['title', 'description', 'at_minutes', 'weekdays', 'enabled'],
        select: `SELECT id, owner_id, external_id, title, description, at_minutes, weekdays, enabled,
            ${isoInstant('created_at')} AS created_at, ${isoInstant('updated_at')} AS updated_at, updated_by
         FROM rhythm_anchors`,
        order: 'at_minutes, id',
    },
    gate: {
        table: 'rhythm_gates',
        fields: ['title', 'kind', 'opens_at', 'closes_at', 'state', 'hub_url'],
        select: `SELECT id, owner_id, external_id, title, kind,
            ${isoInstant('opens_at')} AS opens_at, ${isoInstant('closes_at')} AS closes_at,
            state, hub_url, ${isoInstant('created_at')} AS created_at,
            ${isoInstant('updated_at')} AS updated_at, updated_by
         FROM rhythm_gates`,
        order: 'opens_at, id',
    },
};

const getOne = async (conn, kind, ownerId, externalId) => {
    const [rows] = await conn.execute(`${TABLES[kind].select} WHERE owner_id = ? AND external_id = ?`, [
        ownerId,
        externalId,
    ]);

    return rows[0] ?? null;
};

const list = async (conn, kind, ownerId) => {
    const [rows] = await conn.execute(`${TABLES[kind].select} WHERE owner_id = ? ORDER BY ${TABLES[kind].order}`, [
        ownerId,
    ]);

    return rows;
};

const listAnchors = (conn, ownerId) => list(conn, 'anchor', ownerId);
const listGates = (conn, ownerId) => list(conn, 'gate', ownerId);

const getZone = async (conn, ownerId) => {
    const [rows] = await conn.execute('SELECT time_zone FROM rhythm_settings WHERE owner_id = ?', [ownerId]);

    return rows[0]?.time_zone ?? null;
};

const setZone = async (conn, ownerId, timeZone) => {
    await conn.execute(
        `INSERT INTO rhythm_settings (owner_id, time_zone, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE time_zone = VALUES(time_zone), updated_at = UTC_TIMESTAMP(3)`,
        [ownerId, timeZone]
    );

    return timeZone;
};

const clearTombstone = (conn, ownerId, kind, externalId) =>
    conn.execute('DELETE FROM rhythm_deletions WHERE owner_id = ? AND item_kind = ? AND external_id = ?', [
        ownerId,
        kind,
        externalId,
    ]);

const upsertItem = async (conn, kind, ownerId, externalId, fields, updatedBy) => {
    const { table, fields: columns } = TABLES[kind];
    const values = columns.map((column) => fields[column] ?? null);

    await conn.execute(
        `INSERT INTO ${table} (owner_id, external_id, ${columns.join(', ')}, created_at, updated_at, updated_by)
         VALUES (?, ?, ${columns.map(() => '?').join(', ')}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?)
         ON DUPLICATE KEY UPDATE
            updated_by = IF(${columns.map((c) => `${c} <=> VALUES(${c})`).join(' AND ')}, updated_by, VALUES(updated_by)),
            updated_at = IF(${columns.map((c) => `${c} <=> VALUES(${c})`).join(' AND ')}, updated_at, VALUES(updated_at)),
            ${columns.map((c) => `${c} = VALUES(${c})`).join(', ')}`,
        [ownerId, externalId, ...values, updatedBy]
    );
    await clearTombstone(conn, ownerId, kind, externalId);

    return getOne(conn, kind, ownerId, externalId);
};

const upsertAnchor = (conn, ownerId, externalId, fields, updatedBy) =>
    upsertItem(conn, 'anchor', ownerId, externalId, fields, updatedBy);

const upsertGate = (conn, ownerId, externalId, fields, updatedBy) =>
    upsertItem(conn, 'gate', ownerId, externalId, fields, updatedBy);

/** Writes only the given anchor fields. Returns the row, or null when the id is unknown. */
const patchAnchor = async (conn, ownerId, externalId, patch) => {
    const columns = TABLES.anchor.fields.filter((column) => column in patch);
    const assignments = columns.map((column) => `${column} = ?`);
    const [result] = await conn.execute(
        `UPDATE rhythm_anchors SET ${assignments.join(', ')}, updated_at = UTC_TIMESTAMP(3), updated_by = 'justin'
         WHERE owner_id = ? AND external_id = ?`,
        [...columns.map((column) => patch[column]), ownerId, externalId]
    );
    if (result.affectedRows === 0) return null;

    return getOne(conn, 'anchor', ownerId, externalId);
};

/** Deletes the item and leaves a tombstone so the deletion syncs. Returns whether a row existed. */
const deleteItem = async (conn, ownerId, kind, externalId, deletedBy) => {
    const [result] = await conn.execute(`DELETE FROM ${TABLES[kind].table} WHERE owner_id = ? AND external_id = ?`, [
        ownerId,
        externalId,
    ]);
    if (result.affectedRows === 0) return false;

    await conn.execute(
        `INSERT INTO rhythm_deletions (owner_id, item_kind, external_id, deleted_at, deleted_by)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3), ?)
         ON DUPLICATE KEY UPDATE deleted_at = UTC_TIMESTAMP(3), deleted_by = VALUES(deleted_by)`,
        [ownerId, kind, externalId, deletedBy]
    );
    await conn.execute(
        `DELETE FROM rhythm_deletions WHERE owner_id = ? AND deleted_at < UTC_TIMESTAMP(3) - INTERVAL ${TOMBSTONE_DAYS} DAY`,
        [ownerId]
    );

    return true;
};

/** The cursor is read before the rows, so a change landing mid-read is returned again, never missed. */
const changesSince = async (conn, ownerId, sinceUtc) => {
    const [[{ cursor }]] = await conn.execute(`SELECT ${isoInstant('UTC_TIMESTAMP(3)')} AS \`cursor\``);
    const since = toUtcDatetime(sinceUtc);
    const changed = async (kind) => {
        const [rows] = await conn.execute(
            `${TABLES[kind].select} WHERE owner_id = ? AND updated_at > ? ORDER BY ${TABLES[kind].order}`,
            [ownerId, since]
        );
        return rows;
    };
    const [deletions] = await conn.execute(
        `SELECT item_kind, external_id, ${isoInstant('deleted_at')} AS deleted_at, deleted_by
         FROM rhythm_deletions WHERE owner_id = ? AND deleted_at > ? ORDER BY deleted_at, id`,
        [ownerId, since]
    );

    return { cursor, anchors: await changed('anchor'), gates: await changed('gate'), deletions };
};

module.exports = {
    getZone,
    setZone,
    listAnchors,
    listGates,
    upsertAnchor,
    upsertGate,
    patchAnchor,
    deleteItem,
    changesSince,
};
