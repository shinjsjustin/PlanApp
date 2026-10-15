'use strict';

const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

// Read per call so a missing or bad key fails the request, not server startup.
function getKey() {
    const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
    if (key.length !== KEY_BYTES) {
        throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return key;
}

function encrypt(text) {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join(':');
}

function decrypt(payload) {
    const [iv, tag, ciphertext] = payload.split(':').map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
