'use strict';

const projectsRepo = require('../db/repositories/projectsRepo');
const sequencesRepo = require('../db/repositories/sequencesRepo');
const todosRepo = require('../db/repositories/todosRepo');
const { dateKeyOfTitle } = require('./sequenceDate');
const { toDatedSequence, toProject } = require('./serializers');

/**
 * Project cards carry their overall to-do progress and the sequences dated
 * today or later. The list answers in three statements whatever the number of
 * projects (cards, sequences, their to-dos), grouped in memory; a query per
 * project is the N+1 that `tests/integration/projectsDatedSequences.test.js`
 * guards against. Statements run one after another because a single mysql2
 * connection executes one at a time.
 */

/** Sequences dated `today` or later, paired with their date, in the rows' order. */
const upcoming = (sequenceRows, today) =>
    sequenceRows
        .map((row) => ({ row, date: dateKeyOfTitle(row.title, today) }))
        .filter(({ date }) => date !== null && date >= today);

const attachDatedSequences = async (conn, projects, sequenceRows, today) => {
    const dated = upcoming(sequenceRows, today);
    const todoRows = await todosRepo.listBySequenceIdsWithVisitMinutes(
        conn,
        dated.map(({ row }) => row.id)
    );
    const todosBySequence = Map.groupBy(todoRows, (row) => row.sequence_id);
    const datedByProject = Map.groupBy(dated, ({ row }) => row.project_id);

    return projects.map((project) => ({
        ...project,
        datedSequences: (datedByProject.get(project.id) ?? [])
            .toSorted((a, b) => a.date.localeCompare(b.date))
            .map(({ row, date }) => toDatedSequence(row, date, todosBySequence.get(row.id) ?? [])),
    }));
};

const listProjectsWithDatedSequences = async (conn, ownerId, today) => {
    const projectRows = await projectsRepo.listByOwnerWithCounts(conn, ownerId);
    const sequenceRows = await sequencesRepo.listWithVisitMinutesByOwner(conn, ownerId);

    return attachDatedSequences(conn, projectRows.map(toProject), sequenceRows, today);
};

/** One project in the list card shape, or null when its row is gone. */
const findProjectWithDatedSequences = async (conn, projectId, today) => {
    const projectRow = await projectsRepo.findByIdWithCounts(conn, projectId);
    if (!projectRow) return null;

    const sequenceRows = await sequencesRepo.listWithVisitMinutesByProject(conn, projectId);
    const [project] = await attachDatedSequences(conn, [toProject(projectRow)], sequenceRows, today);

    return project;
};

module.exports = { findProjectWithDatedSequences, listProjectsWithDatedSequences };
