'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { guardReadOnly } = require('./session');

const SCREENSHOT_DIR = 'visual-screenshots';
const RHYTHM_ZONE = 'America/Los_Angeles';
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};

const shot = async (page, name) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
};

// Today's short weekday in the rhythm zone, matching the grid's day pills.
const todayLabel = () =>
    new Intl.DateTimeFormat('en-US', { timeZone: RHYTHM_ZONE, weekday: 'short' }).format(new Date());

test.describe('rhythm', () => {
    test('rhythm states', async ({ page }, testInfo) => {
        const isPhone = testInfo.project.name === 'iphone';
        const label = isPhone ? 'phone' : 'desktop';
        await page.setViewportSize(VIEWPORTS[label]);
        await guardReadOnly(page);
        await page.goto('/rhythm');
        await page.locator('.rhythm-grid').waitFor();

        if (isPhone) {
            await page.getByRole('group', { name: 'Day' }).getByRole('button', { name: todayLabel(), exact: true }).click();
        }

        await expect(page.getByRole('button', { name: /^Gate Plan the week, open/ }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /^Gate Held review, held/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Gate Green gate hidden/ })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Journal at 21:00, off/ }).first()).toBeVisible();
        await shot(page, `rhythm-${label}-week`);

        if (!isPhone) {
            await page.getByRole('button', { name: /^Wake at 06:30/ }).first().click();
            const editor = page.getByRole('complementary', { name: 'Edit Wake' });
            await expect(editor.getByRole('button', { name: 'Save' })).toBeVisible();
            await expect(editor.getByRole('button', { name: 'Cancel' })).toBeVisible();
            await shot(page, 'rhythm-desktop-editor');
            await editor.getByRole('button', { name: 'Cancel' }).click();
        }

        // The open gate has the hub link; a click on its top edge avoids the anchors and the held gate drawn over it.
        await page.getByRole('button', { name: /^Gate Plan the week, open/ }).first().click({ position: { x: 4, y: 2 } });
        const card = page.getByRole('complementary', { name: 'Gate Plan the week' });
        await expect(card).toBeVisible();
        await expect(card.getByRole('link', { name: 'Open in Hub' })).toBeVisible();
        await shot(page, `rhythm-${label}-gate`);

        if (isPhone) await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    });
});
