'use strict';

const { test, expect } = require('@playwright/test');

const { deleteUserByEmail } = require('./database');
const {
    addTodo,
    attachDiagnostics,
    dragOnto,
    newCredentials,
    openProject,
    seedConnectedPlan,
    seedPlan,
} = require('./helpers');

// The two drags share one `DndContext`, and their droppables nest: a to-do row
// sits inside a sequence card, which is itself a place another card can be
// dropped. `detectCollisions` narrows the candidates to the droppables of the
// drag actually in flight (spec section 9); without that narrowing each drag can
// win the other's target, resolve to nothing, and be discarded in silence.
//
// The critical flow's sequence drag deliberately aims at `.layer-row-header` —
// inside the target layer, outside every card — to keep its drop unambiguous.
// That is the right call for a test about the move, and it is exactly why it
// cannot see this: both failures need the pointer released over a droppable of
// the *other* kind. Hence a suite whose whole subject is aiming badly on purpose.
//
// Only a real browser can judge either one. The narrowing is collision detection
// over measured rectangles, and jsdom reports every rectangle as zero, so in
// jsdom nothing is ever under the pointer and neither drop happens at all.

const CIRCUIT = {
    topLayer: 'Foundations',
    bottomLayer: 'Design',
    parent: 'Learn electronics',
    child: 'Build a circuit',
    childTodos: ['Read up on lift', 'Etch the board'],
};

const LOOSE_TODO = 'Solder the joints';

const sequenceCard = (page, title) => page.locator(`li[data-sequence-title="${title}"]`);

test.beforeEach(({ page }) => {
    attachDiagnostics(page);
});

test.describe('a drag let go over the other drag’s droppable', () => {
    const sequenceOntoTodoCredentials = newCredentials();
    const todoOntoCardCredentials = newCredentials();

    test.afterAll(async () => {
        await Promise.all(
            [sequenceOntoTodoCredentials, todoOntoCardCredentials].map((credentials) =>
                deleteUserByEmail(credentials.email)
            )
        );
    });

    test('files a sequence dropped on a to-do inside another card into that card’s layer', async ({
        page,
    }) => {
        const { projectId, headers, child } = await seedConnectedPlan(
            page,
            sequenceOntoTodoCredentials,
            {
                projectTitle: 'Circuit design',
                topLayerTitle: CIRCUIT.topLayer,
                bottomLayerTitle: CIRCUIT.bottomLayer,
                parentTitle: CIRCUIT.parent,
                childTitle: CIRCUIT.child,
            }
        );

        // A card arrives expanded, so its to-do rows are on screen and in the
        // way by default — this is the ordinary state of a used canvas, not a
        // contrived one.
        for (const text of CIRCUIT.childTodos) {
            // eslint-disable-next-line no-await-in-loop
            await addTodo(page, headers, projectId, text, child.id);
        }

        await openProject(page, projectId);

        const targetLayer = page.getByRole('region', { name: CIRCUIT.bottomLayer });
        const childCard = sequenceCard(page, CIRCUIT.child);
        const todoRow = childCard.locator('.todo-item').first();

        await expect(todoRow).toBeVisible();

        const grip = sequenceCard(page, CIRCUIT.parent).getByRole('button', {
            name: `Move ${CIRCUIT.parent} to another layer`,
        });

        // Straight onto a to-do row nested inside the target card: the smallest
        // droppable under the pointer, and one that belongs to the other drag.
        await dragOnto(page, grip, todoRow);

        // The drop resolves to the card the row is in, and a card dropped on a
        // card takes its place (spec section 9) — so the moved sequence is now
        // first in the bottom layer, ahead of the card it was aimed at.
        const moved = targetLayer.locator(`li[data-sequence-title="${CIRCUIT.parent}"]`);

        await expect(moved).toBeVisible();
        await expect(targetLayer.locator('li[data-sequence-title]').first()).toHaveAttribute(
            'data-sequence-title',
            CIRCUIT.parent
        );

        // The parent came down into its own child's layer, so the edge between
        // them no longer points downward and is gone, with the notice saying so.
        await expect(page.locator('.project-toast--notice')).toContainText(
            '1 connection was removed'
        );
        await expect(page.locator('svg.edge-layer path.edge')).toHaveCount(0);
    });

    test('files a to-do dropped on a sequence card’s header into that card', async ({ page }) => {
        const { projectId, headers, parent } = await seedPlan(
            page,
            todoOntoCardCredentials,
            'Header drop'
        );

        await addTodo(page, headers, projectId, LOOSE_TODO);

        await openProject(page, projectId);

        const card = sequenceCard(page, parent.title);
        const header = card.locator('.sequence-card-header');
        const handle = page.getByRole('button', { name: `Drag “${LOOSE_TODO}”` });

        await expect(page.getByRole('button', { name: 'Unorganized (1)' })).toBeVisible();

        // The header is the band above `.sequence-card-body`, so it is covered
        // by the card's own sortable droppable and by nothing the to-do drag
        // owns. A person aiming at "that card" aims here as readily as at its
        // list, and the drop has to file the to-do rather than vanish.
        await dragOnto(page, handle, header);

        await expect(card.locator('.sequence-spotlight-text')).toContainText(LOOSE_TODO);
        await expect(page.getByRole('button', { name: 'Unorganized (0)' })).toBeVisible();
    });
});
