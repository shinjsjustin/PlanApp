'use strict';

const { googleNotConfigured } = require('./errors');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.readonly',
];

function googleConfig() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        throw googleNotConfigured();
    }
    return {
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        redirectUri: GOOGLE_REDIRECT_URI,
    };
}

function buildAuthUrl(state) {
    const { clientId, redirectUri } = googleConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES.join(' '),
        state,
    });
    return `${AUTH_URL}?${params}`;
}

async function postForm(url, fields) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.error_description || body.error || `Google responded ${res.status}`);
        err.code = body.error;
        err.status = res.status;
        throw err;
    }
    return body;
}

function exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = googleConfig();
    return postForm(TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });
}

function refreshAccessToken(refreshToken) {
    const { clientId, clientSecret } = googleConfig();
    return postForm(TOKEN_URL, {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
    });
}

function revokeToken(token) {
    return postForm(REVOKE_URL, { token });
}

module.exports = { SCOPES, googleConfig, buildAuthUrl, exchangeCode, refreshAccessToken, revokeToken };
