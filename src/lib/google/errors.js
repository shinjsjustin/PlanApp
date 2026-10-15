'use strict';

const { HttpError } = require('../httpError');

// 409/503, never 401: the client logs the user out on 401.
const googleNotConnected = () => new HttpError(409, 'Google not connected');

const googleNotConfigured = () => new HttpError(503, 'Google is not configured on the server');

module.exports = { googleNotConnected, googleNotConfigured };
