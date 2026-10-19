'use strict';

const request = require('supertest');

const app = require('../../src/server');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const SCHEMA = ['### First', '- a', '### Second', '- b'].join('\n');
const LAYER_SCHEMA = ['## Layer', '### First', '- a', '### Second', '- b'].join('\n');

const post = (userId, url, body) =>
    request(app).post(url).set('Authorization', authHeaderFor(userId)).send(body);

describe('sequence owner', () => {
    test('a new sequence belongs to justin', async () => {
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        const response = await post(ownerId, `/api/layers/${layer.id}/sequences`, {});

        expect(response.status).toBe(201);
        expect(response.body.data.owner).toBe('justin');
    });

    test('PATCH sets owner to bourne and back to justin', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await createFixture(conn);
        const patch = (owner) =>
            request(app)
                .patch(`/api/sequences/${sequence.id}`)
                .set('Authorization', authHeaderFor(ownerId))
                .send({ owner });

        const toBourne = await patch('bourne');
        const toJustin = await patch('justin');

        expect(toBourne.status).toBe(200);
        expect(toBourne.body.data.owner).toBe('bourne');
        expect(toJustin.body.data.owner).toBe('justin');
    });

    test.each(['Bourne', 'nobody', '', null, 3])('PATCH rejects owner %p with 400', async (owner) => {
        const conn = getConn();
        const { ownerId, sequence } = await createFixture(conn);

        const response = await request(app)
            .patch(`/api/sequences/${sequence.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ owner });

        expect(response.status).toBe(400);
        expect((await sequencesRepo.findById(conn, sequence.id)).owner).toBe('justin');
    });

    test('POST /layers/:id/sequences accepts an owner', async () => {
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        const response = await post(ownerId, `/api/layers/${layer.id}/sequences`, { owner: 'bourne' });

        expect(response.status).toBe(201);
        expect(response.body.data.owner).toBe('bourne');
    });

    test('POST /layers/:id/sequences rejects an unknown owner', async () => {
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        const response = await post(ownerId, `/api/layers/${layer.id}/sequences`, { owner: 'x' });

        expect(response.status).toBe(400);
    });

    test('layer sequence import applies owner to every sequence', async () => {
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        const response = await post(ownerId, `/api/layers/${layer.id}/sequences/import`, {
            schema: SCHEMA,
            owner: 'bourne',
        });

        expect(response.status).toBe(201);
        expect(response.body.data.sequences.map((s) => s.owner)).toEqual(['bourne', 'bourne']);
    });

    test('layer sequence import defaults to justin', async () => {
        const conn = getConn();
        const { ownerId, layer } = await createFixture(conn);

        const response = await post(ownerId, `/api/layers/${layer.id}/sequences/import`, {
            schema: SCHEMA,
        });

        expect(response.body.data.sequences.map((s) => s.owner)).toEqual(['justin', 'justin']);
    });

    test('layer import applies owner to every sequence', async () => {
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        const response = await post(ownerId, `/api/projects/${project.id}/layers/import`, {
            schema: LAYER_SCHEMA,
            owner: 'bourne',
        });

        expect(response.status).toBe(201);
        expect(response.body.data.sequences.map((s) => s.owner)).toEqual(['bourne', 'bourne']);
    });

    test('layer import rejects an unknown owner', async () => {
        const conn = getConn();
        const { ownerId, project } = await createFixture(conn);

        const response = await post(ownerId, `/api/projects/${project.id}/layers/import`, {
            schema: LAYER_SCHEMA,
            owner: 'x',
        });

        expect(response.status).toBe(400);
    });
});
