'use strict';

const { test, expect } = require('@playwright/test');
const globalSetup = require('./globalSetup');
const { guardReadOnly, listProjects, savedToken } = require('./session');

test('the saved sign-in state holds a token', () => {
    expect(savedToken()).toBeTruthy();
});

test('listProjects returns every seeded project id locally', async ({ request }) => {
    test.skip(Boolean(process.env.VISUAL_BASE_URL), 'a live account may own fewer than two projects');

    const ids = await listProjects(request, savedToken());

    expect(ids.length).toBeGreaterThanOrEqual(2);
    ids.forEach((id) => expect(Number.isInteger(id)).toBe(true));
});

test('guardReadOnly aborts writes to the API in live mode and lets reads through', async ({ page }) => {
    await page.goto('/');
    process.env.VISUAL_BASE_URL = 'http://live.example.test';

    try {
        await page.route('http://live.example.test/**', (route) =>
            route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '[]' })
        );
        await guardReadOnly(page);

        const post = await page.evaluate(() =>
            fetch('http://live.example.test/api/projects', { method: 'POST', body: '{}' }).then(() => 'sent', () => 'aborted')
        );
        const get = await page.evaluate(() =>
            fetch('http://live.example.test/api/projects').then(() => 'sent', () => 'aborted')
        );

        expect(post).toBe('aborted');
        expect(get).toBe('sent');
    } finally {
        delete process.env.VISUAL_BASE_URL;
    }
});

test('guardReadOnly leaves writes alone locally', async ({ page }) => {
    await page.goto('/');
    await guardReadOnly(page);

    const post = await page.evaluate(() =>
        fetch('/api/projects', { method: 'POST', body: '{}' }).then(() => 'sent', () => 'aborted')
    );

    expect(post).toBe('sent');
});

test('guardReadOnly guards a live API URL that has no /api path', async ({ page }) => {
    await page.goto('/');
    process.env.VISUAL_BASE_URL = 'http://live.example.test';
    process.env.VISUAL_API_URL = 'http://api.example.test';

    try {
        await page.route('http://api.example.test/**', (route) =>
            route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '[]' })
        );
        await guardReadOnly(page);

        const send = (method) =>
            page.evaluate(
                (m) => fetch('http://api.example.test/projects', { method: m }).then(() => 'sent', () => 'aborted'),
                method
            );

        expect(await send('POST')).toBe('aborted');
        expect(await send('GET')).toBe('sent');
    } finally {
        delete process.env.VISUAL_BASE_URL;
        delete process.env.VISUAL_API_URL;
    }
});

test('globalSetup rejects naming VISUAL_TOKEN when live mode has no token', async () => {
    const originalToken = process.env.VISUAL_TOKEN;
    delete process.env.VISUAL_TOKEN;
    process.env.VISUAL_BASE_URL = 'http://live.example.test';

    try {
        await expect(globalSetup()).rejects.toThrow(/VISUAL_TOKEN/);
    } finally {
        delete process.env.VISUAL_BASE_URL;
        if (originalToken !== undefined) process.env.VISUAL_TOKEN = originalToken;
    }
});
