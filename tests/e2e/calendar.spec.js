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

/** Signs in through the existing seed path and stores the requested empty days. */
const signInWithCalendar = async (page, { days }) => {
    await seedPlan(page, newCredentials(), 'Calendar notes');
    await page.goto('/calendar');

    for (let index = 0; index < days; index += 1) {
        const addButtonName = index === 0 ? 'Add the first day' : 'Add a day';

        // Sequential on purpose: the next + stays disabled until this day has
        // its server id, which the delete control makes visible.
        // eslint-disable-next-line no-await-in-loop
        await page.getByRole('button', { name: addButtonName }).click();
        // eslint-disable-next-line no-await-in-loop
        await expect(page.getByRole('button', { name: `Delete Day ${index + 1}` })).toBeAttached();
    }
};

const NOTE_PRESS_FRACTION = 0.5;
const NOTE_DRAG_START_FRACTION = 1 / 3;
const NOTE_DRAG_END_FRACTION = 2 / 3;

/** A viewport coordinate inside the visible part of the first notes plane. */
const visibleNotePlanePoint = async (page, verticalFraction = NOTE_PRESS_FRACTION) => {
    const plane = page.locator('.note-plane-surface').first();
    const scrollViewport = page.locator('.day-column-scroll').first();
    const [planeBox, viewportBox] = await Promise.all([
        plane.boundingBox(),
        scrollViewport.boundingBox(),
    ]);

    if (!planeBox || !viewportBox) {
        throw new Error('The notes plane and its scroll viewport must be visible');
    }

    const visibleTop = Math.max(planeBox.y, viewportBox.y);
    const visibleBottom = Math.min(
        planeBox.y + planeBox.height,
        viewportBox.y + viewportBox.height
    );

    if (visibleBottom <= visibleTop) {
        throw new Error('The notes plane has no visible area inside its scroll viewport');
    }

    return {
        x: planeBox.x + planeBox.width / 2,
        y: visibleTop + (visibleBottom - visibleTop) * verticalFraction,
    };
};

const firstDay = (page) => page.getByRole('region', { name: 'Day 1', exact: true });

const notePopover = (page) => page.locator('.note-popover');

const noteTextbox = (page) =>
    notePopover(page).getByRole('textbox', { name: 'Note', exact: true });

/** Presses the notes plane, names the note, and saves it. */
const createNote = async (page, text) => {
    const point = await visibleNotePlanePoint(page);

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();

    await noteTextbox(page).fill(text);
    await notePopover(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(firstDay(page).getByText(text, { exact: true })).toBeVisible();
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

test.describe('calendar notes', () => {
    test('a press on the notes plane creates a note', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });

        // Act — press and release without moving: a default 30-minute block
        const point = await visibleNotePlanePoint(page);
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.up();

        await noteTextbox(page).fill('train to Leeds');
        await notePopover(page).getByRole('button', { name: 'Save', exact: true }).click();

        // Assert
        await expect(firstDay(page).getByText('train to Leeds', { exact: true })).toBeVisible();
    });

    test('a press and drag covers the range it was dragged over', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        const start = await visibleNotePlanePoint(page, NOTE_DRAG_START_FRACTION);
        const end = await visibleNotePlanePoint(page, NOTE_DRAG_END_FRACTION);

        // Act
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 10 });
        await page.mouse.up();

        // Assert — the popover reports a range longer than the default block
        await expect(notePopover(page).locator('.note-popover-range')).not.toHaveText(
            /:00–.*:30$/
        );

        await noteTextbox(page).fill('deep work');
        await notePopover(page).getByRole('button', { name: 'Save', exact: true }).click();
        await expect(firstDay(page).getByText('deep work', { exact: true })).toBeVisible();
    });

    test('a note survives a reload', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        await createNote(page, 'on call');

        // Act
        await page.reload();

        // Assert
        await expect(firstDay(page).getByText('on call', { exact: true })).toBeVisible();
    });

    test('a note can be renamed and deleted', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        await createNote(page, 'on call');

        // Act — rename
        await firstDay(page).getByRole('button', { name: /^on call,/ }).click();
        await noteTextbox(page).fill('on call (swapped)');
        await notePopover(page).getByRole('button', { name: 'Save', exact: true }).click();

        // Assert
        await expect(firstDay(page).getByText('on call (swapped)', { exact: true })).toBeVisible();

        // Act — delete
        await firstDay(page)
            .getByRole('button', { name: /^on call \(swapped\),/ })
            .click();
        await notePopover(page).getByRole('button', { name: 'Delete', exact: true }).click();

        // Assert
        await expect(firstDay(page).getByText('on call (swapped)', { exact: true })).toHaveCount(0);
    });

    test('deleting a day takes its notes with no prompt about them', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        await createNote(page, 'context');

        // Act
        await firstDay(page).getByRole('button', { name: 'Delete Day 1', exact: true }).click();

        // Assert — an empty day deletes outright; no dialog mentions notes
        await expect(page.getByText('context', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('dialog').filter({ hasText: /note/i })).toHaveCount(0);
    });

    test('the fifth overlapping note is refused', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });

        for (const name of ['one', 'two', 'three', 'four']) {
            // eslint-disable-next-line no-await-in-loop
            await createNote(page, name);
        }

        // Act — a fifth press over the same minute
        const point = await visibleNotePlanePoint(page);

        await page.mouse.move(point.x, point.y);
        await page.mouse.down();

        // Assert — refused while the pointer is still down
        await expect(page.locator('.note-draft--refused')).toBeVisible();

        await page.mouse.up();
        await expect(noteTextbox(page)).toHaveCount(0);
    });

    test('two days fit and the third scrolls', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 3 });
        const strip = page.locator('.calendar-strip');

        // Assert — there is more strip than there is room for it
        const overflow = await strip.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
        expect(overflow).toBe(true);

        // ...and two columns are what fits
        const stripWidth = await strip.evaluate((node) => node.clientWidth);
        const columnWidth = await page
            .locator('.day-column')
            .first()
            .evaluate((node) => node.getBoundingClientRect().width);

        expect(columnWidth * 2).toBeLessThanOrEqual(stripWidth + 1);
        expect(columnWidth * 3).toBeGreaterThan(stripWidth);
    });
});
