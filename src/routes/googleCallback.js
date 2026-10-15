'use strict';

const express = require('express');

const { verifyState } = require('../lib/google/oauthState');

const router = express.Router();

const calendarUrl = (outcome) =>
    `${process.env.CLIENT_URL || 'http://localhost:3000'}/calendar?google=${outcome}`;

// Google redirects the browser here, so the outcome travels as a redirect and
// nothing about tokens or errors is ever rendered. No Google call happens here.
router.get('/callback', async (req, res) => {
    try {
        const { state, code, error } = req.query;
        if (error) throw new Error(`Google returned error: ${error}`);

        if (!code) throw new Error('Google sent no code');
        verifyState(state);

        // The browser finishes via POST /complete, so only the session owner can link.
        res.redirect(`${calendarUrl('complete')}&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    } catch (err) {
        console.error('Google callback failed:', err.message);
        res.redirect(calendarUrl('error'));
    }
});

module.exports = router;
