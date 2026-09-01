'use strict';

/**
 * Reads a setting the app must not invent a value for.
 *
 * A secret with a fallback is not a secret: the fallback ships in the source, so
 * a deployment that forgot to configure one runs on a value anybody can read.
 * Refusing at startup turns that into a message on the console before the server
 * accepts a single request, rather than a signing key that quietly is not one.
 *
 * Whitespace counts as missing — `JWT_SECRET=` in a `.env` file reads as set to
 * Node, and is exactly the mistake this is here to catch.
 */
const requiredEnv = (name) => {
    const value = process.env[name];

    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(
            `${name} is not set. The server cannot start without it — ` +
                'add it to .env (see .env.example).'
        );
    }

    return value;
};

module.exports = requiredEnv;
