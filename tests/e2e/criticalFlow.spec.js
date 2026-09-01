'use strict';

const { test, expect } = require('@playwright/test');

const { deleteUserByEmail } = require('./database');
const {
    attachDiagnostics,
    dragOnto,
    expectDrawnEdge,
    newCredentials,
} = require('./helpers');

// The one critical flow (spec section 6).
//
// Everything the other suites can reach is already covered by them. This exists
// for the four things they cannot see, because jsdom has neither layout nor a
// `ResizeObserver`: that a click anywhere on a project card really lands on the
// link stretched over it, that a to-do can really be dragged from the panel into
// a card, that connect mode really tethers two sequences across layers, and that
// the edge between them is really drawn — a `<path>` with coordinates measured
// off cards that actually occupy space.
//
// It runs as one ordered test rather than several, because each step is the
// setup for the next: there is no meaningful "connect two sequences" without the
// two sequences the earlier steps built.

const DRONE = {
    project: 'Drone build',
    parentLayer: 'Learning',
    childLayer: 'Design',
    parentSequence: 'Aerodynamics',
    childSequence: 'Rotor system',
    parentTodo: 'Learn aerodynamics',
    childTodo: 'Design the rotor',
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

test('plans a project end to end: to-dos, sequences, layers and a drawn edge', async ({ page }) => {
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
        await rename(page, 'Layer title: Untitled layer', DRONE.parentLayer);
        await expect(page.getByLabel(`Layer title: ${DRONE.parentLayer}`)).toBeVisible();
    });

    await test.step('add an unorganized to-do', async () => {
        const composer = page.getByLabel('New unorganized to-do');

        await composer.fill(DRONE.parentTodo);
        await composer.press('Enter');

        // Cleared and still focused, so the next one can be typed straight in
        // (spec section 4.7).
        await expect(composer).toHaveValue('');
        await expect(composer).toBeFocused();

        const panel = page.getByRole('list', { name: 'Unorganized to-dos' });

        await expect(panel.getByText(DRONE.parentTodo)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Unorganized (1)' })).toBeVisible();
    });

    await test.step('add a sequence, which arrives open', async () => {
        await page.getByRole('button', { name: `Add a sequence to ${DRONE.parentLayer}` }).click();
        await rename(page, 'Sequence title: Untitled sequence', DRONE.parentSequence);

        // No click to open it: a card renders expanded (spec decision 2), so the
        // row that adds the first to-do is on screen straight away. The empty
        // list has no line of its own any more — the ghost add row is what says
        // there is nothing here yet, and what does something about it.
        await expect(
            sequenceCard(page, DRONE.parentSequence).getByText(
                `New to-do in ${DRONE.parentSequence}`
            )
        ).toBeVisible();
    });

    await test.step('drag the unorganized to-do into the sequence', async () => {
        const handle = page.getByRole('button', { name: `Drag “${DRONE.parentTodo}”` });
        const body = sequenceCard(page, DRONE.parentSequence).locator('.sequence-card-body');

        await dragOnto(page, handle, body);

        // It left the panel and joined the card — the move the reducer, the
        // endpoint and the layout all had to agree on. It is the sequence's only
        // outstanding to-do, so it arrives as the next step, in the band.
        await expect(page.getByRole('button', { name: 'Unorganized (0)' })).toBeVisible();
        await expect(
            sequenceCard(page, DRONE.parentSequence).locator('.sequence-spotlight-text')
        ).toContainText(DRONE.parentTodo);
    });

    await test.step('mark the to-do complete', async () => {
        // The only outstanding to-do is the next step, so it is drawn in the
        // spotlight band; its circle is the same control the list rows carry.
        await page
            .getByRole('button', { name: `Complete “${DRONE.parentTodo}”` })
            .click();

        // Finished, it drops out of the flow into the DONE group, where the way
        // back is the same circle.
        await expect(
            page.getByRole('button', { name: `Mark “${DRONE.parentTodo}” incomplete` })
        ).toBeVisible();

        // A sequence's status is derived from its to-dos, never stored, so
        // ticking the last one finishes the sequence (spec section 4.3).
        await expect(
            sequenceCard(page, DRONE.parentSequence).locator('.sequence-card-status')
        ).toHaveText('Complete');
    });

    await test.step('add a second layer with a sequence of its own', async () => {
        await page.getByRole('button', { name: `Add a layer below ${DRONE.parentLayer}` }).click();
        await rename(page, 'Layer title: Untitled layer', DRONE.childLayer);

        await page.getByRole('button', { name: `Add a sequence to ${DRONE.childLayer}` }).click();
        await rename(page, 'Sequence title: Untitled sequence', DRONE.childSequence);

        // The add row is a placeholder until it is clicked, then a field in the
        // same place at the same size.
        const card = sequenceCard(page, DRONE.childSequence);

        await card.getByText(`New to-do in ${DRONE.childSequence}`).click();

        const composer = page.getByLabel(`New to-do in ${DRONE.childSequence}`);

        await composer.fill(DRONE.childTodo);
        await composer.press('Enter');
        await composer.press('Escape');

        // The sequence's only outstanding to-do, so it is the next step and is
        // drawn in the spotlight band rather than in the list below it.
        await expect(card.locator('.sequence-spotlight-text')).toContainText(DRONE.childTodo);
    });

    await test.step('connect the two sequences across the layers', async () => {
        await page.getByRole('button', { name: `Connect from ${DRONE.parentSequence}` }).click();

        // Connect mode: the sequence below is a target, the armed one is not.
        await expect(sequenceCard(page, DRONE.childSequence)).toHaveAttribute(
            'data-connect',
            'eligible'
        );
        await expect(sequenceCard(page, DRONE.parentSequence)).toHaveAttribute(
            'data-connect',
            'selected'
        );

        await page.getByRole('button', { name: `Connect to ${DRONE.childSequence}` }).click();

        // The selection is dropped by the same gesture that made the edge.
        await expect(sequenceCard(page, DRONE.childSequence)).not.toHaveAttribute(
            'data-connect',
            'eligible'
        );
    });

    await test.step('the edge is drawn, and survives a reload', async () => {
        const edge = page.locator('svg.edge-layer path.edge');

        await expect(edge).toHaveCount(1);
        expectDrawnEdge(await edge.getAttribute('d'));

        // Reloading proves the line came from a stored edge and a fresh
        // measurement, not from the optimistic row the click put in the reducer.
        await page.reload();
        await page.getByRole('button', { name: `Collapse ${DRONE.parentSequence}` }).waitFor();

        await expect(edge).toHaveCount(1);
        expectDrawnEdge(await edge.getAttribute('d'));
    });

    await test.step('the home page frontier reflects the whole plan', async () => {
        await page.getByRole('link', { name: '← All projects' }).click();

        const card = page.locator('.project-card');

        await expect(card).toContainText('1/2 to-dos done');

        const frontier = card.getByRole('list', { name: 'Ready now' });

        // The finished sequence is not on the frontier; the one it unblocked is,
        // paired with the to-do to pick up (spec section 4.3).
        await expect(frontier.locator('.frontier-line')).toHaveCount(1);
        await expect(frontier).toContainText(DRONE.childSequence);
        await expect(frontier).toContainText(DRONE.childTodo);
        await expect(frontier).not.toContainText(DRONE.parentSequence);
    });

    await test.step('reopening the parent takes the child off the frontier again', async () => {
        await page.getByRole('link', { name: DRONE.project }).click();
        await page.getByRole('button', { name: `Collapse ${DRONE.parentSequence}` }).waitFor();

        // One click on its DONE row puts it back: the checkbox toggles, and the
        // to-do returns to the flow as the sequence's next step again.
        await page
            .getByRole('button', { name: `Mark “${DRONE.parentTodo}” incomplete` })
            .click();
        await expect(
            page.getByRole('button', { name: `Complete “${DRONE.parentTodo}”` })
        ).toBeVisible();

        await page.getByRole('link', { name: '← All projects' }).click();

        const frontier = page.locator('.project-card').getByRole('list', { name: 'Ready now' });

        // This is what the edge is for: the child is gated behind its parent, so
        // an unfinished parent takes it off the frontier and puts itself on.
        await expect(frontier).toContainText(DRONE.parentSequence);
        await expect(frontier).toContainText(DRONE.parentTodo);
        await expect(frontier).not.toContainText(DRONE.childSequence);
    });
});
