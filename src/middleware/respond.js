'use strict';

const { ZodError } = require('zod');

const { HttpError } = require('../lib/httpError');

/**
 * The `{ success, data, error }` response envelope and the error handler that
 * produces its failure half.
 *
 * The envelope is new in this phase and is applied to the `/api` resource routes
 * only. `routes/auth.js` and `routes/user.js` still answer with bare JSON, which
 * the login screen reads directly; migrating them is a separate change so that
 * screen keeps working.
 */

const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.';

const successEnvelope = (data) => ({ success: true, data, error: null });

const errorEnvelope = (message) => ({ success: false, data: null, error: message });

/**
 * Attaches `res.sendData(data, status)` so routes never hand-roll the envelope.
 * Mount it above the routers that use it.
 */
const respond = (req, res, next) => {
    res.sendData = (data, status = 200) => res.status(status).json(successEnvelope(data));
    next();
};

/**
 * Flattens a zod failure into one sentence naming the offending fields, so a 400
 * tells the client which input to fix rather than just that something was wrong.
 */
const describeValidationError = (error) =>
    error.issues
        .map((issue) => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');

/**
 * The terminal error handler. Expected failures answer with their own status and
 * message; anything else is logged with full request context and answered
 * generically. Nothing is swallowed — every branch responds or logs.
 */
const errorHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
        return res.status(400).json(errorEnvelope(describeValidationError(err)));
    }

    if (err instanceof HttpError) {
        return res.status(err.status).json(errorEnvelope(err.message));
    }

    const user = req.user ? `user ${req.user.id}` : 'anonymous';
    console.error(`Unhandled error on ${req.method} ${req.originalUrl} (${user}):`, err);

    return res.status(500).json(errorEnvelope(GENERIC_SERVER_ERROR));
};

module.exports = {
    GENERIC_SERVER_ERROR,
    describeValidationError,
    errorEnvelope,
    errorHandler,
    respond,
    successEnvelope,
};
