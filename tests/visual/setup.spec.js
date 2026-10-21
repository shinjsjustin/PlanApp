'use strict';

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { STATE_PATH, guardReadOnly, listProjects } = require('./session');

const savedToken = () => {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const entry = state.origins.flatMap((origin) => origin.localStorage).find((item) => item.name === 'token');
    return entry && entry.value;
};

test('the saved sign-in state holds a token', () => {
    expect(savedToken()).toBeTruthy();
});

test('listProjects returns every seeded project id locally', async ({ request }) => {
    const ids = await listProjects(request, savedToken());

    expect(ids.length).toBeGreaterThanOrEqual(2);
    ids.forEach((id) => expect(Number.isInteger(id)).toBe(true));
});

test('guardReadOnly aborts writes to the API in live mode and lets reads through', async ({ page }) => {
    await page.goto('/');
    process.env.VISUAL_BASE_URL = 'http://live.example.test';

    try {
        await guardReadOnly(page);

        const post = await page.evaluate(() =>
            fetch('/api/projects', { method: 'POST', body: '{}' }).then(() => 'sent', () => 'aborted')
        );
        const get = await page.evaluate(() =>
            fetch('/api/projects').then(() => 'sent', () => 'aborted')
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
