'use strict';

const oauth = require('../../src/lib/google/oauth');
const { googleNotConnected, googleNotConfigured } = require('../../src/lib/google/errors');
const { HttpError } = require('../../src/lib/httpError');

const ENV = {
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'csecret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3001/cb',
};

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

describe('google oauth', () => {
    let saved;
    let fetchSpy;
    beforeEach(() => {
        saved = { ...process.env };
        Object.assign(process.env, ENV);
        fetchSpy = jest.spyOn(global, 'fetch');
    });
    afterEach(() => {
        fetchSpy.mockRestore();
        process.env = saved;
    });

    describe('errors', () => {
        it('googleNotConnected is a 409', () => {
            const e = googleNotConnected();
            expect(e).toBeInstanceOf(HttpError);
            expect([e.status, e.message]).toEqual([409, 'Google not connected']);
        });
        it('googleNotConfigured is a 503', () => {
            const e = googleNotConfigured();
            expect(e).toBeInstanceOf(HttpError);
            expect(e.status).toBe(503);
        });
    });

    describe('googleConfig', () => {
        it.each(Object.keys(ENV))('throws 503 when %s is unset', (name) => {
            delete process.env[name];
            expect(() => oauth.googleConfig()).toThrow(expect.objectContaining({ status: 503 }));
        });
        it('returns the configured values', () => {
            expect(oauth.googleConfig()).toEqual({
                clientId: 'cid', clientSecret: 'csecret', redirectUri: 'http://localhost:3001/cb',
            });
        });
    });

    describe('buildAuthUrl', () => {
        it('includes every required parameter', () => {
            const url = new URL(oauth.buildAuthUrl('st8'));
            expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
            const p = url.searchParams;
            expect(p.get('client_id')).toBe('cid');
            expect(p.get('redirect_uri')).toBe('http://localhost:3001/cb');
            expect(p.get('response_type')).toBe('code');
            expect(p.get('access_type')).toBe('offline');
            expect(p.get('prompt')).toBe('consent');
            expect(p.get('state')).toBe('st8');
            expect(p.get('scope').split(' ')).toEqual([
                'openid',
                'email',
                'https://www.googleapis.com/auth/calendar.events',
                'https://www.googleapis.com/auth/drive.readonly',
            ]);
        });
        it('throws 503 when unconfigured', () => {
            delete process.env.GOOGLE_CLIENT_ID;
            expect(() => oauth.buildAuthUrl('s')).toThrow(expect.objectContaining({ status: 503 }));
        });
    });

    describe('token endpoints', () => {
        const sent = () => {
            const [url, init] = fetchSpy.mock.calls[0];
            return { url, init, body: new URLSearchParams(init.body) };
        };

        it('exchangeCode posts the code grant', async () => {
            fetchSpy.mockResolvedValue(reply(200, { access_token: 'a', refresh_token: 'r' }));
            const out = await oauth.exchangeCode('thecode');
            expect(out).toEqual({ access_token: 'a', refresh_token: 'r' });
            const { url, init, body } = sent();
            expect(url).toBe('https://oauth2.googleapis.com/token');
            expect(init.method).toBe('POST');
            expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
            expect(Object.fromEntries(body)).toEqual({
                code: 'thecode', client_id: 'cid', client_secret: 'csecret',
                redirect_uri: 'http://localhost:3001/cb', grant_type: 'authorization_code',
            });
        });

        it('refreshAccessToken posts the refresh grant', async () => {
            fetchSpy.mockResolvedValue(reply(200, { access_token: 'new' }));
            expect(await oauth.refreshAccessToken('rt')).toEqual({ access_token: 'new' });
            const { url, body } = sent();
            expect(url).toBe('https://oauth2.googleapis.com/token');
            expect(Object.fromEntries(body)).toEqual({
                refresh_token: 'rt', client_id: 'cid', client_secret: 'csecret',
                grant_type: 'refresh_token',
            });
        });

        it('refresh answered 400 invalid_grant throws code invalid_grant', async () => {
            fetchSpy.mockResolvedValue(reply(400, { error: 'invalid_grant' }));
            await expect(oauth.refreshAccessToken('rt')).rejects.toMatchObject({ code: 'invalid_grant' });
        });

        it('revokeToken posts the token to the revoke endpoint', async () => {
            fetchSpy.mockResolvedValue(reply(200, {}));
            await oauth.revokeToken('tok');
            const { url, init, body } = sent();
            expect(url).toBe('https://oauth2.googleapis.com/revoke');
            expect(init.method).toBe('POST');
            expect(Object.fromEntries(body)).toEqual({ token: 'tok' });
        });

        it('revokeToken throws on non-2xx carrying Google error code', async () => {
            fetchSpy.mockResolvedValue(reply(400, { error: 'invalid_token' }));
            await expect(oauth.revokeToken('tok')).rejects.toMatchObject({ code: 'invalid_token' });
        });
    });
});
