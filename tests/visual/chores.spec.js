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
        await expect(page.locator('.chore-timeline-now-tag')).toHaveText('NOW');
        await expect(page.locator('.chore-timeline-never')).toHaveText('1 never done');
    });

    test('chores timeline gives only the late row a tail', async ({ page }) => {
        await openChores(page);
        await expect(timelineRow(page, 'Clean bathrooms').locator('.chore-timeline-tail')).toHaveCount(1);
        await expect(timelineRow(page, 'Vacuum floors').locator('.chore-timeline-tail')).toHaveCount(0);
    });

    test('chores filters narrow the grid to the matching chores', async ({ page }) => {
        await openChores(page);
        await page.getByRole('button', { name: 'Overdue 1', exact: true }).click();
        await expect(cardTitles(page)).toHaveText(['Clean bathrooms']);
        await page.getByRole('button', { name: 'Due within 3 days 1', exact: true }).click();
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
    });

    test('chores page attaches a full-page screenshot', async ({ page }, testInfo) => {
        await openChores(page);
        await testInfo.attach('chores-page', {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
        });
    });
});

test.describe('chores layout', () => {
    const boxesOf = (page, selector) =>
        page.locator(selector).evaluateAll((els) =>
            els.map((el) => {
                const { top, bottom, left, right } = el.getBoundingClientRect();
                return { top, bottom, left, right };
            })
        );

    test('chores timeline rows are 28-36px tall and do not overlap', async ({ page }) => {
        await openChores(page);
        const rows = (await boxesOf(page, '.chore-timeline-row')).sort((a, b) => a.top - b.top);
        expect(rows).toHaveLength(3);
        for (const row of rows) {
            expect(row.bottom - row.top).toBeGreaterThanOrEqual(28);
            expect(row.bottom - row.top).toBeLessThanOrEqual(36);
        }
        for (let i = 1; i < rows.length; i += 1) {
            expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].bottom - 0.5);
        }
    });

    test('chores timeline bars sit inside their row and right of the label at scrollLeft 0', async ({ page }) => {
        await openChores(page);
        await page.locator('.chore-timeline-scroll').evaluate((el) => { el.scrollLeft = 0; });
        const rows = await page.locator('.chore-timeline-row').evaluateAll((els) =>
            els.map((row) => {
                const box = (el) => {
                    const { top, bottom, left, right } = el.getBoundingClientRect();
                    return { top, bottom, left, right };
                };
                return {
                    row: box(row),
                    label: box(row.querySelector('.chore-timeline-label')),
                    bar: box(row.querySelector('.chore-timeline-bar')),
                };
            })
        );
        expect(rows).toHaveLength(3);
        for (const { row, label, bar } of rows) {
            expect(bar.top).toBeGreaterThanOrEqual(row.top - 0.5);
            expect(bar.bottom).toBeLessThanOrEqual(row.bottom + 0.5);
            expect(bar.left).toBeGreaterThanOrEqual(row.left - 0.5);
            expect(bar.right).toBeLessThanOrEqual(row.right + 0.5);
            expect(bar.left).toBeGreaterThanOrEqual(label.right - 0.5);
        }
    });

    test('chores week labels line up with week lines and clear the NOW tag', async ({ page }) => {
        await openChores(page);
        const lines = await boxesOf(page, '.chore-timeline-day--week');
        const labels = await boxesOf(page, '.chore-timeline-week');
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
            const gap = Math.min(...lines.map((line) => Math.abs(line.left - label.left)));
            expect(gap).toBeLessThanOrEqual(1);
        }
        const [tag] = await boxesOf(page, '.chore-timeline-now-tag');
        for (const label of labels) {
            const isApart = tag.right <= label.left || label.right <= tag.left;
            expect(isApart).toBe(true);
        }
    });

    test('chores NOW tag is inside the scroller on load', async ({ page }) => {
        await openChores(page);
        const [scroller] = await boxesOf(page, '.chore-timeline-scroll');
        const [tag] = await boxesOf(page, '.chore-timeline-now-tag');
        expect(tag.left).toBeGreaterThanOrEqual(scroller.left);
        expect(tag.right).toBeLessThanOrEqual(scroller.right);
    });

    test('chores surfaces have dark backgrounds', async ({ page }) => {
        await openChores(page);
        const surfaces = {
            timeline: '.chore-timeline',
            card: '.chore-grid > li',
            pill: '.chores-filter button',
            archived: '.chores-archived',
        };
        for (const [name, selector] of Object.entries(surfaces)) {
            const colors = await page.locator(selector).evaluateAll((els) =>
                els.map((el) => {
                    let node = el;
                    while (node) {
                        const color = getComputedStyle(node).backgroundColor;
                        const [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number);
                        if (a > 0) return { color, r, g, b };
                        node = node.parentElement;
                    }
                    return { color: 'transparent', r: 255, g: 255, b: 255 };
                })
            );
            expect(colors.length, name).toBeGreaterThan(0);
            for (const { color, r, g, b } of colors) {
                const channel = (v) => {
                    const c = v / 255;
                    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                };
                const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
                expect(color, name).not.toBe('rgb(255, 255, 255)');
                expect(luminance, `${name} ${color}`).toBeLessThanOrEqual(0.2);
            }
        }
    });

    test('chores pills carry counts and the done card reads Done date and name', async ({ page }) => {
        await openChores(page);
        await expect(page.getByRole('button', { name: 'Overdue 1', exact: true })).toBeVisible();
        const card = page.locator('.chore-grid > li', { hasText: 'Change bedding' });
        await expect(card).toContainText(/Done \d{1,2} \w{3} · Justin/);
        const detail = card.locator('.chore-details li', { hasText: /^Done / });
        await expect(detail).toHaveText(/^Done \d{1,2} \w{3} · Justin$/);
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
