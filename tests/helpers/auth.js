'use strict';

const jwt = require('jsonwebtoken');

/**
 * Signs a token the real `isAuth` middleware will accept, with the same payload
 * shape `POST /api/auth/login` issues. Route tests use this instead of logging
 * in over HTTP so they stay focused on the route under test.
 */
const tokenFor = (userId, { email = 'test@example.com', access = 1 } = {}) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not set — route tests cannot sign a token');
    }

    return jwt.sign({ id: userId, email, access }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
};

/** The Authorization header value for a user, ready to pass to supertest `.set`. */
const authHeaderFor = (userId, options) => `Bearer ${tokenFor(userId, options)}`;

module.exports = { tokenFor, authHeaderFor };
