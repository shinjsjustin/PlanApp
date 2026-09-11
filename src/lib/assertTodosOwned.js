'use strict';

const { forbidden, notFound } = require('./httpError');

/**
 * Ownership for a *set* of to-dos, in one query.
 *
 * The calendar's bulk endpoint names every to-do a single gesture moved, which
 * can be a dozen of them. `assertOwnership` answers for one id at a time and
 * would turn that into a dozen round trips through the same join; this asks the
 * question once.
 *
 * A missing id and someone else's id are told apart deliberately: the first is a
 * stale client, the second is an attempt on another user's data, and answering
 * 403 to both would make an honest client's bug look like an attack. The
 * existence check runs first for the same reason `assertOwnership` orders them
 * that way.
 *
 * Resolves to undefined when every id checks out. Never returns rows: callers
 * that want the to-dos read them separately.
 *
 * Ids must already be coerced to numbers by the route's schema — see `idSchema`
 * in `./validation`. The dedupe is by SameValueZero, so a list holding both `5`
 * and `'5'` counts as two ids that the database answers with one row, and the
 * count check below reports a 404 for a to-do the caller genuinely owns.
 */
const assertTodosOwned = async (conn, todoIds, userId) => {
    const unique = [...new Set(todoIds)];

    if (unique.length === 0) return;

    const placeholders = unique.map(() => '?').join(', ');

    // `query` rather than `execute`: the placeholder count varies per call, and
    // preparing a fresh statement for every distinct arity fills the driver's
    // statement cache for no benefit.
    const [rows] = await conn.query(
        `SELECT t.id, p.owner_id
         FROM todos t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id IN (${placeholders})`,
        unique
    );

    if (rows.length !== unique.length) throw notFound('To-do');

    if (rows.some((row) => row.owner_id !== userId)) throw forbidden();
};

module.exports = assertTodosOwned;
