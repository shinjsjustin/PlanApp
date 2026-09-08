'use strict';

const assertOwnership = require('../middleware/assertOwnership');
const { badRequest } = require('./httpError');

/**
 * Confirms a layer named in a request body is one of this project's.
 *
 * The layer twin of `assertSequenceInProject`, and it exists for the same
 * reason: two different questions deserve two different answers.
 * `assertOwnership` answers "is this layer yours" — 403 or 404. The comparison
 * below answers "is it in the project this request is about": a layer the caller
 * genuinely owns but which sits in another of their projects is a client bug,
 * not an authorisation failure, so it is a 400.
 *
 * `PUT /sequences/:id/move` is the only caller today — a sequence must not be
 * able to leave its project by naming a layer in a different one.
 */
const assertLayerInProject = async (conn, layerId, projectId, userId, field = 'layerId') => {
    const owningProject = await assertOwnership(conn, 'layer', layerId, userId);

    if (owningProject.id !== projectId) {
        throw badRequest(`${field}: layer ${layerId} is not in this project`);
    }
};

module.exports = assertLayerInProject;
