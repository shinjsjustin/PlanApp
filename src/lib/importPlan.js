'use strict';

const sequencesRepo = require('../db/repositories/sequencesRepo');
const todosRepo = require('../db/repositories/todosRepo');

/**
 * Writes a parsed plan schema into an existing layer: each sequence with its
 * to-dos, then the loose to-dos into Unorganized. Runs on the caller's
 * transaction connection, one statement at a time, so order is creation order.
 */
const writeImportedPlan = async (conn, { projectId, layerId, parsed }) => {
    const sequences = [];
    const todos = [];

    for (const { title, todos: texts } of parsed.sequences) {
        const sequence = await sequencesRepo.create(conn, { layerId, title });
        sequences.push(sequence);

        for (const text of texts) {
            todos.push(await todosRepo.create(conn, { projectId, text, sequenceId: sequence.id }));
        }
    }

    for (const text of parsed.unorganized) {
        todos.push(await todosRepo.create(conn, { projectId, text }));
    }

    return { sequences, todos };
};

module.exports = { writeImportedPlan };
