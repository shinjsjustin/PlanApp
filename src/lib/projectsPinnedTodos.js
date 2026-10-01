'use strict';

const projectsRepo = require('../db/repositories/projectsRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const todosRepo = require('../db/repositories/todosRepo');
const { toPinnedSequence, toPinnedTodo, toProject } = require('./serializers');

/**
 * Project cards carry their overall to-do progress and a narrow list of pins.
 *
 * `listProjectsWithPinnedTodos` answers `GET /api/projects` in two queries,
 * whatever the number of projects: one for the cards, one for every pin the
 * owner has. The grouping happens here in memory. A pinned query per project is
 * exactly the N+1 this exists to avoid, and
 * `tests/integration/projectsPinnedTodos.test.js` counts the statements a
 * request runs and fails if that count grows with the project count.
 *
 * `findProjectWithPinnedTodos` answers the create and update routes in the same
 * shape, so the home page can drop their responses straight into the grid it is
 * already showing.
 *
 * Statements run one after another rather than through `Promise.all` because a
 * single mysql2 connection executes one at a time.
 */

/**
 * The repository returns contiguous project groups, each in pinned-list order.
 * Yield fresh slices in one linear scan; neither buckets nor a Map are mutated.
 */
function* projectGroups(pinnedRows) {
    let start = 0;
    while (start < pinnedRows.length) {
        const projectId = pinnedRows[start].project_id;
        let end = start + 1;
        while (end < pinnedRows.length && pinnedRows[end].project_id === projectId) {
            end += 1;
        }
        yield [projectId, pinnedRows.slice(start, end)];
        start = end;
    }
}

/**
 * Attaches the pinned list to already-serialized projects. The one place the
 * payload's shape is decided, whether it came from the list query or the
 * single-project one. The pinned query's own ordering is preserved.
 */
const attachPinnedTodos = (projects, pinnedRows) => {
    const pinnedByProject = new Map(projectGroups(pinnedRows));

    return projects.map((project) => ({
        ...project,
        pinnedTodos: (pinnedByProject.get(project.id) ?? []).map(toPinnedTodo),
    }));
};

/**
 * Adds `pinnedSequences` to each project from two more statements in total:
 * the owner's pinned sequences, then all of their to-dos at once.
 */
const attachPinnedSequences = async (conn, ownerId, projects) => {
    const sequenceRows = await sequencesRepo.listPinnedByOwner(conn, ownerId);
    const todoRows = await todosRepo.listBySequenceIds(
        conn,
        sequenceRows.map((row) => row.id)
    );
    const todosBySequence = Map.groupBy(todoRows, (row) => row.sequence_id);
    const sequencesByProject = Map.groupBy(sequenceRows, (row) => row.project_id);

    return projects.map((project) => ({
        ...project,
        pinnedSequences: (sequencesByProject.get(project.id) ?? []).map((row) =>
            toPinnedSequence(row, todosBySequence.get(row.id) ?? [])
        ),
    }));
};

const listProjectsWithPinnedTodos = async (
    conn,
    ownerId,
    { includePinnedSequences = false } = {}
) => {
    const projectRows = await projectsRepo.listByOwnerWithCounts(conn, ownerId);
    const pinnedRows = await todosRepo.listPinnedByOwner(conn, ownerId);
    const projects = attachPinnedTodos(projectRows.map(toProject), pinnedRows);

    return includePinnedSequences ? attachPinnedSequences(conn, ownerId, projects) : projects;
};

/** One project in the list card shape, or null when its row is gone. */
const findProjectWithPinnedTodos = async (conn, projectId) => {
    const projectRow = await projectsRepo.findByIdWithCounts(conn, projectId);
    if (!projectRow) return null;

    const pinnedRows = await todosRepo.listPinnedByProject(conn, projectId);
    const [project] = attachPinnedTodos([toProject(projectRow)], pinnedRows);

    return project;
};

module.exports = { findProjectWithPinnedTodos, listProjectsWithPinnedTodos };
