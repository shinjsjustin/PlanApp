'use strict';

const { badRequest } = require('./httpError');

/**
 * Confirms every sequence id exists in the given project, else 400.
 *
 * The caller has already cleared ownership of the project, so a sequence that is
 * missing or sits in another project is a client mistake rather than an
 * authorisation failure. A locking read holds the rows through commit, and
 * deduplication keeps repeated ids from defeating the count check.
 */
const assertSequencesInProject = async (conn, sequenceIds, projectId) => {
    const unique = [...new Set(sequenceIds)];

    if (unique.length === 0) return;

    const placeholders = unique.map(() => '?').join(', ');
    const [rows] = await conn.query(
        `SELECT id FROM sequences
         WHERE project_id = ? AND id IN (${placeholders})
         FOR UPDATE`,
        [projectId, ...unique]
    );

    if (rows.length !== unique.length) {
        throw badRequest('sequenceIds: every sequence must be in this project');
    }
};

module.exports = assertSequencesInProject;
