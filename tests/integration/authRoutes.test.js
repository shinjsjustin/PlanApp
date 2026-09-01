'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../../src/server');
const pool = require('../../src/db/db');
const { assertTestDatabase } = require('../helpers/db');

/**
 * The registration and login endpoints — the door into everything else.
 *
 * These are the template's routes, kept rather than rewritten, with one
 * correction the spec calls for: a new account is granted `access_level = 1`,
 * because `ProtectedRoute` requires 1 and the scaffold granted 0, which locked
 * every new signup out of the app it had just joined (spec section 4.1). That
 * correction has no other test; the E2E flow only notices it by managing to
 * reach the projects page at all.
 *
 * Unlike every other suite here, these tests cannot run inside a rolled-back
 * transaction: `auth.js` writes through the pool rather than the unit of work,
 * so its rows land on a connection of their own and commit. Every account is
 * created under a prefix unique to the run and deleted afterwards instead.
 */

const RUN_PREFIX = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emailFor = (name) => `${RUN_PREFIX}-${name}@example.test`;

const PASSWORD = 'a-real-enough-password';

const register = (body) => request(app).post('/api/auth/register').send(body);

const login = (body) => request(app).post('/api/auth/login').send(body);

const userRow = async (email) => {
    const [rows] = await pool.execute(
        'SELECT id, name, email, password, access_level FROM users WHERE email = ?',
        [email]
    );

    return rows[0] ?? null;
};

beforeAll(() => {
    assertTestDatabase();
});

afterAll(async () => {
    await pool.execute('DELETE FROM users WHERE email LIKE ?', [`${RUN_PREFIX}-%`]);
    await pool.end();
});

describe('POST /api/auth/register', () => {
    test('creates an account that is approved to use the app straight away', async () => {
        // Arrange
        const email = emailFor('approved');

        // Act
        const response = await register({ name: 'Drone Builder', email, password: PASSWORD });

        // Assert — access_level 1, the correction from spec section 4.1. At 0
        // the account would exist and still be turned away at every page.
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ name: 'Drone Builder', email });

        const stored = await userRow(email);
        expect(stored.access_level).toBe(1);
    });

    test('stores the password hashed rather than as it was typed', async () => {
        // Arrange
        const email = emailFor('hashed');

        // Act
        await register({ name: 'Drone Builder', email, password: PASSWORD });

        // Assert
        const stored = await userRow(email);
        expect(stored.password).not.toBe(PASSWORD);
        expect(stored.password).toMatch(/^\$2[aby]\$/);
    });

    test('answers 400 when a field is missing', async () => {
        // Arrange
        const email = emailFor('partial');

        // Act
        const response = await register({ email, password: PASSWORD });

        // Assert
        expect(response.status).toBe(400);
        expect(await userRow(email)).toBeNull();
    });

    test('answers 409 rather than creating a second account on one email', async () => {
        // Arrange
        const email = emailFor('duplicate');
        await register({ name: 'First', email, password: PASSWORD });

        // Act
        const response = await register({ name: 'Second', email, password: PASSWORD });

        // Assert
        expect(response.status).toBe(409);

        const stored = await userRow(email);
        expect(stored.name).toBe('First');
    });
});

describe('POST /api/auth/login', () => {
    test('returns a token carrying the id and access level isAuth reads', async () => {
        // Arrange
        const email = emailFor('login');
        await register({ name: 'Drone Builder', email, password: PASSWORD });
        const stored = await userRow(email);

        // Act
        const response = await login({ email, password: PASSWORD });

        // Assert
        expect(response.status).toBe(200);

        const payload = jwt.verify(response.body.token, process.env.JWT_SECRET);
        expect(payload).toMatchObject({ id: stored.id, email, access: 1 });
    });

    test('answers 400 when a field is missing', async () => {
        // Act
        const response = await login({ email: emailFor('login') });

        // Assert
        expect(response.status).toBe(400);
    });

    test('answers 404 for an email with no account', async () => {
        // Act
        const response = await login({ email: emailFor('nobody'), password: PASSWORD });

        // Assert
        expect(response.status).toBe(404);
        expect(response.body.token).toBeUndefined();
    });

    test('answers 400 and issues no token for the wrong password', async () => {
        // Arrange
        const email = emailFor('wrong-password');
        await register({ name: 'Drone Builder', email, password: PASSWORD });

        // Act
        const response = await login({ email, password: 'not-the-password' });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.token).toBeUndefined();
    });
});
