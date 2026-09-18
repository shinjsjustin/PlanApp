'use strict';

const projectsRepo = require('../db/repositories/projectsRepo');
const todosRepo = require('../db/repositories/todosRepo');
const { toPinnedTodo, toProject } = require('./serializers');

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
 * Groups pinned rows into a Map keyed by `project_id`. Every project gets an
 * entry, so a project with no pins still serializes an empty array.
 *
 * Buckets are pushed into rather than rebuilt: the Map and its arrays are owned
 * by this function and no caller ever sees them, and rebuilding each bucket per
 * row would make grouping quadratic in the number of pins.
 */
const groupByProject = (pinnedRows, projectIds) => {
    const grouped = new Map(projectIds.map((id) => [id, []]));

    pinnedRows.forEach((row) => {
        const bucket = grouped.get(row.project_id);
        if (bucket) bucket.push(row);
    });

    return grouped;
};

/**
 * Attaches the pinned list to already-serialized projects. The one place the
 * payload's shape is decided, whether it came from the list query or the
 * single-project one. The pinned query's own ordering is preserved.
 */
const attachPinnedTodos = (projects, pinnedRows) => {
    const pinnedByProject = groupByProject(
        pinnedRows,
        projects.map((project) => project.id)
    );

    return projects.map((project) => ({
        ...project,
        pinnedTodos: pinnedByProject.get(project.id).map(toPinnedTodo),
    }));
};

const listProjectsWithPinnedTodos = async (conn, ownerId) => {
    const projectRows = await projectsRepo.listByOwnerWithCounts(conn, ownerId);
    const pinnedRows = await todosRepo.listPinnedByOwner(conn, ownerId);

    return attachPinnedTodos(projectRows.map(toProject), pinnedRows);
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
