'use strict';

// The few things the critical flow needs that Playwright does not give it
// directly: a throwaway account, a plan seeded through the API, and a pointer
// drag the `@dnd-kit` sensor accepts.

/** Past `@dnd-kit`'s 5px activation distance — the nudge that starts the drag. */
const DRAG_NUDGE_PX = 12;

/** Enough intermediate moves that the sensor sees a drag, not a teleport. */
const DRAG_STEPS = 20;

/**
 * How long to leave the pointer alone after a drop.
 *
 * While a drag is running `@dnd-kit` holds a capture-phase `click` listener on
 * the document that swallows the event, so releasing the handle cannot also
 * count as clicking it, and it tears that listener down 50ms after the drop
 * (`AbstractPointerSensor.detach`). A person could not click again inside that
 * window; Playwright can, and its click would vanish for reasons that have
 * nothing to do with the app. This is that window, with room to spare.
 */
const DROP_SETTLE_MS = 150;

/**
 * A fresh account per run, on a domain that cannot be delivered to.
 *
 * Registration is part of the flow under test, so the account cannot be seeded;
 * it has to be unique instead, or a second run would hit the `users.email`
 * unique key and fail for a reason that has nothing to do with the product.
 */
const newCredentials = () => ({
    name: 'Drone Builder',
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
    password: 'e2e-password-1234',
});

/**
 * Drags one element onto another with real pointer events.
 *
 * `@dnd-kit`'s pointer sensor only starts a drag once the pointer has travelled
 * its activation distance, and it tracks movement rather than endpoints — so a
 * single jump from source to target does nothing at all. Hence the nudge, the
 * stepped move, and the settle before release: the last one gives collision
 * detection a frame to register which droppable is under the pointer.
 */
const dragOnto = async (page, source, target) => {
    const from = await source.boundingBox();
    const to = await target.boundingBox();

    if (!from) throw new Error('The drag source is not visible, so it cannot be dragged');
    if (!to) throw new Error('The drop target is not visible, so nothing can be dropped on it');

    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endX = to.x + to.width / 2;
    const endY = to.y + to.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + DRAG_NUDGE_PX, startY, { steps: 4 });
    await page.mouse.move(endX, endY, { steps: DRAG_STEPS });
    await page.mouse.move(endX, endY);
    await page.mouse.up();
    await page.waitForTimeout(DROP_SETTLE_MS);
};

/**
 * Echoes the things a headless run otherwise throws away: page errors, console
 * errors, and any API call that came back 400 or worse.
 *
 * A failing assertion in a browser says what was not on screen, never why. This
 * is what turns "the status never changed" into the rejected request behind it.
 * A healthy run prints nothing.
 */
const attachDiagnostics = (page) => {
    page.on('pageerror', (error) => console.error(`[page error] ${error.message}`));

    page.on('console', (message) => {
        if (message.type() === 'error') console.error(`[console] ${message.text()}`);
    });

    page.on('response', async (response) => {
        if (!response.url().includes('/api/') || response.status() < 400) return;

        const body = await response.text().catch(() => '<unreadable>');

        console.error(
            `[api ${response.status()}] ${response.request().method()} ` +
                `${response.url()} — ${body}`
        );
    });
};

/** Unwraps the `{ success, data, error }` envelope, or says what went wrong. */
const dataOf = async (response) => {
    const envelope = await response.json();

    if (!response.ok() || envelope.success === false) {
        throw new Error(
            `Seeding failed: ${response.request().method()} ${response.url()} ` +
                `-> ${response.status()} ${envelope.error ?? ''}`
        );
    }

    return envelope.data;
};

/**
 * Registers a throwaway account through the API and leaves the browser signed
 * in as it.
 *
 * Every seed helper below needs the same account and the same bearer headers
 * to build its graph with — this is the one place that logs in, so the login
 * call itself is not duplicated in each of them.
 */
const registerAndLogin = async (page, credentials) => {
    await page.request.post('/api/auth/register', { data: credentials });

    const login = await (
        await page.request.post('/api/auth/login', {
            data: { email: credentials.email, password: credentials.password },
        })
    ).json();

    if (!login.token) throw new Error(`Seeding failed: no token for ${credentials.email}`);

    await page.addInitScript((token) => window.localStorage.setItem('token', token), login.token);

    return { headers: { Authorization: `Bearer ${login.token}` } };
};

const createProject = async (page, headers, title) =>
    dataOf(await page.request.post('/api/projects', { headers, data: { title, description: '' } }));

/** A project's second (or third, ...) layer, appended after every layer it already has. */
const addLayerBelow = async (page, headers, projectId) =>
    dataOf(await page.request.post(`/api/projects/${projectId}/layers`, { headers, data: {} }));

const renameLayer = async (page, headers, layerId, title) =>
    dataOf(await page.request.patch(`/api/layers/${layerId}`, { headers, data: { title } }));

/**
 * An untitled sequence at the end of `layerId`, immediately named.
 *
 * Named apart, because every control on a card is labelled by its title and
 * two "Untitled sequence"s would make each of those labels ambiguous.
 */
const addSequence = async (page, headers, layerId, sequenceTitle) => {
    const created = await dataOf(
        await page.request.post(`/api/layers/${layerId}/sequences`, { headers, data: {} })
    );

    return dataOf(
        await page.request.patch(`/api/sequences/${created.id}`, {
            headers,
            data: { title: sequenceTitle },
        })
    );
};

/**
 * A to-do, either loose in the unorganized panel (`sequenceId` left null) or
 * already filed in a sequence.
 *
 * Seeded rather than typed, for the same reason the sequences are: a test whose
 * subject is one gesture should not re-assert the composer the critical flow
 * already covers.
 */
const addTodo = async (page, headers, projectId, text, sequenceId = null) =>
    dataOf(
        await page.request.post(`/api/projects/${projectId}/todos`, {
            headers,
            data: { text, sequenceId },
        })
    );

/**
 * Registers an account and builds a two-layer plan through the API, then leaves
 * the browser signed in as that user.
 *
 * For tests whose subject is one interaction rather than the whole journey.
 * Clicking through the setup again would only re-assert what the critical flow
 * already covers, and every step of it is another way for an unrelated failure
 * to be blamed on the gesture under test.
 */
const seedPlan = async (page, credentials, title) => {
    const { headers } = await registerAndLogin(page, credentials);
    const project = await createProject(page, headers, title);

    // A new project comes with one layer; the second is what gives the canvas
    // two rows, so a card has somewhere else to be dragged to.
    const graph = await dataOf(await page.request.get(`/api/projects/${project.id}`, { headers }));
    const lower = await addLayerBelow(page, headers, project.id);

    const parent = await addSequence(page, headers, graph.layers[0].id, 'Aerodynamics');
    const child = await addSequence(page, headers, lower.id, 'Rotor system');

    return { projectId: project.id, headers, parent, child };
};

/**
 * Registers an account and builds a two-layer plan holding one sequence in each
 * layer, naming both layers so a test can address one of them by its `region`
 * role rather than by an id it would otherwise have to thread through.
 *
 * For the sequence drag: the named bottom layer is the destination, and the
 * sequence already sitting in it is what makes the drop ambiguous enough to be
 * worth aiming carefully at.
 */
const seedLayeredPlan = async (
    page,
    credentials,
    { projectTitle, topLayerTitle, bottomLayerTitle, topTitle, bottomTitle }
) => {
    const { headers } = await registerAndLogin(page, credentials);
    const project = await createProject(page, headers, projectTitle);

    const graph = await dataOf(await page.request.get(`/api/projects/${project.id}`, { headers }));
    const lower = await addLayerBelow(page, headers, project.id);

    await renameLayer(page, headers, graph.layers[0].id, topLayerTitle);
    await renameLayer(page, headers, lower.id, bottomLayerTitle);

    const top = await addSequence(page, headers, graph.layers[0].id, topTitle);
    const bottom = await addSequence(page, headers, lower.id, bottomTitle);

    return { projectId: project.id, headers, top, bottom };
};

/**
 * How many sequences it takes to force `.layer-row-sequences` past a 1280px
 * viewport. Each card holds at 25rem (400px) plus a 1rem gap (Task 4), so six
 * of them (2400px of cards alone) comfortably overflows a row with room to
 * spare for the canvas gutter and the row's own padding.
 */
const CROWDED_SEQUENCE_COUNT = 6;

/**
 * Registers an account and builds one layer crowded with more sequences than a
 * 1280px viewport can show at once.
 *
 * One layer and nothing else: the only thing seeded here is the overflow, which
 * is the whole subject of the test that asks for it.
 */
const seedCrowdedPlan = async (page, credentials, title) => {
    const { headers } = await registerAndLogin(page, credentials);
    const project = await createProject(page, headers, title);

    const graph = await dataOf(await page.request.get(`/api/projects/${project.id}`, { headers }));

    const crowd = [];
    for (let position = 1; position <= CROWDED_SEQUENCE_COUNT; position += 1) {
        // Sequential on purpose: the server assigns each new sequence's position
        // from how many the layer already has, so two of these racing each
        // other could both read the same count and land at the same position.
        // eslint-disable-next-line no-await-in-loop
        crowd.push(await addSequence(page, headers, graph.layers[0].id, `Crowded ${position}`));
    }

    return { projectId: project.id, crowd };
};

/** Opens a seeded project and waits for its canvas to actually be on screen. */
const openProject = async (page, projectId) => {
    await page.goto(`/projects/${projectId}`);
    await page.locator('.canvas-layer').first().waitFor();
};

module.exports = {
    attachDiagnostics,
    addTodo,
    seedPlan,
    seedLayeredPlan,
    seedCrowdedPlan,
    openProject,
    dragOnto,
    newCredentials,
};
