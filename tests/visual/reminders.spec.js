'use strict';

const { test, expect } = require('@playwright/test');
const { guardReadOnly, listProjects, savedToken } = require('./session');

const colourOf = (locator) => locator.evaluate((el) => getComputedStyle(el).color);

const openReminders = async (page) => {
    await guardReadOnly(page);
    await page.goto('/reminders');
    await page.getByRole('heading', { name: 'Reminders', level: 1 }).waitFor();
    await page.locator('.reminder-row').first().waitFor();
};

test.describe('reminders page', () => {
    test('reminders Place and Sort labels match the heading colour', async ({ page }) => {
        await openReminders(page);
        const heading = await colourOf(page.locator('h1'));
        for (const name of ['Place', 'Sort']) {
            expect(await colourOf(page.locator('.reminders-controls label').filter({ hasText: new RegExp(`^${name}`) }))).toBe(heading);
        }
    });

    test('reminders open cards have no Delete button', async ({ page }) => {
        await openReminders(page);
        await expect(page.locator('.reminder-row').getByRole('button', { name: 'Edit' }).first()).toBeVisible();
        await expect(page.locator('.reminder-row').getByRole('button', { name: 'Delete' })).toHaveCount(0);
    });

    test('reminders edit form offers Delete', async ({ page }) => {
        await openReminders(page);
        await page.getByRole('button', { name: 'Edit' }).first().click();
        await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete' })).toBeVisible();
    });

    test('reminders are grouped under date headings', async ({ page }) => {
        await openReminders(page);
        // Today turns Overdue after 3pm, so it has no heading of its own to rely on.
        for (const name of ['Overdue', 'Upcoming', 'No date']) {
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

    test('tab bar fits on the reminders page', async ({ page }) => {
        await guardReadOnly(page);
        await page.goto('/reminders');
        await expectBarFits(page);
    });

    test('tab bar fits on a project page', async ({ page, request }) => {
        await guardReadOnly(page);
        const [id] = await listProjects(request, savedToken());
        await page.goto(`/projects/${id}`);
        await expectBarFits(page);
    });
});
