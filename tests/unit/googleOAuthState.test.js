'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { signState, verifyState } = require('../../src/lib/google/oauthState');

beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';
});

const stateKey = () =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update('google-oauth-state').digest();

describe('google oauth state', () => {
    test('round trips the user id', () => {
        expect(verifyState(signState(42))).toBe(42);
    });

    test('carries uid and the google-oauth purpose for 10 minutes, signed with the derived key', () => {
        const payload = jwt.verify(signState(7), stateKey());
        expect(payload).toMatchObject({ uid: 7, purpose: 'google-oauth' });
        expect(payload.exp - payload.iat).toBe(600);
    });

    test.each([
        ['garbage', () => 'nope'],
        ['a token signed with JWT_SECRET itself', () =>
            jwt.sign({ uid: 1, purpose: 'google-oauth' }, process.env.JWT_SECRET, { expiresIn: '10m' })],
        ['an expired token', () =>
            jwt.sign({ uid: 1, purpose: 'google-oauth' }, stateKey(), { expiresIn: -10 })],
        ['another purpose', () => jwt.sign({ uid: 1, purpose: 'login' }, stateKey(), { expiresIn: '10m' })],
        ['a login token', () => jwt.sign({ id: 1 }, stateKey(), { expiresIn: '10m' })],
        ['undefined', () => undefined],
    ])('throws a 400 HttpError for %s', (_name, make) => {
        expect.assertions(2);
        try {
            verifyState(make());
        } catch (err) {
            expect(err.name).toBe('HttpError');
            expect(err.status).toBe(400);
        }
    });
});
