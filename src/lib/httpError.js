'use strict';

/**
 * Errors the API means to return to the client, as opposed to faults.
 *
 * Anything thrown as an `HttpError` carries the status and the exact message the
 * caller should see; everything else that reaches the error handler is treated
 * as a server fault, logged in full, and answered with a generic 500. Keeping
 * the two apart is what stops internals leaking (spec section 5).
 */
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        Error.captureStackTrace?.(this, HttpError);
    }
}

const badRequest = (message) => new HttpError(400, message);

const forbidden = (message = 'You do not have permission to access this resource') =>
    new HttpError(403, message);

const notFound = (resource = 'Resource') => new HttpError(404, `${resource} not found`);

module.exports = { HttpError, badRequest, forbidden, notFound };
