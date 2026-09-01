'use strict';

const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { createTestUser } = require('./db');

/**
 * The fixture the to-do route suites share: one project, one layer, one sequence,
 * and two ways of reading a list back as `[text, position]` pairs.
 *
 * The property those readings exist for: `sequence_id IS NULL` means unorganized
 * (spec section 4.2). The panel is a filter over the project's to-dos rather than
 * a collection of its own, so both lists are read the same way and both have to
 * stay densely positioned through every insert and delete.
 */

const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Learn aerodynamics',
    });

    return { ownerId, project, layer, sequence };
};

/** The unorganized panel as `[text, position]` pairs, top to bottom. */
const unorganizedOrder = async (conn, projectId) => {
    const todos = await todosRepo.listUnorganized(conn, projectId);

    return todos.map((todo) => [todo.text, todo.position]);
};

/** One sequence's to-dos as `[text, position]` pairs, top to bottom. */
const sequenceOrder = async (conn, sequenceId) => {
    const todos = await todosRepo.listBySequence(conn, sequenceId);

    return todos.map((todo) => [todo.text, todo.position]);
};

module.exports = { createFixture, unorganizedOrder, sequenceOrder };
