'use strict';

const { test, expect } = require('@playwright/test');
const { guardReadOnly } = require('./session');

const openChores = async (page) => {
    await guardReadOnly(page);
    await page.goto('/chores');
    await page.getByRole('heading', { name: 'Chores', level: 1 }).waitFor();
};

test.describe('chores page', () => {
    test('chores are grouped under status headings', async ({ page }) => {
        await openChores(page);
        for (const name of ['Overdue', 'Due now', 'Coming up', 'Never done', 'Archived']) {
            await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
        }
    });
});

test.describe('tab bar', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== 'iphone', 'The tab bar only shows on the phone');
    });

    const expectBarFits = async (page) => {
        await page.locator('.tab-bar').waitFor();
        const result = await page.evaluate(() => {
            const width = document.documentElement.clientWidth;
            const nav = document.querySelector('.tab-bar');
            const bad = [...nav.querySelectorAll('.tab-bar-link, .tab-bar-back')].flatMap((el) => {
                const { left, right } = el.getBoundingClientRect();
                const problems = [];
                if (el.scrollWidth > el.clientWidth) problems.push('text clipped');
                if (left < 0 || right > width) problems.push('outside viewport');
                return problems.map((problem) => `${el.textContent}: ${problem}`);
            });
            return { bad, navOverflow: nav.scrollWidth > nav.clientWidth };
        });
        expect(result.bad).toEqual([]);
        expect(result.navOverflow).toBe(false);
    };

    test('tab bar fits on the chores page', async ({ page }) => {
        await openChores(page);
        await expectBarFits(page);
    });
});
