'use strict';

const layersRepo = require('../db/repositories/layersRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const assertSequenceInProject = require('./assertSequenceInProject');
const { badRequest } = require('./httpError');

/**
 * The `canConnect` rule of spec section 4.3, enforced at the boundary.
 *
 * An edge means "the parent must finish before the child can start", so it has
 * to point strictly downward: both sequences in this project, and the parent's
 * layer strictly above the child's. Strictly, so a same-layer pair is refused
 * along with an upward one — two sequences in the same band are parallel work,
 * and neither gates the other.
 *
 * That single comparison is also the whole cycle story. Every edge steps down a
 * layer, so a chain of them can never return to where it began; there is no
 * cycle check here because the ordering makes one impossible, and writing one
 * would suggest otherwise (spec decision 3).
 *
 * `lib/graph.js` mirrors this client-side to decide which cards to offer. This
 * is the copy that decides, because the client's can be bypassed.
 */
const assertCanConnect = async (conn, { parentId, childId, projectId, userId }) => {
    if (parentId === childId) {
        throw badRequest('childId: a sequence cannot be connected to itself');
    }

    await assertSequenceInProject(conn, parentId, projectId, userId, 'parentId');
    await assertSequenceInProject(conn, childId, projectId, userId, 'childId');

    const parent = await sequencesRepo.findById(conn, parentId);
    const child = await sequencesRepo.findById(conn, childId);

    const parentLayer = await layersRepo.findById(conn, parent.layer_id);
    const childLayer = await layersRepo.findById(conn, child.layer_id);

    if (parentLayer.position >= childLayer.position) {
        throw badRequest(
            'parentId: a sequence can only be connected to one in a lower layer — ' +
                `layer ${parentLayer.position} is not above layer ${childLayer.position}`
        );
    }
};

module.exports = assertCanConnect;
