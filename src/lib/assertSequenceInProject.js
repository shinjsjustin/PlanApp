'use strict';

const assertOwnership = require('../middleware/assertOwnership');
const { badRequest } = require('./httpError');

/**
 * Confirms a sequence named in a request body is one of this project's.
 *
 * Two different questions are being asked, and they deserve two different
 * answers. `assertOwnership` answers "is this sequence yours" — 403 or 404. The
 * comparison below answers "is it in the project this request is about": a
 * sequence the caller genuinely owns but which sits in another project is a
 * client bug, not an authorisation failure, so it is a 400.
 *
 * Both `POST /projects/:id/todos` and `PUT /todos/:id/move` take a sequence id
 * and must refuse to file work into the wrong project rather than doing it
 * quietly.
 *
 * `field` names the request field being checked, so the 400 points at the one
 * the caller got wrong. `POST /projects/:id/edges` takes two sequences at once,
 * and "sequenceId is not in this project" would not say which.
 */
const assertSequenceInProject = async (
    conn,
    sequenceId,
    projectId,
    userId,
    field = 'sequenceId'
) => {
    const owningProject = await assertOwnership(conn, 'sequence', sequenceId, userId);

    if (owningProject.id !== projectId) {
        throw badRequest(`${field}: sequence ${sequenceId} is not in this project`);
    }
};

module.exports = assertSequenceInProject;
