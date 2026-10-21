'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { checkPage } = require('./checks');
const { ROUTES } = require('./routes');
const { guardReadOnly, listProjects, savedToken } = require('./session');

const SCREENSHOT_DIR = 'visual-screenshots';
const SIGNED_OUT = { cookies: [], origins: [] };

const slugOf = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Visits one page, saves and attaches a full-page screenshot, and returns its problems.
async function visit(page, testInfo, { slug, path: url, open }) {
    await guardReadOnly(page);
    await page.goto(url);
    // Opening a form only reveals it; nothing is ever submitted.
    if (open) await page.getByRole('button', { name: open }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('h1, h2, main').first().waitFor();

    const dir = path.join(SCREENSHOT_DIR, testInfo.project.name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await testInfo.attach(slug, { path: file, contentType: 'image/png' });

    return (await checkPage(page)).map((problem) => `${slug}: ${problem}`);
}

const expectNoProblems = (problems) => expect(problems, problems.join('\n')).toEqual([]);

test.describe('signed out', () => {
    test.use({ storageState: SIGNED_OUT });

    for (const route of ROUTES.filter((r) => !r.signedIn)) {
        test(route.name, async ({ page }, testInfo) => {
            expectNoProblems(await visit(page, testInfo, { ...route, slug: slugOf(route.name) }));
        });
    }
});

test.describe('signed in', () => {
    for (const route of ROUTES.filter((r) => r.signedIn)) {
        test(route.name, async ({ page }, testInfo) => {
            expectNoProblems(await visit(page, testInfo, { ...route, slug: slugOf(route.name) }));
        });
    }

    const perProject = [
        ['project pages', (id) => `/projects/${id}`, 'project'],
        ['project thoughts', (id) => `/projects/${id}/thoughts`, 'project-thoughts'],
    ];

    for (const [name, urlFor, prefix] of perProject) {
        test(name, async ({ page, request }, testInfo) => {
            const problems = [];
            for (const id of await listProjects(request, savedToken())) {
                problems.push(...(await visit(page, testInfo, { slug: `${prefix}-${id}`, path: urlFor(id) })));
            }
            expectNoProblems(problems);
        });
    }
});
