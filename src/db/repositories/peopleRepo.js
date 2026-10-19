'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `people` — contacts owned directly by a user, optionally
 * linked to a place. Rows carry the linked place's name and address (null when
 * unlinked). `emails` and `phones` are JSON columns and `contact_groups` is a
 * SET, so lists are encoded on the way in.
 */

const SELECT_SQL = `SELECT pe.id, pe.owner_id, pe.name, pe.company, pe.role, pe.emails, pe.phones,
        pe.contact_groups, pe.notes, pe.place_id, pe.leemac_client_id, pe.leemac_client_name,
        pe.created_at, pe.updated_at, pl.name AS place_name, pl.address AS place_address
     FROM people pe
     LEFT JOIN places pl ON pl.id = pe.place_id`;

const UPDATABLE_COLUMNS = {
    name: 'name',
    company: 'company',
    role: 'role',
    emails: 'emails',
    phones: 'phones',
    groups: 'contact_groups',
    notes: 'notes',
    placeId: 'place_id',
    leemacClientId: 'leemac_client_id',
    leemacClientName: 'leemac_client_name',
};

const encodeList = (key, value) => {
    if (value === undefined) return undefined;
    if (key === 'groups') return value.join(',');
    if (key === 'emails' || key === 'phones') return JSON.stringify(value);
    return value;
};

const findById = async (conn, id) => {
    const [rows] = await conn.execute(`${SELECT_SQL} WHERE pe.id = ?`, [id]);

    return firstRow(rows) ?? null;
};

const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

/**
 * By name; `id` breaks ties. `q` matches name or company as a substring and
 * `group` keeps one contact group; both are optional.
 */
const listByOwner = async (conn, ownerId, { q, group } = {}) => {
    const conditions = ['pe.owner_id = ?'];
    const params = [ownerId];

    if (q) {
        const pattern = `%${escapeLike(q)}%`;
        conditions.push('(pe.name LIKE ? OR pe.company LIKE ?)');
        params.push(pattern, pattern);
    }
    if (group) {
        conditions.push('FIND_IN_SET(?, pe.contact_groups) > 0');
        params.push(group);
    }

    const [rows] = await conn.execute(
        `${SELECT_SQL} WHERE ${conditions.join(' AND ')} ORDER BY pe.name, pe.id`,
        params
    );

    return rows;
};

const create = async (
    conn,
    {
        ownerId,
        name,
        company = null,
        role = null,
        emails = [],
        phones = [],
        groups = [],
        notes = null,
        placeId = null,
        leemacClientId = null,
        leemacClientName = null,
    }
) => {
    const [result] = await conn.execute(
        `INSERT INTO people
            (owner_id, name, company, role, emails, phones, contact_groups, notes, place_id,
             leemac_client_id, leemac_client_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            ownerId,
            name,
            company,
            role,
            JSON.stringify(emails),
            JSON.stringify(phones),
            groups.join(','),
            notes,
            placeId,
            leemacClientId,
            leemacClientName,
        ]
    );

    return findById(conn, result.insertId);
};

/** Changes the given fields and returns the row, or null when there was no such person. */
const update = async (conn, id, patch) => {
    const encoded = Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [key, encodeList(key, value)])
    );
    const { clause, values } = buildAssignments(encoded, UPDATABLE_COLUMNS);
    const [result] = await conn.execute(`UPDATE people SET ${clause} WHERE id = ?`, [...values, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM people WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = { create, findById, listByOwner, remove, update };
