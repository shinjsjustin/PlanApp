'use strict';

const { firstRow } = require('../db/repositories/sql');
const { forbidden, notFound } = require('../lib/httpError');

/**
 * The single ownership check for the whole API (spec section 4.4).
 *
 * Projects have exactly one owner and almost every other resource cascades from
 * a project, so nearly every authorisation question reduces to "does this
 * resource's project belong to this user?". Each such resource below is one join
 * back up to `projects`.
 *
 * `calendarDay` is the exception: the calendar spans an owner's whole
 * collection, so a day hangs off `users` and is checked directly. It returns the
 * day row rather than a project row — callers needing a project id must not use
 * it.
 *
 * Routes call this before touching anything they were handed an id for.
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
    // The one resource that does not hang off a project. The calendar draws from
    // every project at once, so a day belongs to the user directly — which makes
    // this the only query here that needs no join, and the only one whose
    // returned row is the resource itself rather than its project. Callers must
    // not read a project id off it.
    calendarDay: {
        label: 'Day',
        sql: 'SELECT id, owner_id FROM calendar_days WHERE id = ?',
    },
    // Reached through its day, which is itself owned directly. So this is the
    // one two-hop query here that still does not touch `projects` — and, like
    // `calendarDay`, the row it returns is not a project row. Callers must not
    // read a project id off it. Unlike `calendarDay`, the returned row is also
    // not the requested resource: `owned.id` here is the day's id, not this
    // note's — callers already have the note's id from the route param.
    calendarNote: {
        label: 'Note',
        sql: `SELECT d.id, d.owner_id FROM calendar_notes n
              JOIN calendar_days d ON d.id = n.day_id
              WHERE n.id = ?`,
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
    const owned = firstRow(rows);

    if (!owned) {
        throw notFound(query.label);
    }

    if (owned.owner_id !== userId) {
        throw forbidden();
    }

    return owned;
};

module.exports = assertOwnership;
module.exports.OWNER_TYPES = Object.keys(OWNER_QUERIES);
