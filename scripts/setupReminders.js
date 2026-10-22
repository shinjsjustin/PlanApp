'use strict';

const fs = require('fs');

const pool = require('../src/db/db');
const { withConnection, withTransaction } = require('../src/db/unitOfWork');
const placesRepo = require('../src/db/repositories/placesRepo');
const projectsRepo = require('../src/db/repositories/projectsRepo');
const remindersRepo = require('../src/db/repositories/remindersRepo');
const sequencesRepo = require('../src/db/repositories/sequencesRepo');
const todosRepo = require('../src/db/repositories/todosRepo');
const { localToday } = require('../src/lib/localDate');
const { missingPlaces, planReminders } = require('../src/lib/reminderSetupPlan');

const DEFAULT_PROJECT_ID = 28;

const loadProject = async (conn, projectId) => {
    const project = await projectsRepo.findById(conn, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const sequences = await sequencesRepo.listByProject(conn, projectId);
    const todos = await todosRepo.listByProject(conn, projectId);
    return { project, sequences, todos };
};

const buildPlan = async (conn, { project, sequences, todos }, today) => {
    const places = await placesRepo.listByOwner(conn, project.owner_id);
    const sequenceById = new Map(sequences.map((sequence) => [sequence.id, sequence]));
    const planTodos = todos.map((todo) => {
        const sequence = sequenceById.get(todo.sequence_id);
        return {
            id: todo.id,
            text: todo.text,
            status: todo.status,
            placeId: todo.place_id,
            sequencePlaceId: sequence?.place_id ?? null,
            sequenceTitle: sequence?.title ?? '',
        };
    });

    return {
        placesToCreate: missingPlaces(places.map((place) => place.name)),
        remindersToCreate: planReminders(planTodos, today),
        projectToDelete: { id: project.id, title: project.title },
    };
};

const applyPlan = (project, plan, timeZone) =>
    withTransaction(async (conn) => {
        for (const place of plan.placesToCreate) {
            await placesRepo.create(conn, { ownerId: project.owner_id, ...place });
        }
        for (const reminder of plan.remindersToCreate) {
            await remindersRepo.create(conn, {
                ownerId: project.owner_id,
                title: reminder.title,
                placeId: reminder.placeId,
                dueDate: reminder.dueDate,
                timeZone,
            });
        }
        await projectsRepo.remove(conn, project.id);
    });

const runSetup = async ({ projectId = DEFAULT_PROJECT_ID, apply, backupPath, now = new Date(), timeZone }) => {
    if (apply && !backupPath) throw new Error('--apply requires a backup path (--backup=PATH)');

    const loaded = await withConnection((conn) => loadProject(conn, projectId));
    const plan = await withConnection((conn) =>
        buildPlan(conn, loaded, localToday(timeZone, now))
    );
    if (!apply) return plan;

    const { project, sequences, todos } = loaded;
    fs.writeFileSync(backupPath, JSON.stringify({ project, sequences, todos }, null, 2));
    await applyPlan(project, plan, timeZone);
    return plan;
};

const readFlags = (args) => {
    const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    return {
        apply: args.includes('--apply'),
        projectId: value('project') ? Number(value('project')) : undefined,
        backupPath: value('backup'),
        timeZone: value('time-zone') ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
};

if (require.main === module) {
    runSetup(readFlags(process.argv.slice(2)))
        .then((plan) => console.log(JSON.stringify(plan, null, 2)))
        .catch((err) => {
            console.error(err.message);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}

module.exports = { runSetup };
