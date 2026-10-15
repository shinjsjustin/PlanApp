'use strict';

const { encrypt, decrypt } = require('../../src/lib/tokenCrypto');

const KEY = 'ab'.repeat(32);

describe('tokenCrypto', () => {
    const original = process.env.ENCRYPTION_KEY;
    beforeEach(() => { process.env.ENCRYPTION_KEY = KEY; });
    afterAll(() => { process.env.ENCRYPTION_KEY = original; });

    it('round-trips text', () => {
        expect(decrypt(encrypt('refresh-token-123'))).toBe('refresh-token-123');
    });

    it('produces different payloads for the same text', () => {
        expect(encrypt('same')).not.toBe(encrypt('same'));
    });

    it('formats payload as three base64 parts', () => {
        const parts = encrypt('x').split(':');
        expect(parts).toHaveLength(3);
        expect(Buffer.from(parts[0], 'base64')).toHaveLength(12);
        expect(Buffer.from(parts[1], 'base64')).toHaveLength(16);
    });

    it('throws on tampered ciphertext', () => {
        const [iv, tag, ct] = encrypt('secret text').split(':');
        const bytes = Buffer.from(ct, 'base64');
        bytes[0] ^= 1;
        expect(() => decrypt([iv, tag, bytes.toString('base64')].join(':'))).toThrow();
    });

    it('throws when the key is missing', () => {
        delete process.env.ENCRYPTION_KEY;
        expect(() => encrypt('x')).toThrow();
    });

    it('throws when the key is too short', () => {
        process.env.ENCRYPTION_KEY = 'abcd';
        expect(() => encrypt('x')).toThrow();
    });

    it('reads the key per call', () => {
        const payload = encrypt('x');
        process.env.ENCRYPTION_KEY = 'cd'.repeat(32);
        expect(() => decrypt(payload)).toThrow();
    });
});
