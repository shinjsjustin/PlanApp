'use strict';

/**
 * Express 4 does not catch rejections from async handlers — an unhandled one
 * hangs the request instead of reaching the error middleware. Wrapping every
 * async route in this forwards the rejection to `next`, so a single error
 * handler really does see every failure.
 */
const asyncRoute = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncRoute;
