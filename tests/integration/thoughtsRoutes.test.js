'use strict';

const request = require('supertest');

const app = require('../../src/server');
const thoughtsRepo = require('../../src/db/repositories/thoughtsRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The thoughts endpoints, shared by the app and Bourne. Every request runs on
 * the test's rolled-back connection; refused writes are checked against the
 * database, not just the status.
 */

const MAX_LENGTH = 2000;

describe('GET /api/thoughts', () => {
    test('returns only the caller’s thoughts, newest first, in the wire shape', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const first = await thoughtsRepo.create(conn, { ownerId, text: 'first' });
        const second = await thoughtsRepo.create(conn, { ownerId, text: 'second' });
        await thoughtsRepo.create(conn, { ownerId: strangerId, text: 'theirs' });

        // Act
        const response = await request(app)
            .get('/api/thoughts')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.thoughts).toEqual([
            { id: second.id, text: 'second', createdAt: second.created_at.toISOString() },
            { id: first.id, text: 'first', createdAt: first.created_at.toISOString() },
        ]);
    });

    test('returns an empty list for a new user', async () => {
        // Arrange
        const ownerId = await createTestUser(getConn());

        // Act
        const response = await request(app)
            .get('/api/thoughts')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.thoughts).toEqual([]);
    });
});

describe('POST /api/thoughts', () => {
    test('trims the text and answers 201 with the stored thought', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post('/api/thoughts')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: '  remember milk  ' });

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({ text: 'remember milk' });
        const stored = await thoughtsRepo.listByOwner(conn, ownerId);
        expect(stored.map((row) => row.text)).toEqual(['remember milk']);
        expect(stored[0].id).toBe(response.body.data.id);
    });

    test('accepts text of exactly the maximum length', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post('/api/thoughts')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'a'.repeat(MAX_LENGTH) });

        // Assert
        expect(response.status).toBe(201);
    });

    test.each([
        ['empty', { text: '' }],
        ['whitespace-only', { text: '   \n ' }],
        ['non-string', { text: 42 }],
        ['missing', {}],
        ['over the limit', { text: 'a'.repeat(MAX_LENGTH + 1) }],
    ])('answers 400 and stores nothing for %s text', async (_label, payload) => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .post('/api/thoughts')
            .set('Authorization', authHeaderFor(ownerId))
            .send(payload);

        // Assert
        expect(response.status).toBe(400);
        expect(await thoughtsRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});

describe('PATCH /api/thoughts/:id', () => {
    test('returns the updated thought and stores the trimmed text', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const thought = await thoughtsRepo.create(conn, { ownerId, text: 'old' });

        // Act
        const response = await request(app)
            .patch(`/api/thoughts/${thought.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: ' new ' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: thought.id, text: 'new' });
        expect((await thoughtsRepo.findById(conn, thought.id)).text).toBe('new');
    });

    test('answers 400 for blank text and leaves the thought alone', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const thought = await thoughtsRepo.create(conn, { ownerId, text: 'keep' });

        // Act
        const response = await request(app)
            .patch(`/api/thoughts/${thought.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: '  ' });

        // Assert
        expect(response.status).toBe(400);
        expect((await thoughtsRepo.findById(conn, thought.id)).text).toBe('keep');
    });

    test('answers 403 for a stranger’s thought and changes nothing', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const thought = await thoughtsRepo.create(conn, { ownerId, text: 'mine' });

        // Act
        const response = await request(app)
            .patch(`/api/thoughts/${thought.id}`)
            .set('Authorization', authHeaderFor(strangerId))
            .send({ text: 'stolen' });

        // Assert
        expect(response.status).toBe(403);
        expect((await thoughtsRepo.findById(conn, thought.id)).text).toBe('mine');
    });

    test('answers 404 for a missing thought', async () => {
        // Arrange
        const ownerId = await createTestUser(getConn());

        // Act
        const response = await request(app)
            .patch('/api/thoughts/987654321')
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'x' });

        // Assert
        expect(response.status).toBe(404);
    });
});

describe('DELETE /api/thoughts/:id', () => {
    test('removes the thought and returns its id', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const thought = await thoughtsRepo.create(conn, { ownerId, text: 'gone' });
        const other = await thoughtsRepo.create(conn, { ownerId, text: 'stays' });

        // Act
        const response = await request(app)
            .delete(`/api/thoughts/${thought.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: thought.id });
        expect(await thoughtsRepo.findById(conn, thought.id)).toBeNull();
        expect(await thoughtsRepo.findById(conn, other.id)).not.toBeNull();
    });

    test('answers 403 for a stranger’s thought and keeps it', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const thought = await thoughtsRepo.create(conn, { ownerId, text: 'mine' });

        // Act
        const response = await request(app)
            .delete(`/api/thoughts/${thought.id}`)
            .set('Authorization', authHeaderFor(strangerId));

        // Assert
        expect(response.status).toBe(403);
        expect(await thoughtsRepo.findById(conn, thought.id)).not.toBeNull();
    });

    test('answers 404 for a missing thought', async () => {
        // Arrange
        const ownerId = await createTestUser(getConn());

        // Act
        const response = await request(app)
            .delete('/api/thoughts/987654321')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });
});

describe('DELETE /api/thoughts', () => {
    test('removes only the caller’s thoughts and returns the count', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        await thoughtsRepo.create(conn, { ownerId, text: 'one' });
        await thoughtsRepo.create(conn, { ownerId, text: 'two' });
        await thoughtsRepo.create(conn, { ownerId: strangerId, text: 'theirs' });

        // Act
        const response = await request(app)
            .delete('/api/thoughts')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ deleted: 2 });
        expect(await thoughtsRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await thoughtsRepo.listByOwner(conn, strangerId)).toHaveLength(1);
    });
});

describe('thoughts routes without a token', () => {
    test('POST answers 401 and stores nothing', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app).post('/api/thoughts').send({ text: 'sneaky' });

        // Assert
        expect(response.status).toBe(401);
        expect(await thoughtsRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});
