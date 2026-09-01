'use strict';

const { expect } = require('@playwright/test');

// The few things the critical flow needs that Playwright does not give it
// directly: a throwaway account, a pointer drag the `@dnd-kit` sensor accepts,
// and a reading of an SVG path good enough to tell a real edge from a smear at
// the origin.

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

/** A path shorter than this end to end is a measurement that has not settled. */
const MIN_EDGE_SPAN_PX = 20;

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

/** Every `x,y` pair in an SVG `d`, in order, as numbers. */
const pointsIn = (d) =>
    [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(([, x, y]) => ({
        x: Number(x),
        y: Number(y),
    }));

/**
 * Asserts that a `d` attribute describes a line actually drawn between two
 * measured cards, rather than the shape an unmeasured graph produces.
 *
 * This is the assertion the whole E2E suite exists for. `EdgeLayer` leaves out
 * any edge whose ends are not both measured, so a path in the DOM already means
 * something was measured — but a canvas that laid out to nothing would still
 * yield a path, of zero length at the origin. Checking the span is what
 * separates "an edge was drawn" from "an edge row reached the DOM".
 */
const expectDrawnEdge = (d) => {
    const points = pointsIn(d);

    expect(points.length, `an edge path should have coordinates: ${d}`).toBeGreaterThanOrEqual(2);
    points.forEach(({ x, y }) => {
        expect(
            Number.isFinite(x) && Number.isFinite(y),
            `edge path has a bad point: ${d}`
        ).toBe(true);
    });

    const start = points[0];
    const end = points[points.length - 1];

    // A downward edge: the child card's top edge is below the parent's connector
    // dot, and both sit inside the canvas rather than at its origin.
    expect(start.x, `edge starts at x=0: ${d}`).toBeGreaterThan(0);
    expect(start.y, `edge starts at y=0: ${d}`).toBeGreaterThan(0);
    expect(end.y - start.y, `edge does not run downward far enough: ${d}`).toBeGreaterThan(
        MIN_EDGE_SPAN_PX
    );
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
 * Registers an account and builds a two-layer plan through the API, then leaves
 * the browser signed in as that user.
 *
 * For tests whose subject is one interaction rather than the whole journey.
 * Clicking through the setup again would only re-assert what the critical flow
 * already covers, and every step of it is another way for an unrelated failure
 * to be blamed on the gesture under test.
 */
const seedPlan = async (page, credentials, title) => {
    await page.request.post('/api/auth/register', { data: credentials });

    const login = await (
        await page.request.post('/api/auth/login', {
            data: { email: credentials.email, password: credentials.password },
        })
    ).json();

    if (!login.token) throw new Error(`Seeding failed: no token for ${credentials.email}`);

    const headers = { Authorization: `Bearer ${login.token}` };

    const project = await dataOf(
        await page.request.post('/api/projects', { headers, data: { title, description: '' } })
    );

    // A new project comes with one layer; the second is what makes a connection
    // between layers possible at all.
    const graph = await dataOf(await page.request.get(`/api/projects/${project.id}`, { headers }));
    const lower = await dataOf(
        await page.request.post(`/api/projects/${project.id}/layers`, { headers, data: {} })
    );

    // Named apart, because every control on a card is labelled by its title and
    // two "Untitled sequence"s would make each of those labels ambiguous.
    const addSequence = async (layerId, sequenceTitle) => {
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

    const parent = await addSequence(graph.layers[0].id, 'Aerodynamics');
    const child = await addSequence(lower.id, 'Rotor system');

    await page.addInitScript((token) => window.localStorage.setItem('token', token), login.token);

    return { projectId: project.id, parent, child };
};

module.exports = {
    attachDiagnostics,
    seedPlan,
    dragOnto,
    expectDrawnEdge,
    newCredentials,
    pointsIn,
    MIN_EDGE_SPAN_PX,
};
