'use strict';

const express = require('express');

const asyncRoute = require('../lib/asyncRoute');
const googleAccountsRepo = require('../db/repositories/googleAccountsRepo');
const { buildAuthUrl } = require('../lib/google/oauth');
const { connectWithCode, disconnect } = require('../lib/google/session');
const { signState, verifyState } = require('../lib/google/oauthState');
const { HttpError, forbidden } = require('../lib/httpError');
const { googleNotConnected } = require('../lib/google/errors');
const { withConnection, withTransaction } = require('../db/unitOfWork');

const router = express.Router();

router.get('/status', asyncRoute(async (req, res) => {
    const account = await withConnection((conn) => googleAccountsRepo.findByUser(conn, req.user.id));
    res.sendData(account ? { connected: true, email: account.email } : { connected: false });
}));

router.post('/connect', asyncRoute(async (req, res) => {
    const state = signState(req.user.id);
    res.sendData({ url: buildAuthUrl(state) });
}));

router.post('/complete', asyncRoute(async (req, res) => {
    const { code, state } = req.body;
    // The state must have been minted for this very browser session's user.
    if (verifyState(state) !== req.user.id) throw forbidden();

    try {
        await withTransaction((conn) => connectWithCode(conn, req.user.id, String(code)));
    } catch (err) {
        if (err instanceof HttpError) throw err;
        console.error('Google exchange failed:', err.message);
        throw googleNotConnected();
    }
    const account = await withConnection((conn) => googleAccountsRepo.findByUser(conn, req.user.id));
    res.sendData({ connected: true, email: account.email });
}));

router.delete('/connection', asyncRoute(async (req, res) => {
    await withTransaction((conn) => disconnect(conn, req.user.id));
    res.sendData({ connected: false });
}));

module.exports = router;
