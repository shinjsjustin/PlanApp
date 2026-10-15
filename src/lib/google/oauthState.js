'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { badRequest } = require('../httpError');

const STATE_PURPOSE = 'google-oauth';
const STATE_TTL = '10m';

// Derived so a state can never verify as a login token, nor the reverse.
const stateKey = () =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update('google-oauth-state').digest();

const signState = (userId) =>
    jwt.sign({ uid: userId, purpose: STATE_PURPOSE }, stateKey(), { expiresIn: STATE_TTL });

const verifyState = (token) => {
    try {
        const payload = jwt.verify(String(token), stateKey());
        if (payload.purpose !== STATE_PURPOSE || payload.uid === undefined) throw new Error('wrong purpose');
        return payload.uid;
    } catch (err) {
        throw badRequest('Invalid Google state');
    }
};

module.exports = { signState, verifyState };
