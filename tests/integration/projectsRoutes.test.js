'use strict';

const request = require('supertest');

const app = require('../../src/server');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * Every request in this file runs on the same connection the test opened, so
 * everything the routes write is rolled back afterwards (tests/helpers/db.js).
 */
describe('projects routes', () => {
    describe('GET /api/projects', () => {
        test('returns the caller\'s projects with their to-do counts', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, {
                ownerId,
                title: 'Build a drone',
                description: 'Layered plan',
            });
            const done = await todosRepo.create(conn, {
                projectId: project.id,
                text: 'Learn aerodynamics',
            });
            await todosRepo.update(conn, done.id, { status: 'complete' });
            await todosRepo.create(conn, { projectId: project.id, text: 'Learn electronics' });

            // Act
            const response = await request(app)
                .get('/api/projects')
                .set('Authorization', authHeaderFor(ownerId));

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ success: true, error: null });
            expect(response.body.data).toEqual([
                expect.objectContaining({
                    id: project.id,
                    title: 'Build a drone',
                    description: 'Layered plan',
                    todoCount: 2,
                    completedTodoCount: 1,
                }),
            ]);
        });

        test('returns color on every project, null when unset', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const plain = await projectsRepo.create(conn, { ownerId, title: 'Plain' });
            const tinted = await projectsRepo.create(conn, { ownerId, title: 'Tinted' });
            await projectsRepo.update(conn, tinted.id, { color: '#ff0000' });

            // Act
            const response = await request(app)
                .get('/api/projects')
                .set('Authorization', authHeaderFor(ownerId));

            // Assert
            const colors = Object.fromEntries(response.body.data.map((p) => [p.id, p.color]));
            expect(colors).toEqual({ [plain.id]: null, [tinted.id]: '#ff0000' });
        });

        test('never lists another user\'s projects', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const otherId = await createTestUser(conn);
            await projectsRepo.create(conn, { ownerId: otherId, title: 'Theirs' });

            // Act
            const response = await request(app)
                .get('/api/projects')
                .set('Authorization', authHeaderFor(ownerId));

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });

        test('rejects an unauthenticated request', async () => {
            expect((await request(app).get('/api/projects')).status).toBe(401);
        });
    });

    describe('POST /api/projects', () => {
        test('creates a project and returns it', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);

            // Act
            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: 'Build a drone', description: 'Layered plan' });

            // Assert
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                success: true,
                error: null,
                data: {
                    title: 'Build a drone',
                    description: 'Layered plan',
                    todoCount: 0,
                    completedTodoCount: 0,
                },
            });
            expect(await projectsRepo.findById(conn, response.body.data.id)).toMatchObject({
                owner_id: ownerId,
            });
        });

        test('creates one default layer at position 0', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);

            // Act
            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: 'Build a drone' });

            // Assert
            const layers = await layersRepo.listByProject(conn, response.body.data.id);
            expect(layers).toHaveLength(1);
            expect(layers[0]).toMatchObject({ position: 0 });
        });

        test('stores a null description when none is given', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);

            // Act
            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: 'No description' });

            // Assert
            expect(response.body.data.description).toBeNull();
        });

        test('rejects an empty title with a 400 naming the field', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);

            // Act
            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: '   ' });

            // Assert
            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({ success: false, data: null });
            expect(response.body.error).toMatch(/title/i);
        });

        test('rejects a missing title with a 400', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);

            // Act
            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', authHeaderFor(ownerId))
                .send({ description: 'Orphaned' });

            // Assert
            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/title/i);
        });
    });

    describe('PATCH /api/projects/:id', () => {
        test('updates only the fields supplied', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, {
                ownerId,
                title: 'Original title',
                description: 'Original description',
            });

            // Act
            const response = await request(app)
                .patch(`/api/projects/${project.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: 'Renamed' });

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.data).toMatchObject({
                id: project.id,
                title: 'Renamed',
                description: 'Original description',
            });
        });

        test('rejects an empty title with a 400 naming the field', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, { ownerId, title: 'Untouched' });

            // Act
            const response = await request(app)
                .patch(`/api/projects/${project.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: '' });

            // Assert
            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/title/i);
        });

        test('stores a color lowercased and returns it in the card shape', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, { ownerId, title: 'Colorful' });

            // Act
            const response = await request(app)
                .patch(`/api/projects/${project.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({ color: '#AABBCC' });

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.data).toMatchObject({
                id: project.id,
                color: '#aabbcc',
                pinnedTodos: [],
            });
        });

        test('resets the color to null when sent null', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, { ownerId, title: 'Colorful' });
            await projectsRepo.update(conn, project.id, { color: '#aabbcc' });

            // Act
            const response = await request(app)
                .patch(`/api/projects/${project.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({ color: null });

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.data.color).toBeNull();
        });

        test.each([['red'], ['#12345'], ['#12345g'], ['#1234567']])(
            'rejects the color %s with a 400 naming the field',
            async (color) => {
                // Arrange
                const conn = getConn();
                const ownerId = await createTestUser(conn);
                const project = await projectsRepo.create(conn, { ownerId, title: 'Untouched' });

                // Act
                const response = await request(app)
                    .patch(`/api/projects/${project.id}`)
                    .set('Authorization', authHeaderFor(ownerId))
                    .send({ color });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.error).toMatch(/color/i);
            }
        );

        test('rejects a patch that changes nothing with a 400', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, { ownerId, title: 'Untouched' });

            // Act
            const response = await request(app)
                .patch(`/api/projects/${project.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({});

            // Assert
            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /api/projects/:id', () => {
        test('deletes the project', async () => {
            // Arrange
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const project = await projectsRepo.create(conn, { ownerId, title: 'Doomed' });

            // Act
            const response = await request(app)
                .delete(`/api/projects/${project.id}`)
                .set('Authorization', authHeaderFor(ownerId));

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.data).toEqual({ id: project.id });
            expect(await projectsRepo.findById(conn, project.id)).toBeNull();
        });

        test('returns 404 for a project that does not exist', async () => {
            // Arrange
            const ownerId = await createTestUser(getConn());

            // Act
            const response = await request(app)
                .delete('/api/projects/987654321')
                .set('Authorization', authHeaderFor(ownerId));

            // Assert
            expect(response.status).toBe(404);
        });
    });

    describe('ownership', () => {
        const otherUsersProject = async (conn) => {
            const otherId = await createTestUser(conn);
            return projectsRepo.create(conn, { ownerId: otherId, title: 'Not yours' });
        };

        test('403s when reading another user\'s project', async () => {
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const theirs = await otherUsersProject(conn);

            const response = await request(app)
                .get(`/api/projects/${theirs.id}`)
                .set('Authorization', authHeaderFor(ownerId));

            expect(response.status).toBe(403);
            expect(response.body).toMatchObject({ success: false, data: null });
        });

        test('403s when patching another user\'s project', async () => {
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const theirs = await otherUsersProject(conn);

            const response = await request(app)
                .patch(`/api/projects/${theirs.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({ title: 'Hijacked' });

            expect(response.status).toBe(403);
            expect(await projectsRepo.findById(conn, theirs.id)).toMatchObject({
                title: 'Not yours',
            });
        });

        test('403s when deleting another user\'s project', async () => {
            const conn = getConn();
            const ownerId = await createTestUser(conn);
            const theirs = await otherUsersProject(conn);

            const response = await request(app)
                .delete(`/api/projects/${theirs.id}`)
                .set('Authorization', authHeaderFor(ownerId));

            expect(response.status).toBe(403);
            expect(await projectsRepo.findById(conn, theirs.id)).not.toBeNull();
        });
    });
});
