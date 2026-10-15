'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');

const asyncRoute = require('../lib/asyncRoute');
const googleAccountsRepo = require('../db/repositories/googleAccountsRepo');
const { buildAuthUrl } = require('../lib/google/oauth');
const { disconnect } = require('../lib/google/session');
const { withConnection, withTransaction } = require('../db/unitOfWork');

// Shared with the callback, which rejects any state that lacks it.
const OAUTH_STATE_PURPOSE = 'google-oauth';
const OAUTH_STATE_TTL = '10m';

const router = express.Router();

router.get('/status', asyncRoute(async (req, res) => {
    const account = await withConnection((conn) => googleAccountsRepo.findByUser(conn, req.user.id));
    res.sendData(account ? { connected: true, email: account.email } : { connected: false });
}));

router.post('/connect', asyncRoute(async (req, res) => {
    const state = jwt.sign({ id: req.user.id, purpose: OAUTH_STATE_PURPOSE }, process.env.JWT_SECRET, {
        expiresIn: OAUTH_STATE_TTL,
    });
    res.sendData({ url: buildAuthUrl(state) });
}));

router.delete('/connection', asyncRoute(async (req, res) => {
    await withTransaction((conn) => disconnect(conn, req.user.id));
    res.sendData({ connected: false });
}));

module.exports = router;
module.exports.OAUTH_STATE_PURPOSE = OAUTH_STATE_PURPOSE;
