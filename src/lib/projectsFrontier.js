'use strict';

const edgesRepo = require('../db/repositories/edgesRepo');
const projectsRepo = require('../db/repositories/projectsRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const todosRepo = require('../db/repositories/todosRepo');
const { SEQUENCE_STATUS, readyFrontier, sequenceStatus } = require('./frontier');
const { toEdge, toFrontierEntry, toProject, toSequence, toTodo } = require('./serializers');

/**
 * The project payload the home page reads (spec sections 4.4 and 4.8): a project
 * with its overall to-do progress and its ready frontier.
 *
 * `listProjectsWithFrontier` answers `GET /api/projects` in four queries,
 * whatever the number of projects. Each one covers the owner's whole collection
 * — all their sequences, all their edges, all their to-dos — and the grouping
 * happens here in memory. The obvious shape, a frontier query per project or per
 * sequence, is exactly the N+1 this exists to avoid;
 * `tests/integration/projectsFrontierRoute.test.js` counts the statements a
 * request runs and fails if that count grows with the project count.
 *
 * `findProjectWithFrontier` answers the create and update routes in the same
 * shape, so the home page can drop their responses straight into the grid it is
 * already showing. Scoped to one project there is no N to multiply, so it reads
 * through the per-project queries.
 *
 * Statements run one after another rather than through `Promise.all` because a
 * single mysql2 connection executes one at a time.
 */

/** Groups rows into a Map keyed by `projectId`. Every project gets an entry. */
const groupByProject = (rows, projectIds) => {
    const grouped = new Map(projectIds.map((id) => [id, []]));

    rows.forEach((row) => {
        const bucket = grouped.get(row.projectId);
        if (bucket) bucket.push(row);
    });

    return grouped;
};

/**
 * Attaches the frontier, the sequence count, and the blocked count to
 * already-serialized projects. The one place the payload's shape is decided,
 * whether it came from a list query or a single-project one.
 *
 * An empty frontier means one of three things (see `readyFrontier`'s own doc
 * comment), and the card needs to tell all three apart:
 *   - `sequenceCount === 0` — nothing has been planned yet.
 *   - `sequenceCount > 0` and `blockedSequenceCount === 0` — every sequence is
 *     complete.
 *   - `blockedSequenceCount > 0` — something is left, but it is blocked, or
 *     waiting behind something that is.
 * `sequenceCount` is the total regardless of status; `blockedSequenceCount` is
 * how many of those are blocked by hand, which is what separates the second
 * case from the third.
 */
const attachFrontiers = (projects, { sequences, edges, todos }) => {
    const projectIds = projects.map((project) => project.id);

    const sequencesByProject = groupByProject(sequences, projectIds);
    const edgesByProject = groupByProject(edges, projectIds);
    const todosByProject = groupByProject(todos, projectIds);

    return projects.map((project) => {
        const own = sequencesByProject.get(project.id);
        const ownTodos = todosByProject.get(project.id);

        return {
            ...project,
            sequenceCount: own.length,
            blockedSequenceCount: own.filter(
                (sequence) => sequenceStatus(sequence, ownTodos) === SEQUENCE_STATUS.blocked
            ).length,
            frontier: readyFrontier({
                sequences: own,
                edges: edgesByProject.get(project.id),
                todos: ownTodos,
            }).map(toFrontierEntry),
        };
    });
};

const listProjectsWithFrontier = async (conn, ownerId) => {
    const projectRows = await projectsRepo.listByOwnerWithCounts(conn, ownerId);
    const sequenceRows = await sequencesRepo.listByOwner(conn, ownerId);
    const edgeRows = await edgesRepo.listByOwner(conn, ownerId);
    const todoRows = await todosRepo.listByOwner(conn, ownerId);

    return attachFrontiers(projectRows.map(toProject), {
        sequences: sequenceRows.map(toSequence),
        edges: edgeRows.map(toEdge),
        todos: todoRows.map(toTodo),
    });
};

/** One project in the list's shape, or null when the row is gone. */
const findProjectWithFrontier = async (conn, id) => {
    const projectRow = await projectsRepo.findByIdWithCounts(conn, id);
    if (!projectRow) return null;

    const sequenceRows = await sequencesRepo.listByProject(conn, id);
    const edgeRows = await edgesRepo.listByProject(conn, id);
    const todoRows = await todosRepo.listByProject(conn, id);

    const [project] = attachFrontiers([toProject(projectRow)], {
        sequences: sequenceRows.map(toSequence),
        edges: edgeRows.map(toEdge),
        todos: todoRows.map(toTodo),
    });

    return project;
};

module.exports = { findProjectWithFrontier, listProjectsWithFrontier };
