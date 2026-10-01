'use strict';

const { badRequest, forbidden, notFound } = require('./httpError');

/**
 * Ownership for a *set* of sequences, in one query, plus the rule that only a
 * pinned sequence may be booked on the calendar.
 *
 * Same order of answers as `assertTodosOwned`: missing is 404, someone else's is
 * 403, and only then is the pin checked, so an unpinned sequence belonging to
 * another user is a 403 rather than a hint about their data.
 *
 * Releasing a booking passes `requirePinned: false`: a sequence unpinned after
 * it was booked must still be releasable.
 *
 * Resolves to undefined when every id checks out. Ids must already be numbers —
 * see `idSchema` in `./validation`.
 */
const assertSequencesOwned = async (conn, sequenceIds, userId, { requirePinned = true } = {}) => {
    const unique = [...new Set(sequenceIds)];

    if (unique.length === 0) return;

    const placeholders = unique.map(() => '?').join(', ');

    // `query` rather than `execute`: the placeholder count varies per call.
    const [rows] = await conn.query(
        `SELECT s.id, s.is_pinned, p.owner_id
         FROM sequences s
         JOIN projects p ON p.id = s.project_id
         WHERE s.id IN (${placeholders})`,
        unique
    );

    if (rows.length !== unique.length) throw notFound('Sequence');

    if (rows.some((row) => row.owner_id !== userId)) throw forbidden();

    if (requirePinned && rows.some((row) => !row.is_pinned)) throw badRequest('Only a pinned sequence can be booked');
};

module.exports = assertSequencesOwned;
