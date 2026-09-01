'use strict';

const { firstRow } = require('../db/repositories/sql');
const { forbidden, notFound } = require('../lib/httpError');

/**
 * The single ownership check for the whole API (spec section 4.4).
 *
 * Projects have exactly one owner and every other resource cascades from a
 * project, so every authorisation question reduces to "does this resource's
 * project belong to this user?". Each resource type below is one join back up to
 * `projects`; routes call this before touching anything they were handed an id
 * for.
 *
 * The signature takes the connection first, matching the repositories, so an
 * ownership check inside a transaction sees that transaction's rows.
 *
 * Returns the owning project row, since callers usually need its id next.
 */

const OWNER_QUERIES = {
    project: {
        label: 'Project',
        sql: 'SELECT id, owner_id FROM projects WHERE id = ?',
    },
    layer: {
        label: 'Layer',
        sql: `SELECT p.id, p.owner_id FROM layers l
              JOIN projects p ON p.id = l.project_id
              WHERE l.id = ?`,
    },
    sequence: {
        label: 'Sequence',
        sql: `SELECT p.id, p.owner_id FROM sequences s
              JOIN projects p ON p.id = s.project_id
              WHERE s.id = ?`,
    },
    todo: {
        label: 'To-do',
        sql: `SELECT p.id, p.owner_id FROM todos t
              JOIN projects p ON p.id = t.project_id
              WHERE t.id = ?`,
    },
    edge: {
        label: 'Edge',
        sql: `SELECT p.id, p.owner_id FROM sequence_edges e
              JOIN projects p ON p.id = e.project_id
              WHERE e.id = ?`,
    },
};

const assertOwnership = async (conn, resourceType, id, userId) => {
    const query = OWNER_QUERIES[resourceType];

    if (!query) {
        throw new Error(
            `Unknown resource type "${resourceType}". Expected one of: ` +
                `${Object.keys(OWNER_QUERIES).join(', ')}`
        );
    }

    const [rows] = await conn.execute(query.sql, [id]);
    const project = firstRow(rows);

    if (!project) {
        throw notFound(query.label);
    }

    if (project.owner_id !== userId) {
        throw forbidden();
    }

    return project;
};

module.exports = assertOwnership;
module.exports.OWNER_TYPES = Object.keys(OWNER_QUERIES);
