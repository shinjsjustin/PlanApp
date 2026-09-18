'use strict';

const { test, expect } = require('@playwright/test');

const { deleteUserByEmail } = require('./database');
const {
    attachDiagnostics,
    dragOnto,
    newCredentials,
    openProject,
    seedCrowdedPlan,
    seedLayeredPlan,
} = require('./helpers');

// The one critical flow (spec section 6).
//
// Everything the other suites can reach is already covered by them. This exists
// for the two things they cannot see, because jsdom has neither layout nor a
// `ResizeObserver`: that a click anywhere on a project card really lands on the
// link stretched over it, and that a to-do can really be dragged from the panel
// into a card.
//
// It runs as one ordered test rather than several, because each step is the
// setup for the next: there is no meaningful "the frontier reflects the whole
// plan" without the plan the earlier steps built.

const DRONE = {
    project: 'Drone build',
    firstLayer: 'Learning',
    secondLayer: 'Design',
    firstSequence: 'Aerodynamics',
    secondSequence: 'Rotor system',
    firstTodo: 'Learn aerodynamics',
    secondTodo: 'Design the rotor',
};

const credentials = newCredentials();

test.beforeEach(({ page }) => {
    attachDiagnostics(page);
});

test.afterAll(async () => {
    await deleteUserByEmail(credentials.email);
});

/** Types into an inline title and commits it with Enter. */
const rename = async (page, currentLabel, title) => {
    const field = page.getByLabel(currentLabel, { exact: true });

    await field.fill(title);
    await field.press('Enter');
};

const sequenceCard = (page, title) => page.locator(`li[data-sequence-title="${title}"]`);

test('plans a project end to end: to-dos, sequences, layers and the ready frontier', async ({
    page,
}) => {
    await test.step('register and log in', async () => {
        await page.goto('/register');
        await page.getByPlaceholder('Full Name').fill(credentials.name);
        await page.getByPlaceholder('Email').fill(credentials.email);
        await page.getByPlaceholder('Password (min 8 characters)').fill(credentials.password);
        await page.getByPlaceholder('Confirm Password').fill(credentials.password);
        await page.getByRole('button', { name: 'Create Account' }).click();

        await expect(page).toHaveURL(/\/post-register$/);

        await page.goto('/login');
        await page.getByPlaceholder('Email').fill(credentials.email);
        await page.getByPlaceholder('Password', { exact: true }).fill(credentials.password);
        await page.getByRole('button', { name: 'Log In' }).click();

        // A new account lands on an empty grid, which is what proves
        // registration granted the access level the protected route requires
        // rather than bouncing to /access-denied (spec section 4.1).
        await expect(page).toHaveURL(/\/projects$/);
        await expect(page.getByText('No projects yet.')).toBeVisible();
    });

    await test.step('create a project', async () => {
        await page.getByRole('button', { name: 'Create your first project' }).click();
        await page.getByLabel('Title').fill(DRONE.project);
        await page.getByRole('button', { name: 'Create project' }).click();

        const card = page.locator('.project-card');

        await expect(card.getByRole('link', { name: DRONE.project })).toBeVisible();
        await expect(card).toContainText('0/0 to-dos done');
        await expect(card).toContainText('No sequences yet');

        // The whole card is the way in, and only a browser can say so: the hit
        // area is the title link's `::after` stretched over the card, which
        // jsdom has no layout to test. Clicking the card's own padding, clear of
        // every control, has to land on that link.
        await card.click({ position: { x: 8, y: 8 } });
        await expect(page).toHaveURL(/\/projects\/\d+$/);

        await page.goBack();
        await expect(page).toHaveURL(/\/projects$/);

        await card.getByRole('link', { name: DRONE.project }).click();
        await expect(page).toHaveURL(/\/projects\/\d+$/);
        await expect(page.getByRole('heading', { name: DRONE.project })).toBeVisible();
    });

    await test.step('name the layer a new project comes with', async () => {
        await rename(page, 'Layer title: Untitled layer', DRONE.firstLayer);
        await expect(page.getByLabel(`Layer title: ${DRONE.firstLayer}`)).toBeVisible();
    });

    await test.step('add an unorganized to-do', async () => {
        const composer = page.getByLabel('New unorganized to-do');

        await composer.fill(DRONE.firstTodo);
        await composer.press('Enter');

        // Cleared and still focused, so the next one can be typed straight in
        // (spec section 4.7).
        await expect(composer).toHaveValue('');
        await expect(composer).toBeFocused();

        const panel = page.getByRole('list', { name: 'Unorganized to-dos' });

        await expect(panel.getByText(DRONE.firstTodo)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Unorganized (1)' })).toBeVisible();
    });

    await test.step('add a sequence, which arrives open', async () => {
        await page.getByRole('button', { name: `Add a sequence to ${DRONE.firstLayer}` }).click();
        await rename(page, 'Sequence title: Untitled sequence', DRONE.firstSequence);

        // No click to open it: a card renders expanded (spec decision 2), so the
        // row that adds the first to-do is on screen straight away. The empty
        // list has no line of its own any more — the ghost add row is what says
        // there is nothing here yet, and what does something about it.
        await expect(
            sequenceCard(page, DRONE.firstSequence).getByText(
                `New to-do in ${DRONE.firstSequence}`
            )
        ).toBeVisible();
    });

    await test.step('drag the unorganized to-do into the sequence', async () => {
        const handle = page.getByRole('button', { name: `Drag “${DRONE.firstTodo}”` });
        const body = sequenceCard(page, DRONE.firstSequence).locator('.sequence-card-body');

        await dragOnto(page, handle, body);

        // It left the panel and joined the card — the move the reducer, the
        // endpoint and the layout all had to agree on. It is the sequence's only
        // outstanding to-do, so it arrives as the next step, in the band.
        await expect(page.getByRole('button', { name: 'Unorganized (0)' })).toBeVisible();
        await expect(
            sequenceCard(page, DRONE.firstSequence).locator('.sequence-spotlight-text')
        ).toContainText(DRONE.firstTodo);
    });

    await test.step('mark the to-do complete', async () => {
        // The only outstanding to-do is the next step, so it is drawn in the
        // spotlight band; its circle is the same control the list rows carry.
        await page
            .getByRole('button', { name: `Complete “${DRONE.firstTodo}”` })
            .click();

        // Finished, it drops out of the flow into the DONE group, where the way
        // back is the same circle.
        await expect(
            page.getByRole('button', { name: `Mark “${DRONE.firstTodo}” incomplete` })
        ).toBeVisible();

        // A sequence's status is derived from its to-dos, never stored, so
        // ticking the last one finishes the sequence (spec section 4.3).
        await expect(
            sequenceCard(page, DRONE.firstSequence).locator('.sequence-card-status')
        ).toHaveText('Complete');
    });

    await test.step('add a second layer with a sequence of its own', async () => {
        await page.getByRole('button', { name: `Add a layer below ${DRONE.firstLayer}` }).click();
        await rename(page, 'Layer title: Untitled layer', DRONE.secondLayer);

        await page.getByRole('button', { name: `Add a sequence to ${DRONE.secondLayer}` }).click();
        await rename(page, 'Sequence title: Untitled sequence', DRONE.secondSequence);

        // The add row is a placeholder until it is clicked, then a field in the
        // same place at the same size.
        const card = sequenceCard(page, DRONE.secondSequence);

        await card.getByText(`New to-do in ${DRONE.secondSequence}`).click();

        const composer = page.getByLabel(`New to-do in ${DRONE.secondSequence}`);

        await composer.fill(DRONE.secondTodo);
        await composer.press('Enter');
        await composer.press('Escape');

        // The sequence's only outstanding to-do, so it is the next step and is
        // drawn in the spotlight band rather than in the list below it.
        await expect(card.locator('.sequence-spotlight-text')).toContainText(DRONE.secondTodo);
    });

    await test.step('the canvas offers nothing to connect sequences with', async () => {
        // Two layers, each with a sequence — the exact shape that used to draw a
        // line between them. The canvas shows layers and sequences and nothing
        // in between: no overlay to measure against, no dot to start a line
        // from, and no mode a card can be caught in.
        await expect(page.locator('svg.edge-layer')).toHaveCount(0);
        await expect(page.locator('path.edge')).toHaveCount(0);
        await expect(page.locator('.connector-dot')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Connect (from|to) / })).toHaveCount(0);
        await expect(page.locator('li[data-sequence-title][data-connect]')).toHaveCount(0);
    });

    await test.step('the home page frontier reflects the whole plan', async () => {
        await page.getByRole('link', { name: '← All projects' }).click();

        const card = page.locator('.project-card');

        await expect(card).toContainText('1/2 to-dos done');

        const frontier = card.getByRole('list', { name: 'Ready now' });

        // A layer offers its first unfinished sequence and nothing else. The
        // first layer's only sequence is complete, so that layer contributes
        // nothing; the second layer contributes its sequence, paired with the
        // to-do to pick up (spec section 4.3).
        await expect(frontier.locator('.frontier-line')).toHaveCount(1);
        await expect(frontier).toContainText(DRONE.secondSequence);
        await expect(frontier).toContainText(DRONE.secondTodo);
        await expect(frontier).not.toContainText(DRONE.firstSequence);
    });

    await test.step('reopening the finished sequence puts its layer back on the frontier', async () => {
        await page.getByRole('link', { name: DRONE.project }).click();
        await page.getByRole('button', { name: `Collapse ${DRONE.firstSequence}` }).waitFor();

        // One click on its DONE row puts it back: the checkbox toggles, and the
        // to-do returns to the flow as the sequence's next step again.
        await page
            .getByRole('button', { name: `Mark “${DRONE.firstTodo}” incomplete` })
            .click();
        await expect(
            page.getByRole('button', { name: `Complete “${DRONE.firstTodo}”` })
        ).toBeVisible();

        await page.getByRole('link', { name: '← All projects' }).click();

        const frontier = page.locator('.project-card').getByRole('list', { name: 'Ready now' });

        // Layers are independent now. Unfinishing the first layer's sequence
        // puts that layer back on the frontier and takes nothing away from the
        // second — both layers lead with an incomplete sequence, so both offer
        // one, top to bottom.
        await expect(frontier.locator('.frontier-line')).toHaveCount(2);
        await expect(frontier).toContainText(DRONE.firstSequence);
        await expect(frontier).toContainText(DRONE.firstTodo);
        await expect(frontier).toContainText(DRONE.secondSequence);
        await expect(frontier).toContainText(DRONE.secondTodo);
    });
});

// The three things a real browser has to judge that the flow above cannot
// (Tasks 4 and 12): a sequence dragged into another layer, open and folded, and
// a crowded row that scrolls instead of shrinking its cards.
//
// Each test seeds its own account and project rather than extending the flow
// above. None of these is a further step of "plan a project end to end" — they
// are independent facts about the canvas — and splitting them out means a
// failure in one cannot leave the shared flow's account or project in a state
// the steps after it were not written to expect.

/** Below this, a card has shrunk rather than held its 25rem width (Task 4). */
const MIN_SEQUENCE_CARD_WIDTH_PX = 399;

const LAYERED_PLAN = {
    topLayer: 'Foundations',
    bottomLayer: 'Design',
    top: 'Learn electronics',
    bottom: 'Build a circuit',
};

test.describe('the sequence drag and row scrolling', () => {
    const dragCredentials = newCredentials();
    const foldedDragCredentials = newCredentials();
    const scrollCredentials = newCredentials();

    test.afterAll(async () => {
        await Promise.all(
            [dragCredentials, foldedDragCredentials, scrollCredentials].map((credentials) =>
                deleteUserByEmail(credentials.email)
            )
        );
    });

    test('drags a sequence into another layer', async ({ page }) => {
        const { projectId } = await seedLayeredPlan(page, dragCredentials, {
            projectTitle: 'Circuit design',
            topLayerTitle: LAYERED_PLAN.topLayer,
            bottomLayerTitle: LAYERED_PLAN.bottomLayer,
            topTitle: LAYERED_PLAN.top,
            bottomTitle: LAYERED_PLAN.bottom,
        });

        await openProject(page, projectId);

        const card = sequenceCard(page, LAYERED_PLAN.top);
        const targetLayer = page.getByRole('region', { name: LAYERED_PLAN.bottomLayer });
        const grip = card.getByRole('button', {
            name: `Move ${LAYERED_PLAN.top} to another layer`,
        });

        // The header, not the region as a whole: the region also holds a
        // sequence of its own, and dnd-kit's pointer collision detection would
        // rather land on that card's droppable than the layer's. Aiming at the
        // header — inside the region, outside every card — keeps the drop
        // unambiguous.
        await dragOnto(page, grip, targetLayer.locator('.layer-row-header'));

        await expect(
            targetLayer.locator(`li[data-sequence-title="${LAYERED_PLAN.top}"]`)
        ).toBeVisible();
    });

    // Task 12 gave the grip to `SequenceCardCollapsed` as well as the open
    // card, specifically so a folded card could be reorganised without opening
    // it first. That only means something if a folded drag is actually
    // exercised, not just an open one.
    test('drags a folded sequence card into another layer just as well as an open one', async ({
        page,
    }) => {
        const { projectId } = await seedLayeredPlan(page, foldedDragCredentials, {
            projectTitle: 'Folded circuit design',
            topLayerTitle: LAYERED_PLAN.topLayer,
            bottomLayerTitle: LAYERED_PLAN.bottomLayer,
            topTitle: LAYERED_PLAN.top,
            bottomTitle: LAYERED_PLAN.bottom,
        });

        await openProject(page, projectId);

        const card = sequenceCard(page, LAYERED_PLAN.top);
        const targetLayer = page.getByRole('region', { name: LAYERED_PLAN.bottomLayer });

        await page.getByRole('button', { name: `Collapse ${LAYERED_PLAN.top}` }).click();
        await expect(
            page.getByRole('button', { name: `Expand ${LAYERED_PLAN.top}` })
        ).toBeVisible();

        const grip = card.getByRole('button', {
            name: `Move ${LAYERED_PLAN.top} to another layer`,
        });

        await dragOnto(page, grip, targetLayer.locator('.layer-row-header'));

        await expect(
            targetLayer.locator(`li[data-sequence-title="${LAYERED_PLAN.top}"]`)
        ).toBeVisible();
    });

    test('scrolls a crowded layer sideways rather than shrinking its cards', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });

        const { projectId } = await seedCrowdedPlan(page, scrollCredentials, 'Crowded layer');

        await openProject(page, projectId);

        const row = page.locator('.layer-row-sequences').first();

        const { scrollWidth, clientWidth } = await row.evaluate((node) => ({
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
        }));

        expect(scrollWidth, 'a crowded row should overflow rather than fit').toBeGreaterThan(
            clientWidth
        );

        const cardWidth = await row
            .locator('.sequence-card')
            .first()
            .evaluate((node) => node.getBoundingClientRect().width);

        expect(cardWidth, 'a crowded card should hold its width, not shrink').toBeGreaterThan(
            MIN_SEQUENCE_CARD_WIDTH_PX
        );
    });
});
