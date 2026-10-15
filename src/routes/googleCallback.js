'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');

const { OAUTH_STATE_PURPOSE } = require('./google');
const { connectWithCode } = require('../lib/google/session');
const { withTransaction } = require('../db/unitOfWork');

const router = express.Router();

const calendarUrl = (outcome) =>
    `${process.env.CLIENT_URL || 'http://localhost:3000'}/calendar?google=${outcome}`;

// Google redirects the browser here, so the outcome travels as a redirect and
// nothing about tokens or errors is ever rendered.
router.get('/callback', async (req, res) => {
    try {
        const { state, code, error } = req.query;
        if (error) throw new Error(`Google returned error: ${error}`);

        const payload = jwt.verify(String(state), process.env.JWT_SECRET);
        if (payload.purpose !== OAUTH_STATE_PURPOSE) throw new Error('State has the wrong purpose');

        await withTransaction((conn) => connectWithCode(conn, payload.id, String(code)));
        res.redirect(calendarUrl('connected'));
    } catch (err) {
        console.error('Google callback failed:', err.message);
        res.redirect(calendarUrl('error'));
    }
});

module.exports = router;
