'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { guardReadOnly } = require('./session');

const SCREENSHOT_DIR = 'visual-screenshots';
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};

test.describe('calendar rhythm markers', () => {
    test('calendar rhythm markers', async ({ page }, testInfo) => {
        const label = testInfo.project.name === 'iphone' ? 'phone' : 'desktop';
        await page.setViewportSize(VIEWPORTS[label]);
        await guardReadOnly(page);
        await page.goto('/calendar');
        await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Plan' }).click();
        await page.locator(label === 'phone' ? '.phone-day .day-grid' : '.day-grid').first().waitFor();

        const wake = page.locator('.rhythm-marker', { hasText: 'Wake' }).first();
        await wake.waitFor();
        await wake.scrollIntoViewIfNeeded();
        await expect(wake).toBeVisible();

        await expect(page.locator('.rhythm-marker', { hasText: 'Journal' })).toHaveCount(0);
        await expect(page.locator('.rhythm-marker', { hasText: 'Green gate hidden' })).toHaveCount(0);

        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `calendar-rhythm-${label}.png`), fullPage: true });
    });
});
