'use strict';

const { test, expect } = require('@playwright/test');

const { deleteUserByEmail } = require('./database');
const { addTodo, attachDiagnostics, dataOf, newCredentials, seedPlan } = require('./helpers');

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

/** A bounded real Tab walk: never programmatically focus the destination. */
const MAX_TAB_STOPS = 80;
const tabTo = async (page, target) => {
    for (let step = 0; step < MAX_TAB_STOPS; step += 1) {
        await page.keyboard.press('Tab');
        // Covered row controls must never enter the browser's focus order.
        await expect(page.locator('.is-pin-selectable .todo-item-content :focus')).toHaveCount(0);
        if (await target.evaluate((element) => element === document.activeElement)) return;
    }
    await expect(target, 'Target must be reachable with Tab alone').toBeFocused();
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
    await page.getByRole('button', { name: 'Unorganized (0)', exact: true }).click();

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

        // The filed to-do lands in the sequence's outstanding list.
        const landedIn = page.locator('li.sequence-card', {
            has: page.locator('.todo-item-text', { hasText: PLAN.todo }),
        });

        await expect(landedIn).toHaveCount(1);

        // Keep the destination title for the reorder assertions below.
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

        // Outstanding to-dos share one ordered list.
        const outstanding = card.locator('.todo-item-text');

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

const seedKeyboardPins = async (page, pinCredentials) => {
    const { projectId, headers, parent } = await seedPlan(page, pinCredentials, 'Keyboard pins');
    const first = await addTodo(page, headers, projectId, 'Keyboard first pin', parent.id);
    const second = await addTodo(page, headers, projectId, 'Keyboard second pin', parent.id);
    const readGraph = async () => dataOf(
        await page.request.get(`/api/projects/${projectId}`, { headers })
    );
    const initial = await readGraph();
    const card = page.locator(`li[data-sequence-title="${parent.title}"]`);
    const firstRow = card.locator('.todo-item').filter({ hasText: first.text });
    const secondRow = card.locator('.todo-item').filter({ hasText: second.text });
    const button = (name) => page.getByRole('button', { name, exact: true });
    const overlay = (operation, todo) => button(`${operation} “${todo.text}”`);
    let mutations = [];
    page.on('request', (request) => {
        if (request.url().includes('/api/') && request.method() !== 'GET') {
            mutations = [...mutations, { method: request.method(), url: request.url() }];
        }
    });
    await page.goto(`/projects/${projectId}`);
    await expect(firstRow).toBeVisible();
    return {
        projectId, parent, first, second, readGraph, initial, card,
        firstRow, secondRow, button, overlay, readMutations: () => mutations,
    };
};

const selectPinsWithKeyboard = async (page, {
    button, overlay, first, second, firstRow, secondRow, card, parent,
}) => {
    await tabTo(page, button('Pin'));
    await page.keyboard.press('Enter');
    await expect(button('Confirm')).toBeDisabled();
    await expect(firstRow.locator('.todo-item-content')).toHaveAttribute('inert', '');
    await expect(secondRow.locator('.todo-item-content')).toHaveAttribute('inert', '');
    await tabTo(page, overlay('Pin', first));
    await expect(overlay('Pin', first)).toBeFocused();
    await expect(overlay('Pin', first)).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(overlay('Pin', first)).toHaveAttribute('aria-pressed', 'true');
    await expect(button('Confirm')).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect(overlay('Pin', first)).toHaveAttribute('aria-pressed', 'false');
    await expect(button('Confirm')).toBeDisabled();
    await page.keyboard.press('Enter');
    await expect(overlay('Pin', first)).toHaveAttribute('aria-pressed', 'true');
    // Adjacent rows contribute exactly one Tab stop each, not their underlying buttons.
    await page.keyboard.press('Tab');
    await expect(overlay('Pin', second)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(overlay('Pin', second)).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('.todo-item-menu')).toHaveCount(0);
    await expect(card).not.toHaveAttribute('data-drop', /.+/);
    await expect(button(`Collapse ${parent.title}`)).toBeVisible();
};

const cancelPinsWithKeyboard = async (page, { button, readGraph, initial, readMutations, card }) => {
    await tabTo(page, button('Cancel'));
    await page.keyboard.press('Space');
    await expect(button('Pin')).toBeVisible();
    await expect(page.locator('.pin-select-control')).toHaveCount(0);
    expect(await readGraph()).toEqual(initial);
    expect(readMutations()).toEqual([]);
    await expect(card.locator('.todo-pin-icon')).toHaveCount(0);
};

/** Confirm via a real keypress and verify the exact bulk-write request. */
const confirmPinsWithKeyboard = async (page, { projectId, button }, { key, todoIds, isPinned }) => {
    await tabTo(page, button('Confirm'));
    const saved = page.waitForResponse((response) =>
        response.url().endsWith(`/api/projects/${projectId}/todos/pins`) &&
        response.request().method() === 'PUT');
    await page.keyboard.press(key);
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toEqual({ todoIds, isPinned });
    return response;
};

const persistPinWithKeyboard = async (page, fixture) => {
    const { button, overlay, first, second, readGraph, initial, firstRow, secondRow } = fixture;
    await tabTo(page, button('Pin'));
    await page.keyboard.press('Space');
    await tabTo(page, overlay('Pin', first));
    await expect(overlay('Pin', first)).toHaveAttribute('aria-pressed', 'false');
    await expect(overlay('Pin', second)).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(overlay('Pin', first)).toHaveAttribute('aria-pressed', 'true');
    await confirmPinsWithKeyboard(page, fixture, { key: 'Enter', todoIds: [first.id], isPinned: true });
    await expect(button('Pin')).toBeVisible();
    const persisted = await readGraph();
    expect(persisted.todos).toEqual(initial.todos.map((todo) =>
        todo.id === first.id
            ? { ...todo, isPinned: true, updatedAt: expect.any(String) }
            : todo));
    await expect(firstRow.locator('.todo-pin-icon')).toHaveCount(1);
    await expect(secondRow.locator('.todo-pin-icon')).toHaveCount(0);
};

const persistUnpinWithKeyboard = async (page, fixture) => {
    const { button, overlay, first, second, firstRow, readGraph, initial, card, readMutations } = fixture;
    await tabTo(page, button('Unpin'));
    await page.keyboard.press('Enter');
    await expect(button('Confirm')).toBeDisabled();
    await expect(overlay('Unpin', second)).toHaveCount(0);
    await expect(firstRow.locator('.todo-item-content')).toHaveAttribute('inert', '');
    await tabTo(page, overlay('Unpin', first));
    await expect(overlay('Unpin', first)).toBeFocused();
    await expect(overlay('Unpin', first)).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(overlay('Unpin', first)).toHaveAttribute('aria-pressed', 'true');
    const response = await confirmPinsWithKeyboard(page, fixture, {
        key: 'Space', todoIds: [first.id], isPinned: false,
    });
    await expect(button('Unpin')).toBeVisible();
    // A real pin write advances updatedAt; all other row fields must survive unchanged.
    expect((await readGraph()).todos).toEqual(initial.todos.map((todo) =>
        todo.id === first.id ? { ...todo, updatedAt: expect.any(String) } : todo));
    await expect(card.locator('.todo-pin-icon')).toHaveCount(0);
    expect(readMutations()).toEqual([
        { method: 'PUT', url: response.url() },
        { method: 'PUT', url: response.url() },
    ]);
};

test.describe('keyboard-only pin selection', () => {
    const pinCredentials = newCredentials();

    test.afterAll(async () => {
        await deleteUserByEmail(pinCredentials.email);
    });

    test('Tab reaches overlays, selection cancels unchanged, and confirmation persists Pin and Unpin', async ({ page }) => {
        const fixture = await seedKeyboardPins(page, pinCredentials);
        await test.step('Tab skips covered drag, completion, menu and delete controls', () =>
            selectPinsWithKeyboard(page, fixture));
        await test.step('keyboard cancellation discards the draft without a write', () =>
            cancelPinsWithKeyboard(page, fixture));
        await test.step('keyboard confirmation persists only the selected pin', () =>
            persistPinWithKeyboard(page, fixture));
        await test.step('keyboard Unpin reaches the overlay and removes the persisted pin', () =>
            persistUnpinWithKeyboard(page, fixture));
    });
});
