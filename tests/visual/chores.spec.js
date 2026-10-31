'use strict';

const { test, expect } = require('@playwright/test');
const { guardReadOnly } = require('./session');

const openChores = async (page) => {
    await guardReadOnly(page);
    await page.goto('/chores');
    await page.getByRole('heading', { name: 'Chores', level: 1 }).waitFor();
};

test.describe('chores page', () => {
    const timelineRow = (page, name) => page.locator('.chore-timeline-row', { hasText: name });
    const cardTitles = (page) => page.locator('.chore-grid > li .chore-title > span:first-child');

    test('chores timeline shows rows for the done chores, NOW and the never-done count', async ({ page }) => {
        await openChores(page);
        for (const name of ['Clean bathrooms', 'Vacuum floors', 'Change bedding']) {
            await expect(timelineRow(page, name)).toBeVisible();
        }
        await expect(page.locator('.chore-timeline-row')).toHaveCount(3);
        await expect(page.locator('.chore-timeline-now')).toHaveText('NOW');
        await expect(page.locator('.chore-timeline-never')).toHaveText('1 never done');
    });

    test('chores timeline gives only the late row a tail', async ({ page }) => {
        await openChores(page);
        await expect(timelineRow(page, 'Clean bathrooms').locator('.chore-timeline-tail')).toHaveCount(1);
        await expect(timelineRow(page, 'Vacuum floors').locator('.chore-timeline-tail')).toHaveCount(0);
    });

    test('chores filters narrow the grid to the matching chores', async ({ page }) => {
        await openChores(page);
        await page.getByRole('button', { name: 'Overdue', exact: true }).click();
        await expect(cardTitles(page)).toHaveText(['Clean bathrooms']);
        await page.getByRole('button', { name: 'Due within 3 days' }).click();
        await expect(cardTitles(page)).toHaveText(['Vacuum floors']);
    });

    test('chores grid puts two cards on a row on the phone', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'iphone', 'Card columns are only checked on the phone');
        await openChores(page);
        const boxes = await page.locator('.chore-grid > li').evaluateAll((cards) =>
            cards.map((card) => {
                const { top, left } = card.getBoundingClientRect();
                return { top: Math.round(top), left: Math.round(left) };
            })
        );
        expect(boxes.length).toBeGreaterThan(1);
        expect(boxes[1].top).toBe(boxes[0].top);
        expect(boxes[1].left).toBeGreaterThan(boxes[0].left);
    });

    test('chores timeline row tap highlights its card', async ({ page }, testInfo) => {
        await openChores(page);
        await timelineRow(page, 'Vacuum floors').click();
        await expect(page.locator('.chore-row--highlight')).toHaveCount(1);
        await expect(page.locator('.chore-row--highlight .chore-title > span:first-child')).toHaveText('Vacuum floors');
        await testInfo.attach('chores-page', {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
        });
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
