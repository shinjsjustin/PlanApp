'use strict';

const request = require('supertest');

const app = require('../../src/server');

describe('public legal pages', () => {
    const pageCases = [
        ['/about', 'About'],
        ['/privacy', 'Privacy Policy'],
        ['/privacy', 'Limited Use'],
        ['/terms', 'Governing law'],
    ];

    test.each(pageCases)('GET %s with no token answers HTML containing "%s"', async (path, text) => {
        const res = await request(app).get(path);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain(text);
    });

    test.each(['/about', '/privacy', '/terms'])('GET %s links to all three pages', async (path) => {
        const res = await request(app).get(path);

        expect(res.text).toContain('href="/about"');
        expect(res.text).toContain('href="/privacy"');
        expect(res.text).toContain('href="/terms"');
    });

    test.each(['/legal/tokens.css', '/legal/legal.css'])('GET %s answers CSS', async (path) => {
        const res = await request(app).get(path);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/css/);
    });

    test('tokens.css carries the app tokens', async () => {
        const res = await request(app).get('/legal/tokens.css');

        expect(res.text).toContain(':root');
    });
});
