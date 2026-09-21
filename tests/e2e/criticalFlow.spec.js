'use strict';

const { test, expect } = require('@playwright/test');
const { deleteUserByEmail } = require('./database');
const {
    attachDiagnostics, addTodo, dataOf, dragOnto, newCredentials, openProject,
    poolGrip, seedPlan, seedCrowdedPlan, seedLayeredPlan,
} = require('./helpers');

const credentials = newCredentials();
const onboardingCredentials = newCredentials();
const PROJECT = 'Pinned work';
const ONBOARDING_PROJECT = 'Card navigation';
const ONBOARDING_LAYER = 'Planning';
const ONBOARDING_SECOND_LAYER = 'Execution';
const ONBOARDING_SEQUENCE = 'First sequence';
const DESCRIPTION = 'Build a reliable aircraft.\nKeep the design reviewable.';
const SEQUENCE_DESCRIPTION = 'Understand lift.\nThen test the assumptions.';
const sequenceCard = (page, title) => page.locator('li[data-sequence-title]').filter({
    has: page.getByLabel(`Sequence title: ${title}`, { exact: true }),
});
const poolRow = (page, text) => page.locator('.panel-todo-row').filter({ hasText: text });
const booking = (page, text) => page.locator('.day-item-card').filter({ hasText: text });

// Wait for persistence, not just an optimistic paint, before navigating away.
const savedResponse = (page, method, path) => page.waitForResponse((response) =>
    response.request().method() === method && new URL(response.url()).pathname === path
);
const savedResponseMatching = (page, method, pathPattern) => page.waitForResponse((response) =>
    response.request().method() === method && pathPattern.test(new URL(response.url()).pathname)
);
const assertSaved = async (response) => expect((await response).ok()).toBe(true);

const expectCrossedOut = async (locator) =>
    expect(locator).toHaveCSS('text-decoration-line', 'line-through');

const expectBlockedBorder = async (locator) => {
    const danger = await locator.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-danger)';
        node.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    });
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        await expect(locator).toHaveCSS(`border-${edge}-color`, danger);
        await expect(locator).toHaveCSS(`border-${edge}-style`, 'solid');
        await expect(locator).not.toHaveCSS(`border-${edge}-width`, '0px');
    }
};

const seedCriticalPlan = async (page) => {
    const plan = await seedPlan(page, credentials, PROJECT);
    const { headers, projectId, parent, child } = plan;
    await dataOf(await page.request.patch(`/api/sequences/${parent.id}`, {
        headers, data: { description: SEQUENCE_DESCRIPTION },
    }));
    // An earlier unpinned row proves top-pin means first PIN, not first row.
    await addTodo(page, headers, projectId, 'Not selected', parent.id);
    const filed = await addTodo(page, headers, projectId, 'Review lift', parent.id);
    const completed = await addTodo(page, headers, projectId, 'Read handbook', parent.id);
    const blocked = await addTodo(page, headers, projectId, 'Await motor', child.id);
    const loose = await addTodo(page, headers, projectId, 'Collect ideas');
    await dataOf(await page.request.patch(`/api/todos/${completed.id}`, {
        headers, data: { status: 'complete' },
    }));
    await dataOf(await page.request.patch(`/api/todos/${blocked.id}`, {
        headers, data: { status: 'blocked' },
    }));
    return { ...plan, filed, completed, blocked, loose };
};

const openPool = async (page) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: new RegExp(PROJECT) }).click();
};

const schedule = async (page, text, day) => {
    const saved = savedResponse(page, 'PUT', '/api/calendar/items');
    await dragOnto(page, poolGrip(page, text), day);
    await assertSaved(saved);
    await expect(booking(page, text)).toBeVisible();
    await expect(poolRow(page, text).locator('.panel-todo-badge')).toHaveText('Day 1');
};

test.beforeEach(({ page }) => attachDiagnostics(page));
test.afterAll(() => Promise.all([
    credentials.email,
    onboardingCredentials.email,
].map(deleteUserByEmail)));

test('registers, creates a project, and opens it through the full card hit area', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('Full Name').fill(onboardingCredentials.name);
    await page.getByPlaceholder('Email').fill(onboardingCredentials.email);
    await page.getByPlaceholder('Password (min 8 characters)').fill(onboardingCredentials.password);
    await page.getByPlaceholder('Confirm Password').fill(onboardingCredentials.password);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/post-register$/);

    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(onboardingCredentials.email);
    await page.getByPlaceholder('Password', { exact: true }).fill(onboardingCredentials.password);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText('No projects yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Create your first project' }).click();
    await page.getByLabel('Title').fill(ONBOARDING_PROJECT);
    await page.getByRole('button', { name: 'Create project' }).click();

    const card = page.locator('.project-card');
    await expect(card.getByRole('link', { name: ONBOARDING_PROJECT })).toBeVisible();
    await card.click({ position: { x: 8, y: 8 } });
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    await expect(page.getByRole('heading', { name: ONBOARDING_PROJECT })).toBeVisible();

    const layerTitle = page.getByLabel('Layer title: Untitled layer', { exact: true });
    await layerTitle.fill(ONBOARDING_LAYER);
    const initialLayerSaved = savedResponseMatching(page, 'PATCH', /^\/api\/layers\/\d+$/);
    await layerTitle.press('Enter');
    await assertSaved(initialLayerSaved);

    const projectId = Number(new URL(page.url()).pathname.split('/').pop());
    const layerCreated = savedResponse(page, 'POST', `/api/projects/${projectId}/layers`);
    await page.getByRole('button', { name: `Add a layer below ${ONBOARDING_LAYER}` }).click();
    await assertSaved(layerCreated);

    const secondLayerTitle = page.getByLabel('Layer title: Untitled layer', { exact: true });
    await secondLayerTitle.fill(ONBOARDING_SECOND_LAYER);
    const secondLayerSaved = savedResponseMatching(page, 'PATCH', /^\/api\/layers\/\d+$/);
    await secondLayerTitle.press('Enter');
    await assertSaved(secondLayerSaved);

    const sequenceCreated = savedResponseMatching(
        page,
        'POST',
        /^\/api\/layers\/\d+\/sequences$/
    );
    await page.getByRole(
        'button',
        { name: `Add a sequence to ${ONBOARDING_SECOND_LAYER}` }
    ).click();
    await assertSaved(sequenceCreated);

    const sequenceTitle = page.getByLabel('Sequence title: Untitled sequence', { exact: true });
    await sequenceTitle.fill(ONBOARDING_SEQUENCE);
    const sequenceSaved = savedResponseMatching(page, 'PATCH', /^\/api\/sequences\/\d+$/);
    await sequenceTitle.press('Enter');
    await assertSaved(sequenceSaved);

    await page.reload();
    await expect(page.getByLabel(`Layer title: ${ONBOARDING_LAYER}`, { exact: true })).toBeVisible();
    await expect(
        page.getByLabel(`Layer title: ${ONBOARDING_SECOND_LAYER}`, { exact: true })
    ).toBeVisible();
    await expect(
        page.getByLabel(`Sequence title: ${ONBOARDING_SEQUENCE}`, { exact: true })
    ).toBeVisible();
});

test('pins across locations and preserves bookings through completion and unpinning', async ({ page }) => {
    const plan = await seedCriticalPlan(page);
    const { projectId, parent, child, filed, completed, blocked, loose } = plan;
    const pins = [filed, completed, blocked, loose];

    await test.step('select all statuses and locations in one atomic Pin confirmation', async () => {
        await openProject(page, projectId);
        await page.getByRole('button', { name: 'Unorganized (1)', exact: true }).click();
        await page.getByRole('button', { name: 'Pin', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
        let requests = [];
        const track = (request) => {
            if (request.method() === 'PUT' && request.url().endsWith(`/projects/${projectId}/todos/pins`)) {
                requests = [...requests, request.postDataJSON()];
            }
        };
        page.on('request', track);
        for (const todo of pins) {
            const selection = page.getByRole('button', { name: `Pin “${todo.text}”`, exact: true });
            await selection.click();
            await expect(selection).toHaveAttribute('aria-pressed', 'true');
        }
        const saved = savedResponse(page, 'PUT', `/api/projects/${projectId}/todos/pins`);
        await page.getByRole('button', { name: 'Confirm', exact: true }).click();
        await assertSaved(saved);
        await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible();
        page.off('request', track);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ isPinned: true });
        expect(requests[0].todoIds).toHaveLength(pins.length);
        expect(requests[0].todoIds).toEqual(
            expect.arrayContaining(pins.map((todo) => todo.id))
        );
        await expect(page.locator('.todo-pin-icon')).toHaveCount(pins.length);
        await expect(page.locator('.sequence-card--active')).toHaveCount(2);
        await expect(sequenceCard(page, parent.title).locator('.todo-row--top-pinned')).toHaveText(new RegExp(filed.text));
        await expect(sequenceCard(page, child.title).locator('.todo-row--top-pinned')).toHaveText(new RegExp(blocked.text));
    });

    await test.step('Home and Calendar show exactly the selected pins', async () => {
        await page.getByRole('link', { name: '← All projects' }).click();
        await expect(page.locator('.pinned-todo')).toHaveText(pins.map((todo) => todo.text));
        await expect(page.locator('.project-card-pin-icon')).toHaveCount(pins.length);
        await expect(page.locator('.pinned-sequence')).toHaveText([parent.title, parent.title, child.title, 'Unorganized']);
        await expectCrossedOut(page.locator('.pinned-line--complete .pinned-todo'));
        await openPool(page);
        await expect(page.locator('.panel-todo-text')).toHaveText(pins.map((todo) => todo.text));
        await expect(page.locator('.panel-todo-row .calendar-pin-icon')).toHaveCount(pins.length);
        await expect(poolRow(page, completed.text).getByRole('button')).toHaveCount(0);
        await expectCrossedOut(poolRow(page, completed.text).locator('.panel-todo-text'));
        await expectBlockedBorder(poolRow(page, blocked.text));
    });

    await test.step('schedule incomplete and blocked pins, then complete without losing the booking', async () => {
        await page.getByRole('button', { name: 'Add the first day' }).click();
        await expect(page.getByRole('button', { name: 'Delete Day 1' })).toBeAttached();
        const day = page.getByRole('region', { name: 'Day 1', exact: true });
        await schedule(page, filed.text, day);
        await schedule(page, blocked.text, day);
        await expectBlockedBorder(booking(page, blocked.text));
        await expect(booking(page, blocked.text).locator('.calendar-pin-icon')).toHaveCount(1);
        const saved = savedResponse(page, 'PATCH', `/api/todos/${filed.id}`);
        await booking(page, filed.text).getByRole('button', { name: `Complete “${filed.text}”` }).click();
        await assertSaved(saved);
        await expectCrossedOut(booking(page, filed.text).locator('.day-item-name'));
        await expectCrossedOut(poolRow(page, filed.text).locator('.panel-todo-text'));
        await page.reload();
        await expectCrossedOut(booking(page, filed.text).locator('.day-item-name'));
        await expect(booking(page, filed.text).locator('.calendar-pin-icon')).toHaveCount(1);
    });

    await test.step('unpin a booked item without unscheduling it, then delete it', async () => {
        await openProject(page, projectId);
        await page.getByRole('button', { name: 'Unpin', exact: true }).click();
        await page.getByRole('button', { name: `Unpin “${filed.text}”`, exact: true }).click();
        const saved = savedResponse(page, 'PUT', `/api/projects/${projectId}/todos/pins`);
        await page.getByRole('button', { name: 'Confirm', exact: true }).click();
        await assertSaved(saved);
        await expect(sequenceCard(page, parent.title).locator('.todo-row--top-pinned')).toContainText(completed.text);
        await openPool(page);
        await expect(poolRow(page, filed.text)).toHaveCount(0);
        await expect(booking(page, filed.text)).toBeVisible();
        await expectCrossedOut(booking(page, filed.text).locator('.day-item-name'));
        await expect(booking(page, filed.text).locator('.calendar-pin-icon')).toHaveCount(0);
        await openProject(page, projectId);
        const deleted = savedResponse(page, 'DELETE', `/api/todos/${filed.id}`);
        await page.getByRole('button', { name: `Delete “${filed.text}”`, exact: true }).click();
        await assertSaved(deleted);
        await openPool(page);
        await expect(booking(page, blocked.text)).toBeVisible();
        await expect(booking(page, filed.text)).toHaveCount(0);
    });

    await test.step('persist multiline project description and retain collapsed sequence description', async () => {
        await openProject(page, projectId);
        const description = page.getByRole('textbox', { name: 'Project description' });
        await description.fill(DESCRIPTION);
        const saved = savedResponse(page, 'PATCH', `/api/projects/${projectId}`);
        await description.press('Control+Enter');
        await assertSaved(saved);
        await page.reload();
        await expect(description).toHaveValue(DESCRIPTION);
        await page.getByRole('button', { name: `Collapse ${parent.title}`, exact: true }).click();
        const collapsed = page.locator('.sequence-card--folded');
        await expect(collapsed.locator('.sequence-card-description')).toHaveText(SEQUENCE_DESCRIPTION);
        await expect(collapsed.locator('.sequence-card-description')).toBeVisible();
    });
});

const MIN_SEQUENCE_CARD_WIDTH_PX = 399;
const LAYERED_PLAN = {
    projectTitle: 'Circuit design', topLayerTitle: 'Foundations', bottomLayerTitle: 'Design',
    topTitle: 'Learn electronics', bottomTitle: 'Build a circuit',
};

test.describe('the sequence drag and row scrolling', () => {
    for (const isFolded of [false, true]) {
        const account = newCredentials();
        test.afterAll(() => deleteUserByEmail(account.email));
        test(`drags a ${isFolded ? 'folded' : 'open'} sequence into another layer`, async ({ page }) => {
            const { projectId } = await seedLayeredPlan(page, account, LAYERED_PLAN);
            await openProject(page, projectId);
            const card = page.locator(`li[data-sequence-title="${LAYERED_PLAN.topTitle}"]`);
            const target = page.getByRole('region', { name: LAYERED_PLAN.bottomLayerTitle });
            if (isFolded) {
                await page.getByRole('button', { name: `Collapse ${LAYERED_PLAN.topTitle}` }).click();
                await expect(page.getByRole('button', { name: `Expand ${LAYERED_PLAN.topTitle}` })).toBeVisible();
            }
            await dragOnto(page, card.getByRole('button', {
                name: `Move ${LAYERED_PLAN.topTitle} to another layer`,
            }), target.locator('.layer-row-header'));
            await expect(target.locator(`li[data-sequence-title="${LAYERED_PLAN.topTitle}"]`)).toBeVisible();
        });
    }

    const account = newCredentials();
    test.afterAll(() => deleteUserByEmail(account.email));
    test('scrolls a crowded layer sideways rather than shrinking its cards', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        const { projectId } = await seedCrowdedPlan(page, account, 'Crowded layer');
        await openProject(page, projectId);
        const row = page.locator('.layer-row-sequences').first();
        const dimensions = await row.evaluate((node) => ({
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
        }));
        expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
        const width = await row.locator('.sequence-card').first().evaluate((node) => node.getBoundingClientRect().width);
        expect(width).toBeGreaterThan(MIN_SEQUENCE_CARD_WIDTH_PX);
    });
});
