'use strict';

const { test, expect } = require('@playwright/test');
const globalSetup = require('./globalSetup');
const { guardReadOnly, listProjects, savedToken } = require('./session');

// Sets the given variables (undefined unsets) for fn, then restores each exactly as it was.
async function withEnv(vars, fn) {
    const saved = Object.keys(vars).map((name) => [name, process.env[name]]);
    const apply = (name, value) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    };
    Object.entries(vars).forEach(([name, value]) => apply(name, value));
    try {
        return await fn();
    } finally {
        saved.forEach(([name, value]) => apply(name, value));
    }
}

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

    await withEnv({ VISUAL_BASE_URL: 'http://live.example.test' }, async () => {
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
    });
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

    await withEnv({ VISUAL_BASE_URL: 'http://live.example.test', VISUAL_API_URL: 'http://api.example.test' }, async () => {
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
    });
});

test('globalSetup rejects naming VISUAL_TOKEN when live mode has no token', async () => {
    await withEnv({ VISUAL_TOKEN: undefined, VISUAL_BASE_URL: 'http://live.example.test' }, async () => {
        await expect(globalSetup()).rejects.toThrow(/VISUAL_TOKEN/);
    });
});
