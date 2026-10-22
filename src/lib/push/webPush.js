'use strict';

const crypto = require('node:crypto');

const RECORD_SIZE = 4096;
const SALT_BYTES = 16;
const VAPID_LIFETIME_SEC = 12 * 60 * 60;
const PADDING_DELIMITER = 0x02;
const DEFAULT_TTL_SEC = 86400;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');
const hkdf = (salt, ikm, info, len) =>
    Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

const generateVapidKeys = () => {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
};

// RFC 8291 aes128gcm body for a single record.
const encryptPayload = (plaintext, { p256dh, auth }) => {
    const uaPublic = fromB64u(p256dh);
    const sender = crypto.createECDH('prime256v1');
    const asPublic = sender.generateKeys();
    const secret = sender.computeSecret(uaPublic);
    const prk = hkdf(fromB64u(auth), secret, Buffer.concat([
        Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
    const salt = crypto.randomBytes(SALT_BYTES);
    const cek = hkdf(salt, prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, prk, Buffer.from('Content-Encoding: nonce\0'), 12);
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const record = Buffer.concat([
        cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([PADDING_DELIMITER])])),
        cipher.final(),
        cipher.getAuthTag(),
    ]);
    const header = Buffer.alloc(SALT_BYTES + 4 + 1);
    salt.copy(header);
    header.writeUInt32BE(RECORD_SIZE, SALT_BYTES);
    header[SALT_BYTES + 4] = asPublic.length;
    return Buffer.concat([header, asPublic, record]);
};

const vapidAuthorization = (endpoint, { subject, publicKey, privateKey }, now = new Date()) => {
    const pub = fromB64u(publicKey);
    const key = crypto.createPrivateKey({
        key: {
            kty: 'EC', crv: 'P-256', d: privateKey,
            x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)),
        },
        format: 'jwk',
    });
    const claims = {
        aud: new URL(endpoint).origin,
        exp: Math.floor(now.getTime() / 1000) + VAPID_LIFETIME_SEC,
        sub: subject,
    };
    const unsigned = `${b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64u(JSON.stringify(claims))}`;
    const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
    return `vapid t=${unsigned}.${b64u(signature)}, k=${publicKey}`;
};

class WebPushError extends Error {
    constructor(statusCode, body) {
        super(`Received unexpected response code ${statusCode}`);
        this.name = 'WebPushError';
        this.statusCode = statusCode;
        this.body = body;
    }
}

const sendNotification = async (subscription, payload, { vapid, ttl = DEFAULT_TTL_SEC, fetchImpl = fetch }) => {
    const res = await fetchImpl(subscription.endpoint, {
        method: 'POST',
        headers: {
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(ttl),
            Authorization: vapidAuthorization(subscription.endpoint, vapid),
        },
        body: encryptPayload(JSON.stringify(payload), subscription.keys),
    });
    if (res.status < 200 || res.status > 299) throw new WebPushError(res.status, await res.text());
    return { statusCode: res.status };
};

module.exports = { generateVapidKeys, encryptPayload, vapidAuthorization, sendNotification, WebPushError };
