'use strict';

const { forbidden, notFound } = require('./httpError');

/**
 * Ownership for a *set* of sequences, in one query.
 *
 * Same order of answers as `assertTodosOwned`: missing is 404, then someone
 * else's is 403.
 *
 * Resolves to undefined when every id checks out. Ids must already be numbers —
 * see `idSchema` in `./validation`.
 */
const assertSequencesOwned = async (conn, sequenceIds, userId) => {
    const unique = [...new Set(sequenceIds)];

    if (unique.length === 0) return;

    const placeholders = unique.map(() => '?').join(', ');

    // `query` rather than `execute`: the placeholder count varies per call.
    const [rows] = await conn.query(
        `SELECT s.id, p.owner_id
         FROM sequences s
         JOIN projects p ON p.id = s.project_id
         WHERE s.id IN (${placeholders})`,
        unique
    );

    if (rows.length !== unique.length) throw notFound('Sequence');

    if (rows.some((row) => row.owner_id !== userId)) throw forbidden();
};

module.exports = assertSequencesOwned;
