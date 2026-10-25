'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');
const { apiUrl, guardReadOnly, savedToken } = require('./session');

const PROTOTYPE_URL = pathToFileURL(
    path.join(__dirname, '..', '..', 'docs', 'reference', 'combinations-prototype.html')
).href;
const STATES = ['empty', 'drafted', 'done', 'struck'];
const NARROW_WIDTH = 860;
const RECIPE_DECK_NAME = 'HordeGame crafting';
const DEEPEST_ITEM = 'House';
const SCREENSHOT_DIR = 'visual-screenshots';

const slugOf = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Saves a full-page screenshot under visual-screenshots/ and attaches it to the report.
async function attachScreenshot(page, testInfo, label) {
    const name = `${slugOf(testInfo.title)}-${label}-${testInfo.project.name}`;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const file = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

const styleOf = (page, selector, props) =>
    page.locator(selector).first().evaluate(
        (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el)[name]])),
        props
    );

const rectOf = (page, selector) =>
    page.locator(selector).first().evaluate((el) => {
        const { left, right, top, bottom } = el.getBoundingClientRect();
        return { left, right, top, bottom };
    });

const openApp = async (page, request, view = '') => {
    await guardReadOnly(page);
    const res = await request.get(`${apiUrl()}/combinations/decks`, {
        headers: { Authorization: `Bearer ${savedToken()}` },
    });
    const { data } = await res.json();
    test.skip(!data.decks.length, 'The signed-in user has no decks');
    await page.goto(`/combinations${view}`);
    await page.locator('.layout').waitFor();
};

const openPrototype = async (browser, viewport, view) => {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < NARROW_WIDTH });
    const page = await context.newPage();
    await page.goto(PROTOTYPE_URL);
    if (view) await page.locator(`.tabs [data-view="${view}"]`).click();
    return page;
};

test.describe('combinations page matches the prototype', () => {
    test('chord stroke colour matches per state and the struck chord is dashed', async ({ page, request, browser }, testInfo) => {
        await openApp(page, request);
        await page.locator('.ring .chord').first().waitFor();
        const proto = await openPrototype(browser, page.viewportSize());
        const props = ['stroke', 'strokeDasharray', 'opacity'];

        for (const state of STATES) {
            const selector = `.ring .chord.st-${state}`;
            if (!(await page.locator(selector).count())) continue;
            const app = await styleOf(page, selector, props);
            expect(app, state).toEqual(await styleOf(proto, selector, props));
        }
        if (await page.locator('.ring .chord.st-struck').count()) {
            expect((await styleOf(page, '.ring .chord.st-struck', ['strokeDasharray'])).strokeDasharray).not.toBe('none');
        }
        await attachScreenshot(page, testInfo, 'app');
        await attachScreenshot(proto, testInfo, 'prototype');
        await proto.context().close();
    });

    test('view and side panels sit side by side when wide and stacked when narrow', async ({ page, request, browser }, testInfo) => {
        await openApp(page, request);
        const proto = await openPrototype(browser, page.viewportSize());
        const isWide = page.viewportSize().width > NARROW_WIDTH;

        for (const target of [page, proto]) {
            const view = await rectOf(target, '.view-panel');
            const side = await rectOf(target, '.side');
            if (isWide) expect(side.left).toBeGreaterThanOrEqual(view.right);
            else expect(side.top).toBeGreaterThanOrEqual(view.bottom);
        }
        await attachScreenshot(page, testInfo, 'app');
        await attachScreenshot(proto, testInfo, 'prototype');
        await proto.context().close();
    });
});

test.describe('combinations page on the phone', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== 'iphone', 'These checks are for the phone width');
    });

    const hasNoHorizontalOverflow = (page) =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    test('ring svg fits the viewport and the page does not scroll sideways', async ({ page, request }, testInfo) => {
        await openApp(page, request);
        await page.locator('.ring').waitFor();
        const ring = await rectOf(page, '.ring');
        const width = page.viewportSize().width;
        expect(ring.left).toBeGreaterThanOrEqual(0);
        expect(ring.right).toBeLessThanOrEqual(width);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
        await attachScreenshot(page, testInfo, 'app');
    });

    test('axis tray fits the viewport and the page does not scroll sideways', async ({ page, request }, testInfo) => {
        await openApp(page, request);
        await page.locator('.axis-tray').waitFor();
        const tray = await rectOf(page, '.axis-tray');
        const width = page.viewportSize().width;
        expect(tray.left).toBeGreaterThanOrEqual(0);
        expect(tray.right).toBeLessThanOrEqual(width);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
        await attachScreenshot(page, testInfo, 'app');
    });

    test('grid scrolls inside grid-wrap and the page does not scroll sideways', async ({ page, request }, testInfo) => {
        await openApp(page, request, '?view=grid');
        await page.locator('.grid-wrap').waitFor();
        const wrap = await page.locator('.grid-wrap').evaluate((el) => ({
            overflowX: getComputedStyle(el).overflowX,
            scrolls: el.scrollWidth > el.clientWidth,
        }));
        expect(['auto', 'scroll']).toContain(wrap.overflowX);
        expect(wrap.scrolls).toBe(true);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
        await attachScreenshot(page, testInfo, 'app');
    });

    test('recipe tree fits the viewport and the page does not scroll sideways', async ({ page, request }, testInfo) => {
        await guardReadOnly(page);
        const res = await request.get(`${apiUrl()}/combinations/decks`, {
            headers: { Authorization: `Bearer ${savedToken()}` },
        });
        const { data } = await res.json();
        const deck = data.decks.find((d) => d.name === RECIPE_DECK_NAME);
        test.skip(!deck, `The signed-in user has no deck named ${RECIPE_DECK_NAME}`);
        await page.goto(`/combinations?deck=${deck.id}&view=tree`);
        await page.locator('.tree').waitFor();
        await page.locator('.walk-head select').selectOption({ label: DEEPEST_ITEM });
        const collapsed = page.locator('.tree-toggle[aria-expanded="false"]');
        while (await collapsed.count()) await collapsed.first().click();
        const tree = await rectOf(page, '.tree');
        expect(tree.left).toBeGreaterThanOrEqual(0);
        expect(tree.right).toBeLessThanOrEqual(page.viewportSize().width);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
        await attachScreenshot(page, testInfo, 'app');
    });
});
