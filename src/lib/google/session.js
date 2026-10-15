'use strict';

// Turns a user id into a usable Google access token (connect, refresh, disconnect),
// so route and feature code only ever calls accessTokenFor.

const jwt = require('jsonwebtoken');

const googleAccountsRepo = require('../../db/repositories/googleAccountsRepo');
const { decrypt, encrypt } = require('../tokenCrypto');
const { googleNotConnected } = require('./errors');
const { SCOPES, exchangeCode, refreshAccessToken, revokeToken } = require('./oauth');

const EXPIRY_MARGIN_MS = 60 * 1000;

const expiryFrom = (now, expiresIn) => now() + expiresIn * 1000;

async function connectWithCode(conn, userId, code, now = Date.now) {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) throw googleNotConnected();

    await googleAccountsRepo.upsert(conn, {
        userId,
        email: jwt.decode(tokens.id_token).email,
        refreshTokenEnc: encrypt(tokens.refresh_token),
        accessTokenEnc: encrypt(tokens.access_token),
        accessExpiresAt: expiryFrom(now, tokens.expires_in),
        scopes: tokens.scope || SCOPES.join(' '),
    });
}

async function accessTokenFor(conn, userId, now = Date.now) {
    const account = await googleAccountsRepo.findByUser(conn, userId);
    if (!account) throw googleNotConnected();

    if (account.accessExpiresAt - now() > EXPIRY_MARGIN_MS) {
        return decrypt(account.accessTokenEnc);
    }

    let refreshed;
    try {
        refreshed = await refreshAccessToken(decrypt(account.refreshTokenEnc));
    } catch (err) {
        if (err.code !== 'invalid_grant') throw err;
        await googleAccountsRepo.remove(conn, userId);
        throw googleNotConnected();
    }

    await googleAccountsRepo.updateAccessToken(conn, userId, {
        accessTokenEnc: encrypt(refreshed.access_token),
        accessExpiresAt: expiryFrom(now, refreshed.expires_in),
    });
    return refreshed.access_token;
}

async function disconnect(conn, userId) {
    const account = await googleAccountsRepo.findByUser(conn, userId);
    if (!account) return;

    try {
        await revokeToken(decrypt(account.refreshTokenEnc));
    } catch {
        // Revoke is best effort: the user's intent is to unlink, so the row goes regardless.
    }
    await googleAccountsRepo.remove(conn, userId);
}

module.exports = { connectWithCode, accessTokenFor, disconnect };
