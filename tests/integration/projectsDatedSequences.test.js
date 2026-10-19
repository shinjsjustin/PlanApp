'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { bindConnection } = require('../../src/db/unitOfWork');
const { addDays, localToday } = require('../../src/lib/localDate');
const { titleDateOf } = require('../../src/lib/sequenceDate');
const { authHeaderFor } = require('../helpers/auth');
const { createTestUser, useTransaction } = require('../helpers/db');

const getConn = useTransaction();

const ZONE = 'UTC';
const today = () => localToday(ZONE);
const titleFor = (offset) => titleDateOf(addDays(today(), offset));

const listProjects = (ownerId) =>
    request(app).get('/api/projects').set('Authorization', authHeaderFor(ownerId)).set('X-Time-Zone', ZONE);

const createProject = async (conn, ownerId, title = 'Plan') => {
    const project = await projectsRepo.create(conn, { ownerId, title });
    const layer = await layersRepo.create(conn, { projectId: project.id });
    return { project, layer };
};

const createDated = (conn, layer, offset, extra = {}) =>
    sequencesRepo.create(conn, { layerId: layer.id, title: titleFor(offset), ...extra });

// Cards, dated sequences, their to-dos: three statements however many projects.
const LIST_STATEMENT_COUNT = 3;

const countListStatements = async (conn, ownerId) => {
    const counter = { statements: 0 };
    const proxy = {
        execute: (...args) => {
            counter.statements += 1;
            return conn.execute(...args);
        },
        query: (...args) => {
            counter.statements += 1;
            return conn.query(...args);
        },
    };

    bindConnection(proxy);
    try {
        const response = await listProjects(ownerId);
        return { response, statements: counter.statements };
    } finally {
        bindConnection(conn);
    }
};

describe('project datedSequences payloads', () => {
    test('returns dated sequences from today on, ordered by date then layer and position, in the wire shape', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, layer } = await createProject(conn, ownerId);
        const place = await placesRepo.create(conn, {
            ownerId, name: 'Gym', address: '1 Gym St', visitMinutes: 45,
        });
        await createDated(conn, layer, -1);
        const later = await createDated(conn, layer, 3, { owner: 'bourne', description: 'Later' });
        const first = await createDated(conn, layer, 0, { description: 'Now' });
        await sequencesRepo.create(conn, { layerId: layer.id, title: 'Undated' });
        await sequencesRepo.update(conn, first.id, { placeId: place.id });
        const done = await todosRepo.create(conn, { projectId: project.id, sequenceId: first.id, text: 'Done one' });
        await todosRepo.update(conn, done.id, { status: 'complete' });
        const open = await todosRepo.create(conn, { projectId: project.id, sequenceId: first.id, text: 'Open one' });

        const response = await listProjects(ownerId);

        expect(response.status).toBe(200);
        expect(response.body.data[0].datedSequences).toEqual([
            {
                id: first.id,
                title: titleFor(0),
                date: today(),
                owner: 'justin',
                description: 'Now',
                isBlocked: false,
                layerId: layer.id,
                visitMinutes: 45,
                todos: [
                    { id: done.id, text: 'Done one', status: 'complete', position: 0, visitMinutes: 45 },
                    { id: open.id, text: 'Open one', status: 'incomplete', position: 1, visitMinutes: 45 },
                ],
            },
            {
                id: later.id,
                title: titleFor(3),
                date: addDays(today(), 3),
                owner: 'bourne',
                description: 'Later',
                isBlocked: false,
                layerId: layer.id,
                visitMinutes: null,
                todos: [],
            },
        ]);
        expect(response.body.data[0]).not.toHaveProperty('pinnedTodos');
        expect(response.body.data[0]).not.toHaveProperty('pinnedSequences');
    });

    test("a to-do's own place wins over its sequence's place", async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, layer } = await createProject(conn, ownerId);
        const seqPlace = await placesRepo.create(conn, { ownerId, name: 'A', address: 'A St', visitMinutes: 30 });
        const todoPlace = await placesRepo.create(conn, { ownerId, name: 'B', address: 'B St', visitMinutes: 10 });
        const sequence = await createDated(conn, layer, 0);
        await sequencesRepo.update(conn, sequence.id, { placeId: seqPlace.id });
        const own = await todosRepo.create(conn, { projectId: project.id, sequenceId: sequence.id, text: 'Own' });
        await todosRepo.update(conn, own.id, { placeId: todoPlace.id });
        const inherits = await todosRepo.create(conn, { projectId: project.id, sequenceId: sequence.id, text: 'Inherits' });

        const response = await listProjects(ownerId);

        expect(response.body.data[0].datedSequences[0].todos.map((t) => [t.id, t.visitMinutes])).toEqual([
            [own.id, 10],
            [inherits.id, 30],
        ]);
    });

    test('keeps several sequences dated the same day, in layer then position order', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const { project, layer } = await createProject(conn, ownerId);
        const secondLayer = await layersRepo.create(conn, { projectId: project.id });
        const a = await createDated(conn, layer, 1);
        const b = await createDated(conn, layer, 1);
        const c = await createDated(conn, secondLayer, 1);

        const response = await listProjects(ownerId);

        expect(response.body.data[0].datedSequences.map((s) => s.id)).toEqual([a.id, b.id, c.id]);
    });

    test('gives [] when none is dated or all are past, and never shows another user\'s', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const mine = await createProject(conn, ownerId);
        await createDated(conn, mine.layer, -2);
        await sequencesRepo.create(conn, { layerId: mine.layer.id, title: 'Undated' });
        await projectsRepo.create(conn, { ownerId, title: 'Bare' });
        const theirs = await createProject(conn, otherId);
        await createDated(conn, theirs.layer, 0);

        const response = await listProjects(ownerId);

        expect(response.body.data).toHaveLength(2);
        response.body.data.forEach((project) => expect(project.datedSequences).toEqual([]));
    });

    test('reads cards, sequences and to-dos in three statements as projects grow', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const seed = async (title) => {
            const { project, layer } = await createProject(conn, ownerId, title);
            const sequence = await createDated(conn, layer, 0);
            await todosRepo.create(conn, { projectId: project.id, sequenceId: sequence.id, text: 'T' });
        };
        await seed('One');

        const one = await countListStatements(conn, ownerId);
        await seed('Two');
        await seed('Three');
        const three = await countListStatements(conn, ownerId);

        expect(one.statements).toBe(LIST_STATEMENT_COUNT);
        expect(three.statements).toBe(one.statements);
        three.response.body.data.forEach((project) => expect(project.datedSequences).toHaveLength(1));
    });

    test('POST and PATCH answer in the card shape, with today\'s sequences for PATCH', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await request(app)
            .post('/api/projects')
            .set('Authorization', authHeaderFor(ownerId))
            .set('X-Time-Zone', ZONE)
            .send({ title: 'New' });
        const layers = await layersRepo.listByProject(conn, created.body.data.id);
        const sequence = await createDated(conn, { id: layers[0].id }, 0);
        const patched = await request(app)
            .patch(`/api/projects/${created.body.data.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .set('X-Time-Zone', ZONE)
            .send({ title: 'Renamed' });

        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ title: 'New', todoCount: 0, datedSequences: [] });
        expect(created.body.data).not.toHaveProperty('pinnedTodos');
        expect(patched.status).toBe(200);
        expect(patched.body.data.title).toBe('Renamed');
        expect(patched.body.data.datedSequences.map((s) => s.id)).toEqual([sequence.id]);
        expect(patched.body.data).not.toHaveProperty('pinnedSequences');
    });
});
