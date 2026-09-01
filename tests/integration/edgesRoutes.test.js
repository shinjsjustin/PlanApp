'use strict';

const request = require('supertest');

const app = require('../../src/server');
const edgesRepo = require('../../src/db/repositories/edgesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The edge half of spec section 4.4, and the `canConnect` rule of section 4.3
 * enforced where it matters — at the boundary, not just in the UI that offers it.
 *
 * An edge means "the parent must finish before the child can start", so it only
 * ever points strictly downward through the layers. Same-layer and upward pairs
 * are refused, which is the whole of the cycle story: every edge decreases in
 * layer position, so a cycle cannot be built in the first place and there is no
 * cycle check to write.
 */

/**
 * The worked example of spec section 1: three stacked layers, one sequence in
 * each. `learning` is above `design`, which is above `build`, so an edge from
 * `aerodynamics` to `wifi` skips a layer and is still legal.
 */
const createFixture = async (conn, ownerId) => {
    const owner = ownerId ?? (await createTestUser(conn));
    const project = await projectsRepo.create(conn, { ownerId: owner, title: 'Build a drone' });

    const learning = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const design = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const build = await layersRepo.create(conn, { projectId: project.id, title: 'Build' });

    const aerodynamics = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn aerodynamics',
    });
    const electronics = await sequencesRepo.create(conn, {
        layerId: learning.id,
        title: 'Learn electronics',
    });
    const rotor = await sequencesRepo.create(conn, {
        layerId: design.id,
        title: 'Design rotor system',
    });
    const wifi = await sequencesRepo.create(conn, {
        layerId: build.id,
        title: 'Connect drone to wifi',
    });

    return {
        ownerId: owner,
        project,
        layers: { learning, design, build },
        aerodynamics,
        electronics,
        rotor,
        wifi,
    };
};

/** The project's edges as `[parentId, childId]` pairs. */
const edgePairs = async (conn, projectId) => {
    const edges = await edgesRepo.listByProject(conn, projectId);

    return edges.map((edge) => [edge.parent_id, edge.child_id]);
};

describe('POST /api/projects/:id/edges', () => {
    test('connects a sequence to one in the layer below', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, rotor } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: aerodynamics.id, childId: rotor.id });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            projectId: project.id,
            parentId: aerodynamics.id,
            childId: rotor.id,
        });
        expect(await edgePairs(conn, project.id)).toEqual([[aerodynamics.id, rotor.id]]);
    });

    test('connects a sequence to one further down, skipping a layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, wifi } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: aerodynamics.id, childId: wifi.id });

        // Assert
        expect(response.status).toBe(201);
        expect(await edgePairs(conn, project.id)).toEqual([[aerodynamics.id, wifi.id]]);
    });

    test('rejects a pair in the same layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, electronics } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: aerodynamics.id, childId: electronics.id });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/layer/i);
        expect(await edgePairs(conn, project.id)).toEqual([]);
    });

    test('rejects a pair that points upward', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, rotor } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: rotor.id, childId: aerodynamics.id });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/layer/i);
        expect(await edgePairs(conn, project.id)).toEqual([]);
    });

    test('rejects a sequence belonging to another of the caller\'s projects', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, rotor } = await createFixture(conn);
        const other = await createFixture(conn, ownerId);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: other.aerodynamics.id, childId: rotor.id });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/parentId/);
        expect(await edgePairs(conn, project.id)).toEqual([]);
    });

    test('answers 409 rather than 500 for a pair that is already connected', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, rotor } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: aerodynamics.id,
            childId: rotor.id,
        });

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: aerodynamics.id, childId: rotor.id });

        // Assert
        expect(response.status).toBe(409);
        expect(response.body.error).toMatch(/already connected/i);
        expect(await edgePairs(conn, project.id)).toEqual([[aerodynamics.id, rotor.id]]);
    });

    test('rejects a body that names no child', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics } = await createFixture(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ parentId: aerodynamics.id });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/childId/);
    });

    test('answers 403 for another user\'s project', async () => {
        // Arrange
        const conn = getConn();
        const { project, aerodynamics, rotor } = await createFixture(conn);
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(intruderId))
            .send({ parentId: aerodynamics.id, childId: rotor.id });

        // Assert
        expect(response.status).toBe(403);
        expect(await edgePairs(conn, project.id)).toEqual([]);
    });

    test('rejects an unauthenticated request', async () => {
        const response = await request(app)
            .post('/api/projects/1/edges')
            .send({ parentId: 1, childId: 2 });

        expect(response.status).toBe(401);
    });
});

describe('DELETE /api/projects/:id/edges', () => {
    test('removes the edge named in the query string and leaves the others', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, electronics, rotor } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: aerodynamics.id,
            childId: rotor.id,
        });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: electronics.id,
            childId: rotor.id,
        });

        // Act
        const response = await request(app)
            .delete(`/api/projects/${project.id}/edges`)
            .query({ parentId: aerodynamics.id, childId: rotor.id })
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            parentId: aerodynamics.id,
            childId: rotor.id,
        });
        expect(await edgePairs(conn, project.id)).toEqual([[electronics.id, rotor.id]]);
    });

    test('answers 404 when there is no such edge', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, aerodynamics, rotor } = await createFixture(conn);

        // Act
        const response = await request(app)
            .delete(`/api/projects/${project.id}/edges`)
            .query({ parentId: aerodynamics.id, childId: rotor.id })
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });

    test('rejects a request that names no edge', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        // Act
        const response = await request(app)
            .delete(`/api/projects/${project.id}/edges`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(400);
    });

    test('answers 403 for another user\'s project', async () => {
        // Arrange
        const conn = getConn();
        const { project, aerodynamics, rotor } = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: aerodynamics.id,
            childId: rotor.id,
        });
        const intruderId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete(`/api/projects/${project.id}/edges`)
            .query({ parentId: aerodynamics.id, childId: rotor.id })
            .set('Authorization', authHeaderFor(intruderId));

        // Assert
        expect(response.status).toBe(403);
        expect(await edgePairs(conn, project.id)).toEqual([[aerodynamics.id, rotor.id]]);
    });

    test('refuses to remove an edge belonging to someone else\'s project', async () => {
        // Arrange — the pair names sequences in a victim's project, but the URL
        // names a project the caller does own, so the ownership check on the
        // project alone would let this through. `edgesRepo.remove` matches on
        // the pair and not on the project, so the sequences must be checked too.
        const conn = getConn();
        const victim = await createFixture(conn);
        await edgesRepo.create(conn, {
            projectId: victim.project.id,
            parentId: victim.aerodynamics.id,
            childId: victim.rotor.id,
        });
        const intruder = await createFixture(conn);

        // Act
        const response = await request(app)
            .delete(`/api/projects/${intruder.project.id}/edges`)
            .query({ parentId: victim.aerodynamics.id, childId: victim.rotor.id })
            .set('Authorization', authHeaderFor(intruder.ownerId));

        // Assert
        expect(response.status).toBe(403);
        expect(await edgePairs(conn, victim.project.id)).toEqual([
            [victim.aerodynamics.id, victim.rotor.id],
        ]);
    });

    test('rejects an unauthenticated request', async () => {
        const response = await request(app).delete('/api/projects/1/edges?parentId=1&childId=2');

        expect(response.status).toBe(401);
    });
});
