'use strict';

const { test, expect } = require('@playwright/test');

const { deleteUserByEmail } = require('./database');
const { attachDiagnostics, newCredentials, seedPlan } = require('./helpers');

// The gestures that would otherwise need a pointer, done with keys only (spec
// section 4.7).
//
// Not a second pass over the critical flow: the graph here is seeded through the
// API, and only the gestures are performed. The composer and the fold toggle are
// a form and a button, and would be hard to get wrong — but the rest is a drag,
// and a drag is exactly the interaction that ends up mouse-only without anyone
// noticing. `@dnd-kit`'s keyboard sensor steps between droppables by comparing
// their measured rectangles, so whether it can carry a to-do out of the panel
// and into a card is a question only a real browser can answer.
//
// Nothing below dispatches a pointer event.

/** How long to leave the keyboard sensor alone between steps of a drag. */
const KEY_STEP_SETTLE_MS = 250;

const PLAN = {
    project: 'Keyboard plan',
    todo: 'Type me in',
    secondTodo: 'And then this one',
};

/**
 * One keystroke, then a beat.
 *
 * A step of a keyboard drag can scroll its target into view, and the sensor
 * re-measures once that settles. A person pressing keys leaves far longer gaps
 * than this; Playwright, left alone, leaves none.
 */
const press = async (page, key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(KEY_STEP_SETTLE_MS);
};

const credentials = newCredentials();

test.beforeEach(({ page }) => {
    attachDiagnostics(page);
});

test.afterAll(async () => {
    await deleteUserByEmail(credentials.email);
});

test('the composer, the fold toggle and the drags all work without a mouse', async ({ page }) => {
    const { projectId, parent, child } = await seedPlan(page, credentials, PLAN.project);

    await page.goto(`/projects/${projectId}`);

    await test.step('the composer files a to-do on Enter alone', async () => {
        const composer = page.getByLabel('New unorganized to-do');

        await composer.focus();
        await page.keyboard.type(PLAN.todo);
        await page.keyboard.press('Enter');

        await expect(page.getByRole('list', { name: 'Unorganized to-dos' })).toContainText(
            PLAN.todo
        );
        // Still focused, so the next one can be typed straight away.
        await expect(composer).toBeFocused();
    });

    await test.step('cards fold and unfold from the keyboard', async () => {
        // Both, because a card only offers its drop target while it is open —
        // and the drag below is only a real choice if there are two to choose
        // between. Cards render open, so this closes each one and opens it
        // again: the round trip proves the toggle works from the keyboard and
        // leaves both cards open for the drag that follows.
        for (const sequence of [parent, child]) {
            const collapser = page.getByRole('button', { name: `Collapse ${sequence.title}` });

            await collapser.focus();
            await page.keyboard.press('Enter');

            const expander = page.getByRole('button', { name: `Expand ${sequence.title}` });

            await expect(expander).toBeVisible();

            await expander.focus();
            await page.keyboard.press('Enter');
            await expect(
                page.getByRole('button', { name: `Collapse ${sequence.title}` })
            ).toBeVisible();
        }
    });

    /**
     * Which card a bare lift-and-drop lands on is decided by `closestCenter`,
     * so it is a fact about where the cards happen to sit rather than about the
     * keyboard — widening the cards was enough to move it from one to the other.
     * What is worth asserting is that the gesture works at all and puts the
     * to-do in a sequence, so the card it chose is read back rather than
     * assumed, and the reorder below runs in whichever one that was.
     */
    let filedTitle;

    await test.step('the keyboard sensor lifts a to-do out of the panel', async () => {
        const handle = page.getByRole('button', { name: `Drag “${PLAN.todo}”` });
        const parentCard = page.locator(`li[data-sequence-title="${parent.title}"]`);

        await handle.focus();
        await press(page, 'Space');

        // Mid-air: the cards say whether they would take it, which is something
        // only a drag in progress puts on them. Without the lift there is no
        // `data-drop` at all, so this cannot pass on a to-do sitting still.
        await expect(parentCard).toHaveAttribute('data-drop', 'eligible');

        await press(page, 'Space');

        await expect(page.getByRole('button', { name: 'Unorganized (0)' })).toBeVisible();

        // It is its sequence's only outstanding to-do, so it lands as the next
        // step and is drawn in the spotlight band rather than in the list.
        const landedIn = page.locator('li.sequence-card', {
            has: page.locator('.sequence-spotlight-text', { hasText: PLAN.todo }),
        });

        await expect(landedIn).toHaveCount(1);

        // Pinned to a title now rather than kept as "the card holding this
        // to-do": the reorder below moves that to-do out of the band, and a
        // locator defined by where it is would stop matching the moment it did.
        filedTitle = await landedIn.getAttribute('data-sequence-title');
    });

    await test.step('the arrows reorder a sequence, measured for real', async () => {
        // A second to-do, typed in through the card's own add row. The row is a
        // placeholder until it is clicked, and a field in the same place after.
        const card = page.locator(`li[data-sequence-title="${filedTitle}"]`);

        await card.getByText(`New to-do in ${filedTitle}`).click();
        await page.keyboard.type(PLAN.secondTodo);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');

        // The card draws its outstanding to-dos in two places since the
        // redesign: the next step in the spotlight band, the rest under THEN.
        // The order on screen runs through both, so this reads both.
        const outstanding = card.locator('.sequence-spotlight-text, .todo-item-text');

        await expect(outstanding).toHaveCount(2);
        await expect(outstanding.first()).toContainText(PLAN.todo);

        // Lift the first, step down past the second, put it down. This is the
        // step jsdom cannot judge: the sensor picks its target by comparing
        // measured rectangles, and in jsdom every one of them is zero. It is
        // also the step that proves the band is draggable like any other row.
        await page.getByRole('button', { name: `Drag “${PLAN.todo}”` }).focus();
        for (const key of ['Space', 'ArrowDown', 'Space']) {
            await press(page, key);
        }

        await expect(outstanding.first()).toContainText(PLAN.secondTodo);
        await expect(outstanding.last()).toContainText(PLAN.todo);
    });
});
