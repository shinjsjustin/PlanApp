'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');
const { apiUrl, guardReadOnly, savedToken } = require('./session');

const PROTOTYPE_URL = pathToFileURL(
    path.join(__dirname, '..', '..', 'docs', 'reference', 'combinations-prototype.html')
).href;
const STATES = ['empty', 'drafted', 'done', 'struck'];
const NARROW_WIDTH = 860;

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
    test('chord stroke colour matches per state and the struck chord is dashed', async ({ page, request, browser }) => {
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
        await proto.context().close();
    });

    test('view and side panels sit side by side when wide and stacked when narrow', async ({ page, request, browser }) => {
        await openApp(page, request);
        const proto = await openPrototype(browser, page.viewportSize());
        const isWide = page.viewportSize().width > NARROW_WIDTH;

        for (const target of [page, proto]) {
            const view = await rectOf(target, '.view-panel');
            const side = await rectOf(target, '.side');
            if (isWide) expect(side.left).toBeGreaterThanOrEqual(view.right);
            else expect(side.top).toBeGreaterThanOrEqual(view.bottom);
        }
        await proto.context().close();
    });
});

test.describe('combinations page on the phone', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== 'iphone', 'These checks are for the phone width');
    });

    const hasNoHorizontalOverflow = (page) =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    test('ring svg fits the viewport and the page does not scroll sideways', async ({ page, request }) => {
        await openApp(page, request);
        await page.locator('.ring').waitFor();
        const ring = await rectOf(page, '.ring');
        const width = page.viewportSize().width;
        expect(ring.left).toBeGreaterThanOrEqual(0);
        expect(ring.right).toBeLessThanOrEqual(width);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
    });

    test('grid scrolls inside grid-wrap and the page does not scroll sideways', async ({ page, request }) => {
        await openApp(page, request, '?view=grid');
        await page.locator('.grid-wrap').waitFor();
        const wrap = await page.locator('.grid-wrap').evaluate((el) => ({
            overflowX: getComputedStyle(el).overflowX,
            scrolls: el.scrollWidth > el.clientWidth,
        }));
        expect(['auto', 'scroll']).toContain(wrap.overflowX);
        expect(wrap.scrolls).toBe(true);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
    });
});
