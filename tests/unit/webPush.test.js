'use strict';

const crypto = require('node:crypto');
const {
    generateVapidKeys, encryptPayload, vapidAuthorization, sendNotification,
} = require('../../src/lib/push/webPush');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

const hkdf = (salt, ikm, info, len) =>
    Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

const newSubscriber = () => {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = crypto.randomBytes(16);
    return { ecdh, auth, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } };
};

// Independent RFC 8291 / 8188 decryption.
const decrypt = (body, ecdh, auth) => {
    const salt = body.subarray(0, 16);
    const recordSize = body.readUInt32BE(16);
    const idLen = body[20];
    const asPublic = body.subarray(21, 21 + idLen);
    const ciphertext = body.subarray(21 + idLen);
    const secret = ecdh.computeSecret(asPublic);
    const prk = hkdf(auth, secret, Buffer.concat([
        Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]), 32);
    const cek = hkdf(salt, prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, prk, Buffer.from('Content-Encoding: nonce\0'), 12);
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    const padded = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()]);
    return { recordSize, idLen, padded };
};

describe('generateVapidKeys', () => {
    it('returns a 65-byte uncompressed public key and 32-byte private key in base64url', () => {
        const { publicKey, privateKey } = generateVapidKeys();
        const pub = fromB64u(publicKey);
        expect(pub.length).toBe(65);
        expect(pub[0]).toBe(0x04);
        expect(fromB64u(privateKey).length).toBe(32);
        expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});

describe('encryptPayload', () => {
    it('decrypts back to the plaintext with the subscriber key and auth secret', () => {
        const sub = newSubscriber();
        const plaintext = JSON.stringify({ title: 'Pay rent', body: 'Due today', url: '/' });
        const body = encryptPayload(plaintext, sub.keys);
        const { recordSize, idLen, padded } = decrypt(body, sub.ecdh, sub.auth);
        expect(recordSize).toBe(4096);
        expect(idLen).toBe(65);
        expect(padded[padded.length - 1]).toBe(0x02);
        expect(padded.subarray(0, padded.length - 1).toString('utf8')).toBe(plaintext);
    });

    it('uses a fresh salt and sender key each call', () => {
        const sub = newSubscriber();
        const a = encryptPayload('x', sub.keys);
        const b = encryptPayload('x', sub.keys);
        expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false);
        expect(a.subarray(21, 86).equals(b.subarray(21, 86))).toBe(false);
    });
});

describe('vapidAuthorization', () => {
    const vapid = { subject: 'mailto:a@example.com', ...generateVapidKeys() };
    const now = new Date('2026-10-22T12:00:00Z');

    it('returns a verifiable ES256 JWT with aud, sub and exp within 24h', () => {
        const header = vapidAuthorization('https://push.example.com:8443/send/abc', vapid, now);
        const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
        expect(m).not.toBeNull();
        expect(m[2]).toBe(vapid.publicKey);
        const [h, p, s] = m[1].split('.');
        expect(JSON.parse(fromB64u(h))).toEqual({ typ: 'JWT', alg: 'ES256' });
        const claims = JSON.parse(fromB64u(p));
        expect(claims.aud).toBe('https://push.example.com:8443');
        expect(claims.sub).toBe(vapid.subject);
        const nowSec = Math.floor(now.getTime() / 1000);
        expect(claims.exp).toBeGreaterThan(nowSec);
        expect(claims.exp).toBeLessThanOrEqual(nowSec + 86400);
        const pub = fromB64u(vapid.publicKey);
        const key = crypto.createPublicKey({
            key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) },
            format: 'jwk',
        });
        const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`),
            { key, dsaEncoding: 'ieee-p1363' }, fromB64u(s));
        expect(ok).toBe(true);
    });
});

describe('sendNotification', () => {
    const vapid = { subject: 'mailto:a@example.com', ...generateVapidKeys() };
    const payload = { title: 't', body: 'b', url: '/' };

    it('POSTs encrypted body with headers and resolves statusCode on 2xx', async () => {
        const sub = newSubscriber();
        const calls = [];
        const fetchImpl = async (url, init) => {
            calls.push([url, init]);
            return { status: 201, text: async () => '' };
        };
        const res = await sendNotification(
            { endpoint: 'https://push.example.com/send/1', keys: sub.keys },
            payload, { vapid, ttl: 60, fetchImpl });
        expect(res).toEqual({ statusCode: 201 });
        const [url, init] = calls[0];
        expect(url).toBe('https://push.example.com/send/1');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Encoding']).toBe('aes128gcm');
        expect(init.headers.TTL).toBe('60');
        expect(init.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
        const { padded } = decrypt(Buffer.from(init.body), sub.ecdh, sub.auth);
        expect(JSON.parse(padded.subarray(0, padded.length - 1).toString())).toEqual(payload);
    });

    it('defaults ttl to 86400', async () => {
        const sub = newSubscriber();
        let headers;
        const fetchImpl = async (u, init) => { headers = init.headers; return { status: 200, text: async () => '' }; };
        await sendNotification({ endpoint: 'https://p.example.com/x', keys: sub.keys }, payload, { vapid, fetchImpl });
        expect(headers.TTL).toBe('86400');
    });

    it('rejects with statusCode and body on a non-2xx response', async () => {
        const sub = newSubscriber();
        const fetchImpl = async () => ({ status: 410, text: async () => 'gone' });
        await expect(sendNotification(
            { endpoint: 'https://push.example.com/send/2', keys: sub.keys },
            payload, { vapid, fetchImpl },
        )).rejects.toMatchObject({ statusCode: 410, body: 'gone' });
    });
});

describe('encryptPayload size guard', () => {
    it('throws RangeError at 4080 bytes and round-trips 4079', () => {
        const sub = newSubscriber();
        expect(() => encryptPayload('a'.repeat(4080), sub.keys)).toThrow(RangeError);
        const { padded } = decrypt(encryptPayload('a'.repeat(4079), sub.keys), sub.ecdh, sub.auth);
        expect(padded.length - 1).toBe(4079);
    });

    it('counts UTF-8 bytes, not characters', () => {
        const sub = newSubscriber();
        expect(() => encryptPayload('é'.repeat(2040), sub.keys)).toThrow(RangeError);
        expect(() => encryptPayload('é'.repeat(2039), sub.keys)).not.toThrow();
    });
});
