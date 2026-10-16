'use strict';

const request = require('supertest');

const app = require('../../src/server');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const projectThoughtsRepo = require('../../src/db/repositories/projectThoughtsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const MAX_LENGTH = 20000;

const setup = async () => {
    const conn = getConn();
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });

    return { conn, ownerId, project };
};

const put = (ownerId, projectId, body) =>
    request(app)
        .put(`/api/projects/${projectId}/thoughts`)
        .set('Authorization', authHeaderFor(ownerId))
        .send(body);

describe('GET /api/projects/:id/thoughts', () => {
    test('answers empty text, version 0 and null updatedAt when none exist', async () => {
        const { ownerId, project } = await setup();

        const response = await request(app)
            .get(`/api/projects/${project.id}/thoughts`)
            .set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            projectId: project.id,
            projectTitle: 'Build a drone',
            text: '',
            version: 0,
            updatedAt: null,
        });
    });

    test('answers the stored thoughts', async () => {
        const { conn, ownerId, project } = await setup();
        const row = await projectThoughtsRepo.save(conn, project.id, '  keep spaces ');

        const response = await request(app)
            .get(`/api/projects/${project.id}/thoughts`)
            .set('Authorization', authHeaderFor(ownerId));

        expect(response.body.data).toEqual({
            projectId: project.id,
            projectTitle: 'Build a drone',
            text: '  keep spaces ',
            version: 1,
            updatedAt: row.updated_at.toISOString(),
        });
    });

    test('answers 403 for a stranger and 404 for a missing project', async () => {
        const { conn, project } = await setup();
        const strangerId = await createTestUser(conn);

        const forbidden = await request(app)
            .get(`/api/projects/${project.id}/thoughts`)
            .set('Authorization', authHeaderFor(strangerId));
        const missing = await request(app)
            .get('/api/projects/987654321/thoughts')
            .set('Authorization', authHeaderFor(strangerId));

        expect(forbidden.status).toBe(403);
        expect(missing.status).toBe(404);
    });
});

describe('PUT /api/projects/:id/thoughts', () => {
    test('creates the thoughts at version 1 without trimming', async () => {
        const { conn, ownerId, project } = await setup();

        const response = await put(ownerId, project.id, { text: ' first ', version: 0 });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            projectId: project.id,
            projectTitle: 'Build a drone',
            text: ' first ',
            version: 1,
        });
        expect((await projectThoughtsRepo.findByProject(conn, project.id)).text).toBe(' first ');
    });

    test('replaces the text and adds 1 to a matching version', async () => {
        const { ownerId, project, conn } = await setup();
        await projectThoughtsRepo.save(conn, project.id, 'old');

        const response = await put(ownerId, project.id, { text: 'new', version: 1 });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ text: 'new', version: 2 });
    });

    test('allows empty text', async () => {
        const { ownerId, project, conn } = await setup();
        await projectThoughtsRepo.save(conn, project.id, 'old');

        const response = await put(ownerId, project.id, { text: '' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ text: '', version: 2 });
    });

    test('answers 409 for a stale version and leaves the text', async () => {
        const { ownerId, project, conn } = await setup();
        await projectThoughtsRepo.save(conn, project.id, 'one');
        await projectThoughtsRepo.save(conn, project.id, 'two');

        const response = await put(ownerId, project.id, { text: 'stale', version: 1 });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
            'These thoughts changed elsewhere. Reload to see the latest.'
        );
        expect(await projectThoughtsRepo.findByProject(conn, project.id)).toMatchObject({
            text: 'two',
            version: 2,
        });
    });

    test('answers 409 for a version when no thoughts exist yet', async () => {
        const { ownerId, project } = await setup();

        const response = await put(ownerId, project.id, { text: 'x', version: 3 });

        expect(response.status).toBe(409);
    });

    test('replaces regardless of version when none is sent', async () => {
        const { ownerId, project, conn } = await setup();
        await projectThoughtsRepo.save(conn, project.id, 'one');
        await projectThoughtsRepo.save(conn, project.id, 'two');

        const response = await put(ownerId, project.id, { text: 'forced' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ text: 'forced', version: 3 });
    });

    test('accepts exactly the maximum length', async () => {
        const { ownerId, project } = await setup();

        const response = await put(ownerId, project.id, { text: 'a'.repeat(MAX_LENGTH) });

        expect(response.status).toBe(200);
    });

    test.each([
        ['over the limit', { text: 'a'.repeat(MAX_LENGTH + 1) }],
        ['non-string', { text: 42 }],
        ['missing', {}],
        ['negative version', { text: 'x', version: -1 }],
        ['fractional version', { text: 'x', version: 1.5 }],
    ])('answers 400 and stores nothing for %s', async (_label, payload) => {
        const { conn, ownerId, project } = await setup();

        const response = await put(ownerId, project.id, payload);

        expect(response.status).toBe(400);
        expect(await projectThoughtsRepo.findByProject(conn, project.id)).toBeNull();
    });

    test('answers 403 for a stranger and changes nothing', async () => {
        const { conn, project } = await setup();
        const strangerId = await createTestUser(conn);

        const response = await put(strangerId, project.id, { text: 'stolen' });

        expect(response.status).toBe(403);
        expect(await projectThoughtsRepo.findByProject(conn, project.id)).toBeNull();
    });

    test('answers 404 for a missing project', async () => {
        const { ownerId } = await setup();

        const response = await put(ownerId, 987654321, { text: 'x' });

        expect(response.status).toBe(404);
    });
});
