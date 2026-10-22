'use strict';

const { firstRow } = require('./sql');

/**
 * Data access for `reminder_subcategories` — names that belong to exactly one
 * place and are owned by a user. Names are unique within a place; a clash
 * surfaces as the driver's ER_DUP_ENTRY.
 */

const SELECT_COLUMNS = 'id, owner_id, place_id, name';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM reminder_subcategories WHERE id = ?`,
        [id]
    );

    return firstRow(rows) ?? null;
};

/** By name, for every place or just `placeId`. */
const listByOwner = async (conn, ownerId, { placeId } = {}) => {
    const filterByPlace = placeId !== undefined;
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM reminder_subcategories
         WHERE owner_id = ?${filterByPlace ? ' AND place_id = ?' : ''}
         ORDER BY name, id`,
        filterByPlace ? [ownerId, placeId] : [ownerId]
    );

    return rows;
};

const create = async (conn, { ownerId, placeId, name }) => {
    const [result] = await conn.execute(
        'INSERT INTO reminder_subcategories (owner_id, place_id, name) VALUES (?, ?, ?)',
        [ownerId, placeId, name]
    );

    return findById(conn, result.insertId);
};

/** Returns the renamed row, or null when there was no such subcategory. */
const rename = async (conn, id, name) => {
    const [result] = await conn.execute('UPDATE reminder_subcategories SET name = ? WHERE id = ?', [name, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM reminder_subcategories WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = { create, findById, listByOwner, remove, rename };
