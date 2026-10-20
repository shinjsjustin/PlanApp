'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/server');
const pool = require('../../src/db/db');
const { assertTestDatabase } = require('../helpers/db');

/**
 * The registration and login endpoints — the door into everything else.
 *
 * ShinPlan is invitation only: registration is closed and answers 403, and
 * accounts are created by hand in the database. Login is the template's route,
 * kept as it was; its accounts are seeded straight into `users` here.
 *
 * Unlike every other suite here, these tests cannot run inside a rolled-back
 * transaction: `auth.js` reads through the pool rather than the unit of work,
 * and the seeded rows commit on their own connection. Every account is
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

const SIGNUP_CLOSED = { error: 'Signup is closed. ShinPlan is invitation only.' };

const seedUser = async (email) => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await pool.execute(
        'INSERT INTO users (name, email, password, access_level) VALUES (?, ?, ?, ?)',
        ['Drone Builder', email, hash, 1]
    );
};

describe('POST /api/auth/register', () => {
    test('answers 403 and creates no account for a full valid body', async () => {
        // Arrange
        const email = emailFor('closed');

        // Act
        const response = await register({ name: 'Drone Builder', email, password: PASSWORD });

        // Assert
        expect(response.status).toBe(403);
        expect(response.body).toEqual(SIGNUP_CLOSED);
        expect(await userRow(email)).toBeNull();
    });

    test('answers the same 403 for an empty body', async () => {
        // Act
        const response = await register({});

        // Assert
        expect(response.status).toBe(403);
        expect(response.body).toEqual(SIGNUP_CLOSED);
    });
});

describe('POST /api/auth/login', () => {
    test('returns a token carrying the id and access level isAuth reads', async () => {
        // Arrange
        const email = emailFor('login');
        await seedUser(email);
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
        await seedUser(email);

        // Act
        const response = await login({ email, password: 'not-the-password' });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.token).toBeUndefined();
    });
});
