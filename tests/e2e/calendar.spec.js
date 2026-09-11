const { test, expect } = require('@playwright/test');

const { newCredentials, seedPlan, addTodo, dragOnto } = require('./helpers');

// One flow, chosen because it is the only one that exercises the whole feature
// at once: the cascade, the spill, and the day it creates.
//
// Everything narrower is already covered — the arithmetic by the unit suite, the
// endpoints by the integration suite, the components by their own tests. What
// none of those can prove is that a pointer dragged across a real layout produces
// the schedule the arithmetic says it should.

/** A signed-in account whose frontier offers exactly `Refresh tokens`. */
const seedCalendarWork = async (page) => {
    const { projectId, headers, parent } = await seedPlan(page, newCredentials(), 'Auth rewrite');

    await addTodo(page, headers, projectId, 'Refresh tokens', parent.id);

    return { projectId };
};

/**
 * The grip of a pool row, which is the only part of it `@dnd-kit` listens on.
 *
 * `PanelTodoRow` spreads the listeners onto `.panel-todo-grip` alone, so a
 * pointerdown anywhere else in the row — the text, say — starts no drag at all.
 * Scoped from the row rather than by class alone so the grip is addressed as the
 * one belonging to *this* to-do.
 */
const poolGrip = (page, text) =>
    page.locator('.panel-todo-row').filter({ hasText: text }).getByRole('button');

/**
 * Opens the calendar with one empty day the server has actually stored.
 *
 * The column paints from the optimistic dispatch, while `POST /calendar/days` is
 * still in flight, and a day with no real id yet is not a drop target — so a
 * drag started on the strength of the column alone lands on nothing. The × is
 * the reconcile made visible: `DayColumn` renders it only once the day has been
 * named, which is exactly when the drop targets come back.
 */
const openCalendarWithADay = async (page) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Add the first day' }).click();
    await expect(page.getByRole('region', { name: 'Day 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Day 1' })).toBeAttached();
};

test.describe('Calendar', () => {
    test('books work from the pool, grows it past midnight, and spills it into a new day', async ({
        page,
    }) => {
        // Arrange
        await seedCalendarWork(page);
        await openCalendarWithADay(page);

        const column = page.getByRole('region', { name: 'Day 1' });

        // Act — open the project card and drag its next step into the day
        await page.getByRole('button', { name: /Auth rewrite/ }).click();
        await dragOnto(page, poolGrip(page, 'Refresh tokens'), column);

        // Assert — booked, and gone from the pool's count
        await expect(column.getByText('Refresh tokens')).toBeVisible();
        await expect(page.getByRole('button', { name: /Auth rewrite/ })).toContainText('0');

        // Act — grow the bottom edge far enough that the booking cannot fit in
        // the day it is in. The raw mouse moves are deliberate: this is the one
        // gesture that is not a dnd-kit drag (Task 26).
        const bottomEdge = column.getByRole('separator', { name: /Change how long/ });
        const box = await bottomEdge.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 2000, { steps: 20 });
        await page.mouse.move(box.x + box.width / 2, box.y + 2000);
        await page.mouse.up();

        // Assert — a second day was created and the work moved into it
        await expect(page.getByRole('region', { name: 'Day 2' })).toBeVisible();
        await expect(
            page.getByRole('region', { name: 'Day 2' }).getByText('Refresh tokens')
        ).toBeVisible();

        // Act — let the save land, then reload to prove it was stored rather
        // than only drawn. Both assertions above are satisfied by the optimistic
        // dispatch, so navigating on them alone would tear down the `PUT` they
        // are meant to be proving; the new day's × says the server has named it.
        await expect(page.getByRole('button', { name: 'Delete Day 2' })).toBeAttached();
        await page.reload();

        // Assert
        await expect(
            page.getByRole('region', { name: 'Day 2' }).getByText('Refresh tokens')
        ).toBeVisible();
    });

    test('dragging a booking back to the panel unschedules it', async ({ page }) => {
        // Arrange
        await seedCalendarWork(page);
        await openCalendarWithADay(page);

        const column = page.getByRole('region', { name: 'Day 1' });

        await page.getByRole('button', { name: /Auth rewrite/ }).click();

        // The card paints from the optimistic dispatch, so it says nothing about
        // whether the booking exists on the server yet — and the `DELETE` below
        // would be answered `Booking not found` if it overtook the `PUT` that
        // creates it. A booking has no × of its own to wait on the way a day
        // does, so the response itself is the signal.
        const booked = page.waitForResponse(
            (response) =>
                response.request().method() === 'PUT' &&
                response.url().includes('/calendar/items')
        );

        await dragOnto(page, poolGrip(page, 'Refresh tokens'), column);
        await expect(column.getByText('Refresh tokens')).toBeVisible();
        await booked;

        // Act
        await dragOnto(
            page,
            page.getByRole('button', { name: 'Move “Refresh tokens”' }),
            page.getByRole('region', { name: 'Projects' })
        );

        // Assert — back in the pool, and the count restored
        await expect(column.getByText('Refresh tokens')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Auth rewrite/ })).toContainText('1');
    });
});
