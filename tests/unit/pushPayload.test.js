'use strict';

const { fitPayload, MAX_PAYLOAD_BYTES } = require('../../src/lib/push/payload');

const size = (p) => Buffer.byteLength(JSON.stringify(p));
const url = '/reminders?id=7';

describe('fitPayload', () => {
    it('returns the payload unchanged when JSON is within 3000 bytes', () => {
        const payload = { title: 'T', body: 'x'.repeat(2900), url };
        expect(MAX_PAYLOAD_BYTES).toBe(3000);
        expect(size(payload)).toBeLessThanOrEqual(3000);
        expect(fitPayload(payload)).toEqual(payload);
    });

    it('shortens only the body, with an ellipsis, when it is too long', () => {
        const out = fitPayload({ title: 'Call mom', body: 'word '.repeat(2000), url });
        expect(size(out)).toBeLessThanOrEqual(3000);
        expect(size(out)).toBeGreaterThan(2900);
        expect(out.title).toBe('Call mom');
        expect(out.url).toBe(url);
        expect(out.body.endsWith('…')).toBe(true);
        expect(out.body.startsWith('word word')).toBe(true);
    });

    it.each([['emoji', '😀'], ['accented', 'é'], ['cjk', '日']])(
        'never splits a %s character in a long body',
        (_n, ch) => {
            const out = fitPayload({ title: 'T', body: ch.repeat(3000), url });
            expect(size(out)).toBeLessThanOrEqual(3000);
            expect(out.body).toBe(ch.repeat(Array.from(out.body).length - 1) + '…');
            expect(Buffer.from(out.body).toString('utf8')).toBe(out.body);
        },
    );

    it('shortens the title after emptying the body, keeping url whole', () => {
        const out = fitPayload({ title: '😀é'.repeat(1500), body: 'long '.repeat(500), url });
        expect(size(out)).toBeLessThanOrEqual(3000);
        expect(out.body).toBe('…');
        expect(out.title.endsWith('…')).toBe(true);
        expect(out.title.startsWith('😀é😀é')).toBe(true);
        expect(out.url).toBe(url);
    });

    it('does not mutate its input', () => {
        const payload = { title: 'T', body: 'x'.repeat(5000), url };
        fitPayload(payload);
        expect(payload.body.length).toBe(5000);
    });
});
