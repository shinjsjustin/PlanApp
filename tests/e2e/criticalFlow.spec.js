'use strict';

const { test, expect } = require('@playwright/test');
const { deleteUserByEmail } = require('./database');
const {
    attachDiagnostics, addTodo, dataOf, dateSequenceToday, dragOnto, newCredentials, openProject,
    poolGrip, seedPlan, todayTitle, seedCrowdedPlan, seedLayeredPlan,
} = require('./helpers');

const credentials = newCredentials();
const onboardingCredentials = newCredentials();
const PROJECT = 'Dated work';
const ONBOARDING_PROJECT = 'Card navigation';
const ONBOARDING_LAYER = 'Planning';
const ONBOARDING_SECOND_LAYER = 'Execution';
const ONBOARDING_SEQUENCE = 'First sequence';
const DESCRIPTION = 'Build a reliable aircraft.\nKeep the design reviewable.';
const SEQUENCE_DESCRIPTION = 'Understand lift.\nThen test the assumptions.';
const poolRow = (page, text) =>
    page.locator('.panel-todo-row:not(.panel-sequence-row)').filter({ hasText: text });
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

const seedCriticalPlan = async (page) => {
    const plan = await seedPlan(page, credentials, PROJECT);
    const { headers, projectId, parent } = plan;
    await dateSequenceToday(page, headers, parent.id);
    await dataOf(await page.request.patch(`/api/sequences/${parent.id}`, {
        headers, data: { description: SEQUENCE_DESCRIPTION },
    }));
    const filed = await addTodo(page, headers, projectId, 'Review lift', parent.id);
    const completed = await addTodo(page, headers, projectId, 'Read handbook', parent.id);
    await dataOf(await page.request.patch(`/api/todos/${completed.id}`, {
        headers, data: { status: 'complete' },
    }));
    return { ...plan, filed, completed };
};

const openPool = async (page) => {
    await page.goto('/calendar');
    await expect(page.getByRole('region', { name: 'Projects' })).toBeVisible();
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

test('lists a dated sequence on Home and the Calendar, and books its to-do onto a day', async ({ page }) => {
    const plan = await seedCriticalPlan(page);
    const { projectId, filed, completed } = plan;

    await test.step('the Home card lists exactly today\'s to-dos', async () => {
        await page.goto('/projects');
        await expect(page.locator('.today-todo')).toHaveText([filed.text, completed.text]);
        await expect(page.locator('.project-card-today-heading')).toHaveText(SEQUENCE_DESCRIPTION);
        await expectCrossedOut(page.locator('.today-todo--complete'));
    });

    await test.step('the Calendar panel shows the sequence and its to-dos', async () => {
        await openPool(page);
        await expect(page.locator('.pool-day-heading')).toHaveText('Today');
        await expect(page.locator('.panel-sequence-title')).toHaveText(todayTitle());
        await expect(page.locator('.panel-sequence-todos .panel-todo-text')).toHaveText(
            [filed.text, completed.text]
        );
        await expect(poolRow(page, completed.text).locator('.panel-todo-grip')).toHaveCount(0);
        await expectCrossedOut(poolRow(page, completed.text).locator('.panel-todo-text'));
    });

    await test.step('dragging a to-do onto a day books it, and completing keeps the booking', async () => {
        await page.getByRole('button', { name: 'Add the first day' }).click();
        await expect(page.getByRole('button', { name: 'Delete Day 1' })).toBeAttached();
        const day = page.getByRole('region', { name: 'Day 1', exact: true });
        await schedule(page, filed.text, day);
        const saved = savedResponse(page, 'PATCH', `/api/todos/${filed.id}`);
        await booking(page, filed.text).getByRole('button', { name: `Complete “${filed.text}”` }).click();
        await assertSaved(saved);
        await expectCrossedOut(booking(page, filed.text).locator('.day-item-name'));
        await expectCrossedOut(poolRow(page, filed.text).locator('.panel-todo-text'));
        await page.reload();
        await expectCrossedOut(booking(page, filed.text).locator('.day-item-name'));
    });

    await test.step('deleting a booked to-do removes its booking', async () => {
        await openProject(page, projectId);
        const deleted = savedResponse(page, 'DELETE', `/api/todos/${filed.id}`);
        await page.getByRole('button', { name: `Delete “${filed.text}”`, exact: true }).click();
        await assertSaved(deleted);
        await openPool(page);
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
        await page.getByRole('button', { name: `Collapse ${todayTitle()}`, exact: true }).click();
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
