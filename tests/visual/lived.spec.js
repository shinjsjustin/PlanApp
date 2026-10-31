'use strict';

const { test, expect } = require('@playwright/test');
const { guardReadOnly } = require('./session');

const WEEK_DAYS = 7;
const SNAP_PX = 1;

const openLived = async (page, testInfo) => {
    await guardReadOnly(page);
    await page.goto('/calendar');
    if (testInfo.project.name !== 'iphone') {
        await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Lived', exact: true }).click();
    }
    await page.locator('.lived-day').waitFor();
};

const block = (page, title) => page.getByRole('button', { name: new RegExp(`^${title},`) });

const boxOf = (locator) =>
    locator.evaluate((el) => {
        const { top, bottom, height } = el.getBoundingClientRect();
        return { top, bottom, height };
    });

test.describe('lived day', () => {
    test('lived overlapping block starts at the previous block bottom', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        const previous = await boxOf(block(page, 'Deep work block'));
        const clipped = await boxOf(block(page, 'Family call overlapping'));
        expect(Math.abs(clipped.top - previous.bottom)).toBeLessThanOrEqual(SNAP_PX);
    });

    test('lived fully covered moment keeps a clickable sliver', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        const sliver = block(page, 'Covered quick fix');
        expect((await boxOf(sliver)).height).toBeGreaterThan(0);
        await sliver.click();
        await expect(page.getByRole('dialog', { name: 'Covered quick fix' })).toBeVisible();
    });

    test('lived ten minute block shows no text', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        const tiny = block(page, 'Ten minute stretch');
        await expect(tiny).toBeVisible();
        expect(await tiny.evaluate((el) => el.textContent)).toBe('');
    });

    test('lived tapping a block opens the sheet with its full detail', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        await block(page, 'Evening reading').click();
        const sheet = page.getByRole('dialog', { name: 'Evening reading' });
        await expect(sheet).toBeVisible();
        await expect(sheet).toContainText('Finished chapter three.');
        await expect(sheet).toContainText('Second line: notes for the weekend.');
    });

    test('lived drive and chat ticks are drawn', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        await expect(page.locator('.lived-drive')).toHaveCount(1);
        await expect(page.locator('.lived-tick')).toHaveCount(2);
    });

    test('lived week strip has seven rows', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        await expect(page.locator('.lived-shape-row')).toHaveCount(WEEK_DAYS);
    });

    test('lived next day reaches an empty day', async ({ page }, testInfo) => {
        await openLived(page, testInfo);
        await page.getByRole('button', { name: 'Next day' }).click();
        await expect(page.getByText('Nothing lived here yet')).toBeVisible();
    });
});
