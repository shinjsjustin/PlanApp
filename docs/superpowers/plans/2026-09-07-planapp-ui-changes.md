# PlanApp UI Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven UI changes in `docs/superpowers/specs/2026-09-07-planapp-ui-changes-design.md` — quieter home cards, a wider canvas that scrolls instead of squishing, distinguishable add buttons, and sequences that can be dragged between layers.

**Architecture:** An Express + MySQL API under `src/`, and a Create React App client under `src/client/`. The client holds the whole project graph in a reducer and mutates it optimistically: every verb applies its change locally, sends the request, and rolls the whole cascade back on failure. Derived values (a sequence's status, the ready frontier) are computed from the graph on every render rather than stored, and the two derivations both runtimes need are hand-maintained twins kept honest by a shared fixture table.

**Tech Stack:** Node 18+, Express 4, MySQL 8 (mysql2), Zod 4, React 18, react-router-dom 6, @dnd-kit/core 6 + @dnd-kit/sortable 10, Jest 29 + supertest (server), react-scripts/Jest + Testing Library (client), Playwright (E2E).

---

## Before you start

**Read these two files first.** Nothing in this plan will make sense without them:

- `docs/superpowers/specs/2026-09-07-planapp-ui-changes-design.md` — the spec this implements
- `AGENTS.md` — the repo's own conventions

**Test commands** (run from the repo root unless stated):

| What | Command |
|---|---|
| Server unit + integration | `DB_NAME=planapp_test npm test` |
| One server test file | `DB_NAME=planapp_test npx jest tests/unit/frontier.test.js` |
| One server test by name | `DB_NAME=planapp_test npx jest -t "skips a blocked to-do"` |
| Client (all) | `npm run test:client` |
| One client test file | `cd src/client && CI=true npx react-scripts test --testPathPattern=graph.frontier` |
| E2E | `DB_NAME=planapp_test npm run test:e2e` |
| Everything | `DB_NAME=planapp_test npm run test:all` |

Integration tests need a real MySQL schema whose name ends in `_test`. `tests/helpers/db.js` refuses to run otherwise. If `planapp_test` does not exist: `mysql -u <user> -p -e "CREATE DATABASE planapp_test"` then `mysql -u <user> -p planapp_test < src/db/schema.sql`.

**Two conventions this codebase holds to, which you must not break:**

1. **`src/lib/frontier.js` and `src/client/src/lib/graph.js` are twins.** Same logic, two module systems (CommonJS vs ESM). Both are tested against `src/shared/frontierFixtures.json`. Change one, change the other, in the same commit.
2. **`--canvas-gutter: 3rem` in `Project.css` and `CANVAS_GUTTER_WIDTH = 48` in `lib/geometry.js` are the same number written twice.** Neither can read the other. No task here changes it; if you find yourself wanting to, stop and reconsider.

**Commit style:** `<type>: <description>` — `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. No attribution trailer (disabled globally).

---

## File Structure

**Tasks 1–2 — CSS only**
- Modify: `src/client/src/components/Styling/Project.css`

**Task 3 — the add-layer divider**
- Modify: `src/client/src/components/Project/LayerRow.js`, `src/client/src/components/Styling/Project.css`
- Test: `src/client/src/components/Project/LayerRow.test.js`

**Tasks 4–5 — per-layer scrolling and edge integrity**
- Modify: `src/client/src/components/Styling/Project.css`, `src/client/src/components/Styling/SequenceCard.css`, `src/client/src/lib/geometry.js`, `src/client/src/hooks/useNodePositions.js`
- Test: `src/client/src/lib/geometry.test.js`

**Task 6 — blocked work off home cards**
- Modify: `src/lib/frontier.js`, `src/client/src/lib/graph.js`, `src/shared/frontierFixtures.json`

**Task 7 — home card drop-down**
- Modify: `src/client/src/components/Projects/ProjectCard.js`, `src/client/src/components/Styling/Projects.css`
- Test: `src/client/src/components/Projects/ProjectCard.test.js`

**Task 8 — the notice channel**
- Modify: `src/client/src/state/projectActions.js`, `src/client/src/state/projectReducer.js`, `src/client/src/hooks/useProjectGraph.js`, `src/client/src/components/Project/ProjectPage.js`, `src/client/src/components/Styling/Project.css`
- Test: `src/client/src/state/projectReducer.test.js`

**Tasks 9–10 — the server move**
- Create: `src/lib/assertLayerInProject.js`
- Modify: `src/db/repositories/sequencesRepo.js`, `src/routes/sequences.js`
- Test: `tests/integration/sequenceMoveRoute.test.js` (new)

**Tasks 11–12 — the client drag**
- Modify: `src/client/src/lib/dragDrop.js`, `src/client/src/state/cascades.js`, `src/client/src/state/DragContext.js`, `src/client/src/components/Project/DragDropArea.js`, `src/client/src/components/Project/SequenceCard.js`, `src/client/src/components/Project/LayerRow.js`, `src/client/src/hooks/useProjectMutations.js`
- Test: `src/client/src/lib/dragDrop.test.js`, `src/client/src/state/cascades.sequences.test.js`

**Task 13 — E2E and spec upkeep**
- Modify: `tests/e2e/criticalFlow.spec.js`, `docs/superpowers/specs/2026-08-27-planapp-design.md`

Tasks 1–7 are independent of each other and of 8–12. Task 8 must land before Task 12. Tasks 9 → 10 → 11 → 12 are strictly ordered.

---

## Task 1: Layer hover shows only the delete ×

Spec section 4. Pure CSS, no test — the assertion is visual, and Task 13 covers it in the browser.

**Files:**
- Modify: `src/client/src/components/Styling/Project.css:315–341`

- [ ] **Step 1: Remove the hover tint and its transition**

In `src/client/src/components/Styling/Project.css`, find the `.layer-row` block. Replace this:

```css
.layer-row {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    /* Enough to keep the hover tint off the title and the cards, and no more.
     * The negative left margin puts the title back on the canvas's left edge, so
     * the tint is inset padding rather than a shift in the layout. */
    margin-left: -0.5rem;
    padding: 0.35rem 0.5rem 0.5rem;
    border-radius: 8px;
    background: transparent;
    transition: background-color 120ms ease;
}

/* The one moment a layer draws itself: while the pointer is in it. At rest it is
 * page; on hover it is a band, which is what gives the delete × revealed at its
 * far corner something to belong to. A shade off the page ground, so it registers
 * as an area without becoming a box again. */
.layer-row:hover {
    background: #f2f3f4;
}

@media (prefers-reduced-motion: reduce) {
    .layer-row {
        transition: none;
    }
}
```

with this:

```css
/* A layer never draws itself, hovered or not. The band used to tint on hover to
 * give the revealed × something to belong to; the tint painted over the edges
 * running behind the row, which are the one thing on this canvas worth not
 * covering. The × is reveal enough.
 *
 * The padding and the negative left margin stay: they are the box the delete
 * bubble pins its corner to (`--delete-bubble-top`/`--delete-bubble-right`
 * below), not leftovers of the tint. */
.layer-row {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    margin-left: -0.5rem;
    padding: 0.35rem 0.5rem 0.5rem;
    border-radius: 8px;
    background: transparent;
}
```

Leave the `.layer-row > .delete-bubble` block that follows exactly as it is.

- [ ] **Step 2: Verify nothing else referenced the removed rule**

Run: `grep -rn "layer-row:hover\|f2f3f4" src/client/src`

Expected: no output.

- [ ] **Step 3: Run the client suite to confirm nothing regressed**

Run: `npm run test:client`

Expected: PASS. No test asserts on this rule; this is a guard against an unrelated break.

- [ ] **Step 4: Commit**

```bash
git add src/client/src/components/Styling/Project.css
git commit -m "fix: stop the layer hover tint covering the edges behind it"
```

---

## Task 2: Full-bleed project page

Spec section 5. Pure CSS.

**Files:**
- Modify: `src/client/src/components/Styling/Project.css:20–41`, `:108–124`

- [ ] **Step 1: Make the page fill the window**

Replace the `.project-page` block:

```css
.project-page {
    /* The content column, as numbers rather than as a `max-width` alone: the
     * unorganized panel is taken out of the flow and has to line itself up with
     * an edge it is no longer inside. */
    --page-max: 1400px;
    --page-pad: 1.5rem;

    /* The floating panel's own box, kept here because it measures itself against
     * the content column above and has to read both from one place. */
    --panel-width: 16rem;
    /* The tallest it may grow before its list starts scrolling. The second term
     * keeps it clear of the page header on a short window. */
    --panel-max-height: min(26rem, calc(100vh - 12rem));

    max-width: var(--page-max);
    margin: 0 auto;
    padding: var(--page-pad) var(--page-pad) 4rem;
    /* The ground runs to the physical edges of the screen, so on a notched
     * device the content has to be held off them itself. */
    padding-right: max(var(--page-pad), env(safe-area-inset-right));
    padding-left: max(var(--page-pad), env(safe-area-inset-left));
}
```

with:

```css
/* The canvas wants every pixel of the window: a layer holding six sequences has
 * nowhere to put them, and a centred 1400px column was giving away the margins
 * on either side to nothing. There is no content column any more — the page is
 * the window, held off its physical edges by `--page-pad` and no more.
 *
 * `--page-max` is gone with it. The unorganized panel used to reconstruct the
 * margin from that number to park itself beside the content; with no margin to
 * park in, it is honestly an overlay at every width, which is what its collapsed
 * pill was always for. */
.project-page {
    --page-pad: 0.75rem;

    /* The floating panel's own box, kept here because the panel is out of the
     * flow and has to read its numbers from somewhere. */
    --panel-width: 16rem;
    /* The tallest it may grow before its list starts scrolling. The second term
     * keeps it clear of the page header on a short window. */
    --panel-max-height: min(26rem, calc(100vh - 12rem));

    padding: var(--page-pad) var(--page-pad) 4rem;
    /* The ground runs to the physical edges of the screen, so on a notched
     * device the content has to be held off them itself. */
    padding-right: max(var(--page-pad), env(safe-area-inset-right));
    padding-left: max(var(--page-pad), env(safe-area-inset-left));
}
```

- [ ] **Step 2: Simplify the panel's left edge**

In the `.unorganized-panel` block, replace:

```css
    bottom: var(--page-pad);
    left: max(
        var(--page-pad),
        calc((100vw - var(--page-max)) / 2 - var(--panel-width) - 0.75rem)
    );
```

with:

```css
    bottom: var(--page-pad);
    /* Simply the page's own inset. There is no margin beside the content column
     * to park in any more, because there is no content column. */
    left: var(--page-pad);
```

Then, in the comment block directly above `.unorganized-panel`, replace this paragraph:

```
 * Horizontally it takes the margin beside the content column when the window is
 * wide enough to have one, so on a large screen it sits alongside the page and
 * covers nothing; on a narrower one it runs out of margin and genuinely floats
 * over the canvas, which is what the collapse is for. Being out of the flow, it
 * has to reconstruct that edge from the same numbers `.project-page` lays itself
 * out with.
```

with:

```
 * It floats over the bottom-left of the canvas at every window width, since the
 * page went full-bleed and there is no margin beside a content column to sit in
 * any more. That is what the collapse is for: folded, it is a pill in the corner
 * and the canvas under it is whole again.
```

- [ ] **Step 3: Check no other rule still reads `--page-max`**

Run: `grep -rn "page-max" src/client/src`

Expected: no output.

- [ ] **Step 4: Run the client suite**

Run: `npm run test:client`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Styling/Project.css
git commit -m "feat: give the project page the full width of the window"
```

---

## Task 3: Distinguish the add-layer and add-sequence buttons

Spec section 6. The add-layer button stops being a circle in the gutter and becomes a full-width dashed divider; add-sequence keeps its circle. `--canvas-gutter` stays 3rem, so `geometry.js` is untouched.

**Files:**
- Modify: `src/client/src/components/Project/LayerRow.js:107–118`
- Modify: `src/client/src/components/Styling/Project.css` (add after `.canvas-gutter-button`)
- Test: `src/client/src/components/Project/LayerRow.test.js`

- [ ] **Step 1: Write the failing test**

Open `src/client/src/components/Project/LayerRow.test.js`, read the top of the file to see how it renders a `LayerRow` (it has a harness that supplies the project context), and add this test in the same style, inside the existing top-level `describe`:

```javascript
test('renders the add-layer control as a divider rather than a gutter button', () => {
    // Arrange & Act
    renderLayerRow();

    // Assert — the two add controls are told apart by class, not by their glyph.
    const addLayer = screen.getByRole('button', { name: /add a layer below/i });
    const addSequence = screen.getByRole('button', { name: /add a sequence to/i });

    expect(addLayer).toHaveClass('layer-divider');
    expect(addSequence).toHaveClass('canvas-gutter-button');
    expect(addLayer).not.toHaveClass('canvas-gutter-button');
});
```

If the existing file's render helper is not named `renderLayerRow`, use whatever it is called — match the file, do not rename anything.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=LayerRow`

Expected: FAIL — `Expected element to have class: layer-divider`, because the button currently carries `canvas-gutter-button`.

- [ ] **Step 3: Replace the footer gutter with a divider**

In `src/client/src/components/Project/LayerRow.js`, replace:

```jsx
            <div className="canvas-layer-footer">
                <div className="canvas-gutter">
                    <button
                        type="button"
                        className="canvas-gutter-button"
                        aria-label={`Add a layer below ${layer.title}`}
                        onClick={() => addLayer(layer.id)}
                    >
                        +
                    </button>
                </div>
            </div>
```

with:

```jsx
            {/* A band-shaped control, because it makes a band. The add-sequence
                button above is a circle, because it makes a card. The two used
                to be the same + a few pixels apart in the same column, which
                said nothing about which was which. */}
            <div className="canvas-layer-footer">
                <button
                    type="button"
                    className="layer-divider"
                    aria-label={`Add a layer below ${layer.title}`}
                    onClick={() => addLayer(layer.id)}
                >
                    <span className="layer-divider-glyph" aria-hidden="true">
                        +
                    </span>
                </button>
            </div>
```

Then update the file's header comment. Replace this sentence:

```
// is a real column, rendered whether or not it holds a button, because phase 7
// routes skip-edges down it — the add-sequence button pins to the right of the
// row with `margin-left: auto`, and the add-layer button sits below it in the
// same column.
```

with:

```
// is a real column, rendered whether or not it holds a button, because phase 7
// routes skip-edges down it — the add-sequence button pins to the right of the
// row with `margin-left: auto`. The add-layer button is not in that column at
// all: it is the full-width divider below the row, shaped like the band it
// creates rather than like the card the other button creates.
```

- [ ] **Step 4: Style the divider**

In `src/client/src/components/Styling/Project.css`, immediately after the `.canvas-gutter-button:hover, .canvas-gutter-button:focus-visible` rule, add:

```css
/* -- The add-layer divider -------------------------------------------------
 *
 * Shaped like what it makes. A layer is a band across the canvas, so the control
 * that inserts one is a band across the canvas — where the add-sequence button
 * beside the row is a circle, because a sequence is a card.
 *
 * Quiet at rest so a canvas of six layers is not five dashed rules shouting for
 * attention, and firm the moment it is pointed at or focused.
 */
.layer-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    /* Tall enough to aim at without pushing the layers apart. */
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-top: 1px dashed #dcdcdc;
    background: none;
    color: #b4b4b4;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
}

.layer-divider:hover,
.layer-divider:focus-visible {
    border-top-color: #7a7a7a;
    color: #333;
}

.layer-divider:focus-visible {
    outline: 2px solid #4a7bd0;
    outline-offset: 2px;
}

/* The glyph sits on the rule rather than under it, on the page's own ground so
 * the dashes do not run through it. */
.layer-divider-glyph {
    margin-top: -0.75rem;
    padding: 0 0.4rem;
    background: var(--bg-page, #f7f7f8);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=LayerRow`

Expected: PASS, including every test that was already in the file.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Project/LayerRow.js \
        src/client/src/components/Project/LayerRow.test.js \
        src/client/src/components/Styling/Project.css
git commit -m "feat: shape the add-layer control like the band it creates"
```

---

## Task 4: Layers scroll horizontally instead of squishing

Spec section 7, first half. CSS only — Task 5 keeps the edges honest.

**Files:**
- Modify: `src/client/src/components/Styling/Project.css:394–403`
- Modify: `src/client/src/components/Styling/SequenceCard.css:70`

- [ ] **Step 1: Make the sequence row a horizontal scroller**

In `src/client/src/components/Styling/Project.css`, replace:

```css
/* The row itself: cards spaced evenly, growing with whichever one is open. */
.layer-row-sequences {
    display: flex;
    align-items: flex-start;
    justify-content: space-evenly;
    gap: 1rem;
    list-style: none;
    margin: 0;
    padding: 0;
}
```

with:

```css
/* The row itself: cards at their full width, left to right, scrolling sideways
 * when there are more than fit.
 *
 * They used to be spread with `space-evenly` and allowed to shrink, which meant
 * a layer holding six sequences squeezed all six into unreadable slivers rather
 * than admitting it had run out of room. Scrolling is the honest answer: the
 * cards keep their size and the row keeps its place, and the add-sequence button
 * is outside this box so it stays reachable however far the row has been pushed.
 *
 * `padding-bottom` reserves the scrollbar's height so a row that gains one does
 * not shove the divider below it down by a few pixels. */
.layer-row-sequences {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 1rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    list-style: none;
    margin: 0;
    padding: 0 0 0.25rem;
}
```

- [ ] **Step 2: Stop the cards shrinking**

In `src/client/src/components/Styling/SequenceCard.css`, inside the `.sequence-card` block, replace:

```css
    /* 460px in the mock; on the canvas a card shares a layer row with its
     * siblings, so it takes the design's floor rather than its width and grows
     * into whatever the row can spare. */
    flex: 0 1 25rem;
    min-width: 0;
```

with:

```css
    /* 460px in the mock; on the canvas a card takes the design's floor. It no
     * longer shrinks to fit its row — the row scrolls sideways instead, so a
     * layer holding six sequences shows six readable cards rather than six
     * slivers. `min-width` matches for the same reason: without it a flex item
     * can still be squeezed below its basis. */
    flex: 0 0 25rem;
    min-width: 25rem;
```

- [ ] **Step 3: Run the client suite**

Run: `npm run test:client`

Expected: PASS. jsdom has no layout, so no existing test can see this; the run is a guard.

- [ ] **Step 4: Commit**

```bash
git add src/client/src/components/Styling/Project.css \
        src/client/src/components/Styling/SequenceCard.css
git commit -m "feat: scroll a crowded layer sideways instead of squishing its cards"
```

---

## Task 5: Keep the edges honest when a row is scrolled

Spec section 7, second half. Two problems: a card moving inside a scrolled row does not resize the canvas, so nothing re-measures; and an edge to a card scrolled out of sight would draw across neighbouring bands.

**Files:**
- Modify: `src/client/src/lib/geometry.js:154–182`
- Modify: `src/client/src/hooks/useNodePositions.js:82–119`
- Test: `src/client/src/lib/geometry.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/client/src/lib/geometry.test.js` as a new `describe` at the end of the file:

```javascript
describe('edgePaths with clipped nodes', () => {
    const node = (x, y, layerPosition, isClipped = false) => ({
        dot: { x, y: y + 40 },
        top: { x, y },
        layerPosition,
        isClipped,
    });

    test('draws an edge when neither end is clipped', () => {
        // Arrange
        const edges = [{ id: 1, parentId: 1, childId: 2 }];
        const nodes = { 1: node(100, 0, 0), 2: node(100, 200, 1) };

        // Act
        const paths = edgePaths({ edges, nodes, gutterX: 500 });

        // Assert
        expect(paths).toHaveLength(1);
    });

    test('leaves out an edge whose parent is scrolled out of its row', () => {
        // Arrange
        const edges = [{ id: 1, parentId: 1, childId: 2 }];
        const nodes = { 1: node(100, 0, 0, true), 2: node(100, 200, 1) };

        // Act
        const paths = edgePaths({ edges, nodes, gutterX: 500 });

        // Assert
        expect(paths).toEqual([]);
    });

    test('leaves out an edge whose child is scrolled out of its row', () => {
        // Arrange
        const edges = [{ id: 1, parentId: 1, childId: 2 }];
        const nodes = { 1: node(100, 0, 0), 2: node(100, 200, 1, true) };

        // Act
        const paths = edgePaths({ edges, nodes, gutterX: 500 });

        // Assert
        expect(paths).toEqual([]);
    });

    test('a clipped skip edge does not consume a gutter lane', () => {
        // Arrange — two skip edges over the same rows; one end of the first is
        // clipped, so the second should take lane 0 rather than lane 1.
        const edges = [
            { id: 1, parentId: 1, childId: 3 },
            { id: 2, parentId: 2, childId: 4 },
        ];
        const nodes = {
            1: node(100, 0, 0, true),
            2: node(200, 0, 0),
            3: node(100, 400, 2),
            4: node(200, 400, 2),
        };

        // Act
        const [remaining] = edgePaths({ edges, nodes, gutterX: 500 });

        // Assert — lane 0 sits at gutterX exactly.
        expect(remaining.id).toBe(2);
        expect(remaining.d).toContain('500,');
    });
});
```

Make sure `edgePaths` is in the file's import list at the top; add it if it is not.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=geometry`

Expected: FAIL on the three clipped cases — `expect(received).toEqual([])` receiving one path — because `edgePaths` does not yet look at `isClipped`.

- [ ] **Step 3: Teach `edgePaths` to skip clipped endpoints**

In `src/client/src/lib/geometry.js`, replace the `drawable` assignment inside `edgePaths`:

```javascript
    const drawable = edges
        .map((edge) => ({ edge, parent: nodes[edge.parentId], child: nodes[edge.childId] }))
        .filter(({ parent, child }) => parent && child);
```

with:

```javascript
    const drawable = edges
        .map((edge) => ({ edge, parent: nodes[edge.parentId], child: nodes[edge.childId] }))
        .filter(({ parent, child }) => parent && child)
        .filter(({ parent, child }) => !parent.isClipped && !child.isClipped);
```

The filter is separate from the one above it on purpose: they answer different questions — "do we know where this is" and "can this be seen" — and running them together would read as one condition.

Then extend the doc comment above `edgePaths`. Replace:

```
 * `nodes` maps sequence id to `{ dot, top, layerPosition }`. An edge whose ends
 * are not both in it is left out rather than drawn from a guess: on the first
 * paint the layout effect has not measured anything yet, and a sequence removed
 * from the graph can outlive its edges by a render. Neither is a failure — it is
 * simply not knowing yet where to put the line, and inventing coordinates would
 * draw an edge somewhere that means nothing.
```

with:

```
 * `nodes` maps sequence id to `{ dot, top, layerPosition, isClipped }`. An edge
 * whose ends are not both in it is left out rather than drawn from a guess: on
 * the first paint the layout effect has not measured anything yet, and a
 * sequence removed from the graph can outlive its edges by a render. Neither is
 * a failure — it is simply not knowing yet where to put the line, and inventing
 * coordinates would draw an edge somewhere that means nothing.
 *
 * An edge with a CLIPPED end is left out for a different reason. Layer rows
 * scroll sideways, and a card pushed out of its row is still somewhere
 * geometrically — but this overlay is stretched across the whole canvas, not
 * clipped per row, so a line drawn to that card would cut across the bands
 * above and below it. `isClipped` is set by `useNodePositions`, which is the
 * only thing that can see a scroll position.
 *
 * Lanes are assigned after both filters, so an edge nobody can see does not
 * reserve a gutter lane and push a visible one sideways.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=geometry`

Expected: PASS, including every test that was already in the file.

- [ ] **Step 5: Commit the arithmetic**

```bash
git add src/client/src/lib/geometry.js src/client/src/lib/geometry.test.js
git commit -m "feat: leave out edges whose ends are scrolled out of their row"
```

- [ ] **Step 6: Measure the clip and re-measure on scroll**

In `src/client/src/hooks/useNodePositions.js`, add this helper directly below the existing `topEdgeOf` function:

```javascript
/**
 * The row a card scrolls inside, or null when it is not in one.
 *
 * Only `.layer-row-sequences` scrolls; everything else on the canvas is laid out
 * by the page. Selecting the class rather than walking up looking for a computed
 * `overflow` keeps this cheap enough to run for every card on every measure.
 */
const scrollerOf = (card) => card.closest('.layer-row-sequences');

/**
 * Whether a card has been scrolled out of the row that holds it.
 *
 * Horizontal only: rows scroll sideways and nothing scrolls them vertically.
 * A card with no scrolling ancestor is never clipped, which is the honest answer
 * for one rendered outside a row — better a line drawn than a card silently
 * dropped off the graph.
 */
const isClippedIn = (rect, scroller) => {
    if (!scroller) return false;

    const bounds = scroller.getBoundingClientRect();

    return rect.right <= bounds.left || rect.left >= bounds.right;
};
```

Then replace the body of `measure`'s `forEach`:

```javascript
        nodesRef.current.forEach(({ dot, card }, sequenceId) => {
            if (!dot || !card) return;

            nodes[sequenceId] = {
                dot: centreOf(dot.getBoundingClientRect(), origin),
                top: topEdgeOf(card.getBoundingClientRect(), origin),
            };
        });
```

with:

```javascript
        nodesRef.current.forEach(({ dot, card }, sequenceId) => {
            if (!dot || !card) return;

            const cardRect = card.getBoundingClientRect();

            nodes[sequenceId] = {
                dot: centreOf(dot.getBoundingClientRect(), origin),
                top: topEdgeOf(cardRect, origin),
                isClipped: isClippedIn(cardRect, scrollerOf(card)),
            };
        });
```

- [ ] **Step 7: Re-measure when any row scrolls**

Still in `useNodePositions.js`, replace the whole `useLayoutEffect`:

```javascript
    useLayoutEffect(() => {
        measure();

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const observer = new ResizeObserver(measure);
        observer.observe(canvas);

        return () => observer.disconnect();
    }, [measure, canvasRef, revision]);
```

with:

```javascript
    useLayoutEffect(() => {
        measure();

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const observer = new ResizeObserver(measure);
        observer.observe(canvas);

        /**
         * A card moving inside a scrolled row moves without resizing anything,
         * so the observer above never hears about it and every path to that card
         * goes stale.
         *
         * One listener covers every row. Scroll events do not bubble, but they
         * DO capture, so a capture-phase listener on the canvas catches each of
         * its descendants' scrollers — including rows that appear later, with no
         * per-row registration to keep in step.
         *
         * Coalesced onto a frame: a scroll fires far faster than a re-measure of
         * every card is worth doing, and `measure` calls `setState`.
         */
        let frame = null;
        const onScroll = () => {
            if (frame !== null) return;

            frame = requestAnimationFrame(() => {
                frame = null;
                measure();
            });
        };

        canvas.addEventListener('scroll', onScroll, true);

        return () => {
            observer.disconnect();
            canvas.removeEventListener('scroll', onScroll, true);
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [measure, canvasRef, revision]);
```

Finally, extend the file's header comment. After the paragraph beginning "The `ResizeObserver` is what makes that stay true", add:

```
// Scrolling is the one movement the observer cannot see. A layer row scrolls
// sideways when it holds more sequences than fit, and a card carried along by
// that has changed position without anything changing size. One capture-phase
// scroll listener on the canvas covers every row, and `isClipped` records which
// cards it pushed out of sight so `edgePaths` can leave their edges undrawn.
```

- [ ] **Step 8: Run the whole client suite**

Run: `npm run test:client`

Expected: PASS. `useNodePositions` has no test of its own — jsdom reports every rectangle as zero, which is why the arithmetic lives in `geometry.js` where it can be checked. Task 13 exercises this in a real browser.

- [ ] **Step 9: Commit**

```bash
git add src/client/src/hooks/useNodePositions.js
git commit -m "feat: re-measure edges when a layer row scrolls"
```

---

## Task 6: Blocked work off the home cards

Spec section 3. Both twins and the shared fixtures change together.

**Files:**
- Modify: `src/lib/frontier.js:63–100`
- Modify: `src/client/src/lib/graph.js:60–107`
- Modify: `src/shared/frontierFixtures.json`

- [ ] **Step 1: Write the failing fixtures**

In `src/shared/frontierFixtures.json`, add these three cases to the end of the `cases` array (mind the comma after the previous case's closing brace):

```json
    {
      "name": "skips a blocked to-do when choosing the next one",
      "sequences": [
        { "id": 1, "projectId": 1, "layerId": 10, "title": "Learn aerodynamics", "isBlocked": false, "position": 0 }
      ],
      "todos": [
        { "id": 101, "projectId": 1, "sequenceId": 1, "text": "Wait on the wind tunnel", "status": "blocked", "position": 0 },
        { "id": 102, "projectId": 1, "sequenceId": 1, "text": "Read up on lift", "status": "incomplete", "position": 1 }
      ],
      "edges": [],
      "expected": [{ "sequenceId": 1, "nextTodoId": 102 }]
    },
    {
      "name": "reports no next to-do when every outstanding one is blocked",
      "sequences": [
        { "id": 1, "projectId": 1, "layerId": 10, "title": "Learn aerodynamics", "isBlocked": false, "position": 0 }
      ],
      "todos": [
        { "id": 101, "projectId": 1, "sequenceId": 1, "text": "Read up on lift", "status": "complete", "position": 0 },
        { "id": 102, "projectId": 1, "sequenceId": 1, "text": "Wait on the wind tunnel", "status": "blocked", "position": 1 }
      ],
      "edges": [],
      "expected": [{ "sequenceId": 1, "nextTodoId": null }]
    },
    {
      "name": "leaves a blocked sequence out of the frontier entirely",
      "sequences": [
        { "id": 1, "projectId": 1, "layerId": 10, "title": "Learn aerodynamics", "isBlocked": true, "position": 0 },
        { "id": 2, "projectId": 1, "layerId": 10, "title": "Learn electronics", "isBlocked": false, "position": 1 }
      ],
      "todos": [
        { "id": 101, "projectId": 1, "sequenceId": 1, "text": "Read up on lift", "status": "incomplete", "position": 0 },
        { "id": 201, "projectId": 1, "sequenceId": 2, "text": "Learn to solder", "status": "incomplete", "position": 0 }
      ],
      "edges": [],
      "expected": [{ "sequenceId": 2, "nextTodoId": 201 }]
    }
```

- [ ] **Step 2: Run both suites to verify they fail**

Run: `DB_NAME=planapp_test npx jest tests/unit/frontier.test.js`

Expected: FAIL on all three new cases — the first returns `nextTodoId: 101`, the second `101`, the third includes sequence 1.

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=graph.frontier`

Expected: FAIL on the same three, for the same reasons. Both twins are wrong in exactly the same way, which is the point of the shared table.

- [ ] **Step 3: Fix the server twin**

In `src/lib/frontier.js`, replace `nextTodoOf`:

```javascript
/** The first to-do still to be done, by position, or null when there is none. */
const nextTodoOf = (sequence, todos) => {
    const open = todosOf(sequence, todos).filter((todo) => todo.status !== TODO_STATUS.complete);

    if (open.length === 0) return null;

    return [...open].sort(byPosition)[0];
};
```

with:

```javascript
/**
 * The first to-do that can actually be picked up, by position, or null when
 * there is none.
 *
 * Blocked is skipped along with complete. This answers "what do I do next", and
 * a to-do waiting on something outside the plan is no more an answer than a
 * finished one — a sequence whose every outstanding item is blocked has nothing
 * to offer and says so with a null.
 */
const nextTodoOf = (sequence, todos) => {
    const open = todosOf(sequence, todos).filter(
        (todo) => todo.status === TODO_STATUS.incomplete
    );

    if (open.length === 0) return null;

    return [...open].sort(byPosition)[0];
};
```

Then replace the filter inside `readyFrontier`:

```javascript
    return sequences
        .filter((sequence) => {
            if (isComplete(sequence.id)) return false;

            return parentsById.get(sequence.id).every(isComplete);
        })
```

with:

```javascript
    return sequences
        .filter((sequence) => {
            // Incomplete is the only status with anything to start in it:
            // complete is finished, and blocked is the manual "not this, not
            // yet" that the whole frontier exists to respect.
            if (statusById.get(sequence.id) !== SEQUENCE_STATUS.incomplete) return false;

            return parentsById.get(sequence.id).every(isComplete);
        })
```

Finally update the doc comment above `readyFrontier`. Replace:

```
 * "What can I actually work on right now?" — the sequences that are not complete
 * and whose every parent is, each paired with the next to-do to pick up.
 *
 * A sequence with no parents qualifies as soon as it is incomplete. A project
 * whose every sequence is complete has an empty frontier, and so does one with
 * no sequences at all; the two are told apart by the caller, not here.
```

with:

```
 * "What can I actually work on right now?" — the sequences that are incomplete
 * and whose every parent is complete, each paired with the next to-do to pick
 * up.
 *
 * Incomplete, not merely "not complete": a blocked sequence is held back by hand
 * and is not something to start, so it is left out along with the finished ones.
 *
 * A sequence with no parents qualifies as soon as it is incomplete. A project
 * whose every sequence is complete has an empty frontier, and so does one with
 * no sequences at all; the two are told apart by the caller, not here.
```

- [ ] **Step 4: Fix the client twin identically**

In `src/client/src/lib/graph.js`, replace:

```javascript
/** The first to-do still to be done, by position, or null when there is none. */
export const nextTodoOf = (sequence, todos) =>
    sortByPosition(todosOf(sequence, todos)).find(
        (todo) => todo.status !== TODO_STATUS.complete
    ) ?? null;
```

with:

```javascript
/**
 * The first to-do that can actually be picked up, by position, or null when
 * there is none.
 *
 * Blocked is skipped along with complete. This answers "what do I do next", and
 * a to-do waiting on something outside the plan is no more an answer than a
 * finished one — a sequence whose every outstanding item is blocked has nothing
 * to offer and says so with a null.
 */
export const nextTodoOf = (sequence, todos) =>
    sortByPosition(todosOf(sequence, todos)).find(
        (todo) => todo.status === TODO_STATUS.incomplete
    ) ?? null;
```

and replace the filter inside `readyFrontier`:

```javascript
    return sequences
        .filter((sequence) => {
            if (isComplete(sequence.id)) return false;

            return parentsById.get(sequence.id).every(isComplete);
        })
```

with:

```javascript
    return sequences
        .filter((sequence) => {
            // Incomplete is the only status with anything to start in it:
            // complete is finished, and blocked is the manual "not this, not
            // yet" that the whole frontier exists to respect.
            if (statusById.get(sequence.id) !== SEQUENCE_STATUS.incomplete) return false;

            return parentsById.get(sequence.id).every(isComplete);
        })
```

and update its doc comment. Replace:

```
 * "What can I actually work on right now?" — the sequences that are not complete
 * and whose every parent is, each paired with the next to-do to pick up.
 *
 * A sequence with no parents qualifies as soon as it is incomplete. A project
 * whose every sequence is complete has an empty frontier.
```

with:

```
 * "What can I actually work on right now?" — the sequences that are incomplete
 * and whose every parent is complete, each paired with the next to-do to pick
 * up.
 *
 * Incomplete, not merely "not complete": a blocked sequence is held back by hand
 * and is not something to start, so it is left out along with the finished ones.
 *
 * A sequence with no parents qualifies as soon as it is incomplete. A project
 * whose every sequence is complete has an empty frontier.
```

- [ ] **Step 5: Run both suites to verify they pass**

Run: `DB_NAME=planapp_test npx jest tests/unit/frontier.test.js`

Expected: PASS.

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=graph`

Expected: PASS. Note this pattern also runs `graph.test.js`, which covers `activeSequenceId`. If a test there fails because a sequence whose only open to-dos are blocked no longer carries the spotlight, that is the intended change described in spec section 3 — update the test's expectation and say so in its name. Do not revert the derivation.

- [ ] **Step 6: Run everything that reads the frontier**

Run: `DB_NAME=planapp_test npx jest tests/integration/projectsFrontierRoute.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/frontier.js src/client/src/lib/graph.js src/shared/frontierFixtures.json
git commit -m "feat: keep blocked work out of the ready frontier"
```

---

## Task 7: Home cards show a name, with a hover drop-down

Spec section 8.

**Files:**
- Modify: `src/client/src/components/Projects/ProjectCard.js:132–167`
- Modify: `src/client/src/components/Styling/Projects.css`
- Test: `src/client/src/components/Projects/ProjectCard.test.js`

- [ ] **Step 1: Write the failing test**

In `src/client/src/components/Projects/ProjectCard.test.js`, read the existing render helper and add these two tests in the same style:

```javascript
test('keeps the frontier in a reveal panel rather than on the collapsed face', () => {
    // Arrange & Act
    renderCard({
        project: {
            ...baseProject,
            frontier: [
                {
                    sequenceId: 7,
                    sequenceTitle: 'Learn electronics',
                    nextTodo: { id: 1, text: 'Learn to solder' },
                },
            ],
        },
    });

    // Assert — the title is the card's face; everything else is in the reveal,
    // which is present for a screen reader and hidden only by CSS.
    const title = screen.getByRole('link', { name: baseProject.title });
    expect(title.closest('.project-card-reveal')).toBeNull();

    const frontierEntry = screen.getByText('Learn electronics');
    expect(frontierEntry.closest('.project-card-reveal')).not.toBeNull();
});

test('keeps the progress line out of the collapsed face too', () => {
    // Arrange & Act
    renderCard();

    // Assert
    const progress = screen.getByText(/to-dos done/);
    expect(progress.closest('.project-card-reveal')).not.toBeNull();
});
```

If the existing helper is not `renderCard`/`baseProject`, use whatever the file already defines — match it, do not rename.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=ProjectCard`

Expected: FAIL — `expected null not to be null`, because there is no `.project-card-reveal` element yet.

- [ ] **Step 3: Move everything but the title into a reveal panel**

In `src/client/src/components/Projects/ProjectCard.js`, replace this block:

```jsx
            ) : (
                <div className="project-card-heading">
                    <h3 className="project-card-title">
                        <Link to={`/projects/${project.id}`}>{project.title}</Link>
                    </h3>
                    <p className="project-card-progress">
                        {`${project.completedTodoCount}/${project.todoCount} to-dos done`}
                    </p>
                </div>
            )}

            {project.description && <p className="project-card-description">{project.description}</p>}

            <FrontierBlock project={project} />
```

with:

```jsx
            ) : (
                <>
                    <div className="project-card-heading">
                        <h3 className="project-card-title">
                            <Link to={`/projects/${project.id}`}>{project.title}</Link>
                        </h3>
                    </div>

                    {/* Everything but the name. A grid of twenty projects is a
                        list of names to choose from; the detail is what you want
                        about the one you are pointing at, not about all twenty
                        at once.

                        It stays in the DOM and in the accessibility tree
                        throughout — the collapse is visual density, not
                        information hiding, so nothing here is `hidden`. Nothing
                        in it is interactive either, which is what makes it safe
                        to leave under the card-wide link overlay. */}
                    <div className="project-card-reveal">
                        <p className="project-card-progress">
                            {`${project.completedTodoCount}/${project.todoCount} to-dos done`}
                        </p>

                        {project.description && (
                            <p className="project-card-description">{project.description}</p>
                        )}

                        <FrontierBlock project={project} />
                    </div>
                </>
            )}
```

Note the description and the frontier moved *inside* the conditional: while the rename form is open there is no title to hover, and a drop-down hanging off a form would be nonsense.

Then update the component's header comment. Replace:

```
// A title block with the overall to-do progress, and a body listing the ready
// frontier — what can be started right now (spec section 4.8). The frontier
// itself is computed server-side, in `src/lib/frontier.js`; the card only
// renders what `GET /api/projects` hands it.
```

with:

```
// At rest the card is the project's name and nothing else. Hovering it — or
// tabbing to its title — drops a panel down holding the overall to-do progress,
// the description, and the ready frontier: what can be started right now (spec
// section 4.8). The frontier itself is computed server-side, in
// `src/lib/frontier.js`; the card only renders what `GET /api/projects` hands it.
//
// The reveal is entirely CSS, in `Styling/Projects.css`. Nothing here knows
// whether the panel is open, because nothing here needs to: it holds no controls
// and hides no information from a screen reader.
```

- [ ] **Step 4: Style the drop-down**

In `src/client/src/components/Styling/Projects.css`, replace the `.project-card-heading` block:

```css
.project-card-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding-right: 1.5rem;
}
```

with:

```css
.project-card-heading {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    /* The delete ×'s corner, reserved whether or not the bubble is showing, so
     * the title never reflows on hover. */
    padding-right: 1.5rem;
}
```

Then add this immediately before the `/* Dialog */` rules at the end of the file:

```css
/* -- The card's drop-down --------------------------------------------------
 *
 * A card at rest is a name. Everything else — the progress line, the
 * description, the ready frontier — hangs below it and appears while the card is
 * pointed at or its title is focused.
 *
 * It DROPS rather than expands: an in-flow panel would grow the card and reflow
 * every other card in its grid row on hover, so this is taken out of the flow and
 * overlays the cards below instead. `left`/`right` of -1px make it flush with the
 * card's border rather than inset by it.
 */
.project-card-reveal {
    position: absolute;
    top: 100%;
    left: -1px;
    right: -1px;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 1rem;
    border: 1px solid #4a7bd0;
    border-top: 0;
    border-radius: 0 0 8px 8px;
    background: #fff;
    box-shadow: 0 8px 16px -8px rgba(20, 40, 80, 0.25);
    opacity: 0;
    visibility: hidden;
    transition: opacity 150ms ease, visibility 150ms;
}

/*
 * Two ways in, like the delete bubble: hovering is the pointer's, and
 * `:focus-within` is the keyboard's — the title link already stretches over the
 * whole card, so tabbing to it opens the panel with no extra control.
 */
.project-card:hover .project-card-reveal,
.project-card:focus-within .project-card-reveal {
    padding: 0.75rem 1rem 1rem;
    opacity: 1;
    visibility: visible;
}

/*
 * An open panel has to sit above the cards beside and below it, and a grid item
 * cannot lift its own overlay without lifting itself.
 */
.project-card:hover,
.project-card:focus-within {
    z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
    .project-card-reveal {
        transition: none;
    }
}

/*
 * No hover to open on, so there is nothing to open: the panel is simply part of
 * the card. Absolute positioning has to go with it — a permanently-open overlay
 * would cover the card below it forever.
 */
@media (hover: none) {
    .project-card-reveal {
        position: static;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: none;
        box-shadow: none;
        opacity: 1;
        visibility: visible;
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=ProjectCard`

Expected: PASS, including every test already in the file. If an existing test asserted the progress line sits beside the title, update it to match the new structure and say so in its name.

- [ ] **Step 6: Run the whole client suite**

Run: `npm run test:client`

Expected: PASS. `ProjectsHome.test.js` renders real cards and may assert on frontier text; that text is still in the DOM, so it should not need changing.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Projects/ProjectCard.js \
        src/client/src/components/Projects/ProjectCard.test.js \
        src/client/src/components/Styling/Projects.css
git commit -m "feat: reduce a project card to its name, with the detail on hover"
```

---

## Task 8: A notice channel beside the error toast

Spec section 9, "The notice". The page has one toast today and it is an error, painted red and carrying `role="alert"`. Task 12 needs to report something that is not a failure. **This task must land before Task 12.**

**Files:**
- Modify: `src/client/src/state/projectActions.js`, `src/client/src/state/projectReducer.js:28–40, 166–175`
- Modify: `src/client/src/hooks/useProjectGraph.js:152–155`
- Modify: `src/client/src/components/Project/ProjectPage.js:42–49`
- Modify: `src/client/src/components/Styling/Project.css:65–80`
- Test: `src/client/src/state/projectReducer.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/client/src/state/projectReducer.test.js`, matching the file's existing import style and whatever it calls the initial state:

```javascript
describe('the notice channel', () => {
    test('raises a notice', () => {
        // Arrange & Act
        const after = projectReducer(INITIAL_STATE, noticeRaised('2 connections were removed.'));

        // Assert
        expect(after.notice).toBe('2 connections were removed.');
    });

    test('clears a notice', () => {
        // Arrange
        const raised = projectReducer(INITIAL_STATE, noticeRaised('Something happened.'));

        // Act
        const after = projectReducer(raised, noticeCleared());

        // Assert
        expect(after.notice).toBeNull();
    });

    test('drops a standing notice when a mutation rolls back', () => {
        // Arrange — the notice describes a change that is about to be undone.
        const raised = projectReducer(INITIAL_STATE, noticeRaised('2 connections were removed.'));
        const snapshot = { layers: {}, sequences: {}, todos: {}, edges: {} };

        // Act
        const after = projectReducer(raised, rolledBack(snapshot, 'Move failed.'));

        // Assert — a notice claiming the edges went would be a lie once they are back.
        expect(after.notice).toBeNull();
        expect(after.actionError).toBe('Move failed.');
    });
});
```

Add `noticeRaised`, `noticeCleared` and `rolledBack` to the file's import from `./projectActions`. If the initial state is not exported as `INITIAL_STATE`, use the file's own name for it, or build it with `projectReducer(undefined, { type: 'init' })` if it is not exported at all.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=projectReducer`

Expected: FAIL at import — `noticeRaised is not a function` — because the action creators do not exist.

- [ ] **Step 3: Register the action types**

In `src/client/src/state/projectReducer.js`, add to the `PROJECT_ACTIONS` object beside `actionErrorCleared`:

```javascript
    noticeRaised: 'noticeRaised',
    noticeCleared: 'noticeCleared',
```

- [ ] **Step 4: Add the action creators**

In `src/client/src/state/projectActions.js`, add after `actionErrorCleared`:

```javascript
/**
 * Something worth saying that is not a failure — the connections a sequence move
 * cost, say. Deliberately not `actionError`: that one is painted as an error and
 * announced as an alert, and a successful move is neither.
 */
export const noticeRaised = (message) => ({ type: PROJECT_ACTIONS.noticeRaised, message });

export const noticeCleared = () => ({ type: PROJECT_ACTIONS.noticeCleared });
```

- [ ] **Step 5: Add the state field and the handlers**

In `src/client/src/state/projectReducer.js`, add to the initial state object beside `actionError: null`:

```javascript
    notice: null,
```

Then add these two handlers beside `actionErrorCleared`'s:

```javascript
    [PROJECT_ACTIONS.noticeRaised]: (state, { message }) => ({ ...state, notice: message }),

    [PROJECT_ACTIONS.noticeCleared]: (state) => ({ ...state, notice: null }),
```

And extend the `rolledBack` handler. Replace:

```javascript
    // The mutation failed: put back the snapshot taken before it was applied and
    // hand the message to the page to surface.
    [PROJECT_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        ...snapshot,
        actionError: error,
    }),
```

with:

```javascript
    // The mutation failed: put back the snapshot taken before it was applied and
    // hand the message to the page to surface.
    //
    // Any standing notice goes with it. A notice describes what a change cost —
    // "2 connections were removed" — and a rolled-back change cost nothing, so
    // leaving it up would be a lie about a graph that has just been restored.
    [PROJECT_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        ...snapshot,
        actionError: error,
        notice: null,
    }),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=projectReducer`

Expected: PASS.

- [ ] **Step 7: Expose the notice from the graph hook**

In `src/client/src/hooks/useProjectGraph.js`, add `noticeCleared` and `noticeRaised` to the import from `../state/projectActions`, then replace:

```javascript
    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), []);

    return { state, reload: load, createEntity, updateEntity, removeEntity, dismissActionError };
```

with:

```javascript
    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), []);

    // Raised by a mutation that succeeded but cost something worth mentioning,
    // and dismissed by hand like the error above it. No timer: a toast that
    // vanishes on its own is one more race for the E2E suite and one more thing
    // to miss.
    const raiseNotice = useCallback((message) => dispatch(noticeRaised(message)), []);
    const dismissNotice = useCallback(() => dispatch(noticeCleared()), []);

    return {
        state,
        reload: load,
        createEntity,
        updateEntity,
        removeEntity,
        dismissActionError,
        raiseNotice,
        dismissNotice,
    };
```

- [ ] **Step 8: Render it**

In `src/client/src/components/Project/ProjectPage.js`, replace:

```jsx
    const { state, reload, dismissActionError } = graph;
```

with:

```jsx
    const { state, reload, dismissActionError, dismissNotice } = graph;
```

and add directly below the existing `state.actionError` block:

```jsx
            {state.notice && (
                <div className="project-toast project-toast--notice" role="status">
                    <p>{state.notice}</p>
                    <button type="button" onClick={dismissNotice}>
                        Dismiss
                    </button>
                </div>
            )}
```

`role="status"` rather than `role="alert"` on purpose: this reports something that already finished and must not interrupt a screen reader mid-sentence.

- [ ] **Step 9: Style it**

In `src/client/src/components/Styling/Project.css`, add directly after the `.project-toast p` rule:

```css
/* The same box as the error toast, in a colour that is not an emergency: this
 * reports what a change cost, not that something went wrong. Only the three
 * colour declarations are overridden — the shape is shared on purpose, so the
 * two read as one channel with two temperatures. */
.project-toast--notice {
    border-color: #d3d9e2;
    background: #f4f7fb;
    color: #2c3e56;
}
```

- [ ] **Step 10: Note where the toast itself gets covered**

Do **not** try to add a rendering test here. `ProjectPage.test.js` mocks `../../lib/api` and renders the real page through `renderPage()`, which takes no arguments — there is no seam for injecting `state.notice`, and adding one just to reach a toast would be a worse test than none.

The toast is covered end to end in Task 13 instead, where a real sequence move raises a real notice with real layout. What is worth asserting in isolation — that a notice is raised, cleared, and dropped on rollback — is the reducer, and Steps 1–6 covered it.

- [ ] **Step 11: Run the whole client suite**

Run: `npm run test:client`

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/client/src/state/projectActions.js \
        src/client/src/state/projectReducer.js \
        src/client/src/state/projectReducer.test.js \
        src/client/src/hooks/useProjectGraph.js \
        src/client/src/components/Project/ProjectPage.js \
        src/client/src/components/Styling/Project.css
git commit -m "feat: add a notice channel beside the project error toast"
```

---

## Task 9: Move a sequence between layers, server-side

Spec section 9, "Server". Repository and helper only; the route is Task 10.

**Files:**
- Create: `src/lib/assertLayerInProject.js`
- Modify: `src/db/repositories/sequencesRepo.js`
- Test: `tests/integration/sequenceMoveRoute.test.js` (created here, exercising the repo; extended in Task 10 for the route)

- [ ] **Step 1: Write the failing repo tests**

Create `tests/integration/sequenceMoveRoute.test.js`:

```javascript
'use strict';

const edgesRepo = require('../../src/db/repositories/edgesRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Moving a sequence between layers (spec section 9 of the 2026-09-07 changes).
 *
 * The danger is never the sequence landing in the wrong place. It is the layer
 * it left keeping a hole, the layer it joined ending up with two sequences
 * claiming one position, or an edge surviving the move pointing upward — which
 * would break the one invariant the whole graph rests on, that every edge steps
 * strictly down a layer and so no chain can ever cycle.
 */

/** Three layers, top to bottom, in one project. */
const createFixture = async (conn) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Build a drone' });
    const top = await layersRepo.create(conn, { projectId: project.id, title: 'Learning' });
    const middle = await layersRepo.create(conn, { projectId: project.id, title: 'Design' });
    const bottom = await layersRepo.create(conn, { projectId: project.id, title: 'Build' });

    return { ownerId, project, top, middle, bottom };
};

/** One layer's sequences as `[title, position]` pairs, left to right. */
const layerOrder = async (conn, layerId) => {
    const sequences = await sequencesRepo.listByLayer(conn, layerId);

    return sequences.map((sequence) => [sequence.title, sequence.position]);
};

describe('sequencesRepo.move', () => {
    test('files a sequence into another layer, leaving both layers dense', async () => {
        // Arrange — two sequences up top, two below.
        const conn = getConn();
        const { project, top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'B' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'C' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'D' });

        // Act — A goes to the middle layer, between C and D.
        const moved = await sequencesRepo.move(conn, moving.id, {
            layerId: middle.id,
            position: 1,
        });

        // Assert
        expect(moved.layer_id).toBe(middle.id);
        expect(moved.project_id).toBe(project.id);
        expect(await layerOrder(conn, top.id)).toEqual([['B', 0]]);
        expect(await layerOrder(conn, middle.id)).toEqual([
            ['C', 0],
            ['A', 1],
            ['D', 2],
        ]);
    });

    test('reorders within one layer without touching the others', async () => {
        // Arrange
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'B' });
        await sequencesRepo.create(conn, { layerId: top.id, title: 'C' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'D' });

        // Act — A moves to the end of its own layer.
        await sequencesRepo.move(conn, moving.id, { layerId: top.id, position: 2 });

        // Assert
        expect(await layerOrder(conn, top.id)).toEqual([
            ['B', 0],
            ['C', 1],
            ['A', 2],
        ]);
        expect(await layerOrder(conn, middle.id)).toEqual([['D', 0]]);
    });

    test('deletes edges the move would leave pointing upward', async () => {
        // Arrange — parent up top feeding a child in the middle layer.
        const conn = getConn();
        const { project, top, middle, bottom } = await createFixture(conn);
        const parent = await sequencesRepo.create(conn, { layerId: top.id, title: 'Parent' });
        const child = await sequencesRepo.create(conn, { layerId: middle.id, title: 'Child' });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act — the parent drops BELOW its child, which the edge cannot survive.
        await sequencesRepo.move(conn, parent.id, { layerId: bottom.id, position: 0 });

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    test('keeps edges that still point downward after the move', async () => {
        // Arrange — parent up top, child at the bottom, one layer of slack.
        const conn = getConn();
        const { project, top, middle, bottom } = await createFixture(conn);
        const parent = await sequencesRepo.create(conn, { layerId: top.id, title: 'Parent' });
        const child = await sequencesRepo.create(conn, { layerId: bottom.id, title: 'Child' });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act — the parent moves down one layer and is still above the child.
        await sequencesRepo.move(conn, parent.id, { layerId: middle.id, position: 0 });

        // Assert
        const edges = await edgesRepo.listByProject(conn, project.id);
        expect(edges).toHaveLength(1);
        expect(edges[0].parent_id).toBe(parent.id);
    });

    test('deletes an edge that a move into the child’s own layer invalidates', async () => {
        // Arrange — same-layer pairs are parallel work; neither gates the other.
        const conn = getConn();
        const { project, top, middle } = await createFixture(conn);
        const parent = await sequencesRepo.create(conn, { layerId: top.id, title: 'Parent' });
        const child = await sequencesRepo.create(conn, { layerId: middle.id, title: 'Child' });
        await edgesRepo.create(conn, {
            projectId: project.id,
            parentId: parent.id,
            childId: child.id,
        });

        // Act
        await sequencesRepo.move(conn, parent.id, { layerId: middle.id, position: 0 });

        // Assert
        expect(await edgesRepo.listByProject(conn, project.id)).toEqual([]);
    });

    test('rejects a position past the end of the target layer, writing nothing', async () => {
        // Arrange
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'B' });

        // Act & Assert — the target layer holds one sequence, so 0 and 1 are the
        // only legal slots for one joining it.
        await expect(
            sequencesRepo.move(conn, moving.id, { layerId: middle.id, position: 5 })
        ).rejects.toThrow(RangeError);

        // The sequence is still where it was, and both layers are untouched.
        expect(await layerOrder(conn, top.id)).toEqual([['A', 0]]);
        expect(await layerOrder(conn, middle.id)).toEqual([['B', 0]]);
    });

    test('returns null for a sequence that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const { middle } = await createFixture(conn);

        // Act
        const moved = await sequencesRepo.move(conn, 999999, {
            layerId: middle.id,
            position: 0,
        });

        // Assert
        expect(moved).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/sequenceMoveRoute.test.js`

Expected: FAIL — `sequencesRepo.move is not a function`.

- [ ] **Step 3: Add the ownership helper**

Create `src/lib/assertLayerInProject.js`:

```javascript
'use strict';

const assertOwnership = require('../middleware/assertOwnership');
const { badRequest } = require('./httpError');

/**
 * Confirms a layer named in a request body is one of this project's.
 *
 * The layer twin of `assertSequenceInProject`, and it exists for the same
 * reason: two different questions deserve two different answers.
 * `assertOwnership` answers "is this layer yours" — 403 or 404. The comparison
 * below answers "is it in the project this request is about": a layer the caller
 * genuinely owns but which sits in another of their projects is a client bug,
 * not an authorisation failure, so it is a 400.
 *
 * `PUT /sequences/:id/move` is the only caller today — a sequence must not be
 * able to leave its project by naming a layer in a different one.
 */
const assertLayerInProject = async (conn, layerId, projectId, userId, field = 'layerId') => {
    const owningProject = await assertOwnership(conn, 'layer', layerId, userId);

    if (owningProject.id !== projectId) {
        throw badRequest(`${field}: layer ${layerId} is not in this project`);
    }
};

module.exports = assertLayerInProject;
```

- [ ] **Step 4: Add `move` to the sequences repository**

In `src/db/repositories/sequencesRepo.js`, add `moveItem` to the import from `./positions`:

```javascript
const { insertAt, moveItem, removeItem } = require('./positions');
```

Then add this directly above `remove`:

```javascript
/**
 * The SQL that drops every edge touching a sequence which no longer points
 * strictly downward.
 *
 * `assertCanConnect` is the rule at the boundary: a parent's layer must be
 * strictly above its child's. A sequence changing layer can break that for edges
 * that were valid when they were made — so they are deleted with the move rather
 * than left to make the graph mean something it does not (spec decision 2).
 *
 * Strictly: `>=` catches the same-layer case as well as the upward one. Two
 * sequences in one band are parallel work and neither gates the other.
 */
const DELETE_INVALID_EDGES = `
    DELETE e FROM sequence_edges e
    JOIN sequences ps ON ps.id = e.parent_id
    JOIN sequences cs ON cs.id = e.child_id
    JOIN layers pl ON pl.id = ps.layer_id
    JOIN layers cl ON cl.id = cs.layer_id
    WHERE (e.parent_id = ? OR e.child_id = ?)
      AND pl.position >= cl.position`;

/**
 * Puts a sequence at a position in a layer — the verb behind dragging a card
 * from one band to another, and behind reordering one within its band.
 *
 * Modelled on `todosRepo.move`, and for the same reason: a layer is an ordered
 * list like any other, so filing a sequence into a different one and shuffling
 * it within its own are the same operation over one or two lists.
 *
 * The target index is validated BEFORE anything is written, so a bad position
 * cannot leave the sequence detached from the layer it came from. Callers run
 * this inside a transaction; it rewrites two tables.
 *
 * Returns the updated row, or null when the sequence is gone.
 */
const move = async (conn, id, { layerId, position }) => {
    const sequence = await findById(conn, id);
    if (!sequence) return null;

    const sourceOrdering = await listIds(conn, sequence.layer_id);

    if (sequence.layer_id === layerId) {
        await applyPositions(conn, TABLE, moveItem(sourceOrdering, id, position));

        return findById(conn, id);
    }

    const targetOrdering = await listIds(conn, layerId);
    // Validate the index before writing anything, so a bad position cannot leave
    // the sequence detached from its old layer.
    const newTargetOrdering = insertAt(targetOrdering, id, position);

    await conn.execute('UPDATE sequences SET layer_id = ? WHERE id = ?', [layerId, id]);
    await applyPositions(conn, TABLE, removeItem(sourceOrdering, id));
    await applyPositions(conn, TABLE, newTargetOrdering);
    await conn.execute(DELETE_INVALID_EDGES, [id, id]);

    return findById(conn, id);
};
```

Then add `move` to the module's exports:

```javascript
module.exports = {
    create,
    findById,
    listByLayer,
    listByOwner,
    listByProject,
    listIds,
    move,
    update,
    remove,
};
```

Finally, extend the file's header comment. After the paragraph ending "it is whether the card is folded shut, remembered per sequence.", add:

```
 * `move` is the one function here that touches another table: a sequence
 * changing layer can invalidate edges that were legal when they were made, and
 * they go with the move. See the note on `DELETE_INVALID_EDGES`.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/sequenceMoveRoute.test.js`

Expected: PASS, all seven.

- [ ] **Step 6: Run the whole server suite**

Run: `DB_NAME=planapp_test npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assertLayerInProject.js \
        src/db/repositories/sequencesRepo.js \
        tests/integration/sequenceMoveRoute.test.js
git commit -m "feat: move a sequence between layers, dropping edges it invalidates"
```

---

## Task 10: `PUT /api/sequences/:id/move`

Spec section 9, "Server". The endpoint over Task 9's repository.

**Files:**
- Modify: `src/routes/sequences.js`
- Test: `tests/integration/sequenceMoveRoute.test.js`

- [ ] **Step 1: Write the failing route tests**

Extend the imports at the top of `tests/integration/sequenceMoveRoute.test.js`:

```javascript
const request = require('supertest');

const app = require('../../src/server');
const { authHeaderFor } = require('../helpers/auth');
```

Then append this describe block at the end of the file:

```javascript
describe('PUT /api/sequences/:id/move', () => {
    test('moves a sequence to another layer and answers with the new row', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        await sequencesRepo.create(conn, { layerId: middle.id, title: 'B' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: middle.id, position: 0 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: moving.id,
            layerId: middle.id,
            position: 0,
        });
        expect(await layerOrder(conn, middle.id)).toEqual([
            ['A', 0],
            ['B', 1],
        ]);
    });

    test('answers 400 for a position past the end of the target layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: middle.id, position: 9 });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/position/);
        expect(await layerOrder(conn, top.id)).toEqual([['A', 0]]);
    });

    test('answers 400 for a layer in a different project', async () => {
        // Arrange — the same owner, two projects.
        const conn = getConn();
        const { ownerId, top } = await createFixture(conn);
        const other = await projectsRepo.create(conn, { ownerId, title: 'Other plan' });
        const foreignLayer = await layersRepo.create(conn, {
            projectId: other.id,
            title: 'Elsewhere',
        });
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ layerId: foreignLayer.id, position: 0 });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/not in this project/);
    });

    test('answers 403 for a sequence belonging to someone else', async () => {
        // Arrange
        const conn = getConn();
        const { top, middle } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });
        const stranger = await createTestUser(conn, { email: 'stranger@example.com' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(stranger))
            .send({ layerId: middle.id, position: 0 });

        // Assert
        expect(response.status).toBe(403);
    });

    test('answers 400 when the body names no layer', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, top } = await createFixture(conn);
        const moving = await sequencesRepo.create(conn, { layerId: top.id, title: 'A' });

        // Act
        const response = await request(app)
            .put(`/api/sequences/${moving.id}/move`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ position: 0 });

        // Assert
        expect(response.status).toBe(400);
    });
});
```

Check `createTestUser`'s signature in `tests/helpers/db.js` before running — if it takes no options object, create the second user however that helper allows, keeping the test's intent (a different user id).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/sequenceMoveRoute.test.js -t "PUT /api/sequences"`

Expected: FAIL with 404s — the route does not exist yet.

- [ ] **Step 3: Add the route**

In `src/routes/sequences.js`, replace the httpError import:

```javascript
const { notFound } = require('../lib/httpError');
```

with:

```javascript
const assertLayerInProject = require('../lib/assertLayerInProject');
const { badRequest, notFound } = require('../lib/httpError');
```

and add `idSchema` to the validation import:

```javascript
const {
    descriptionSchema,
    idSchema,
    parseId,
    requireSomeField,
    titleSchema,
} = require('../lib/validation');
```

Add this schema below `updateSequenceSchema`:

```javascript
/**
 * `layerId` is required rather than optional: a body that simply left it out
 * must not be read as "stay where you are", which would turn a mis-sent move
 * into a silent reorder of a layer the caller never named.
 */
const moveSequenceSchema = z.object({
    layerId: idSchema,
    position: z
        .number({ error: 'position must be an integer of 0 or more' })
        .int('position must be an integer of 0 or more')
        .min(0, 'position must be an integer of 0 or more'),
});

/**
 * `position` is checked against the target layer by the reindexing helpers,
 * which raise a `RangeError` for an index outside it. That is a caller mistake —
 * a stale client naming a slot in a layer that has since shrunk — so it answers
 * 400 here rather than reaching the error handler as a server fault.
 */
const moveOrReject = async (conn, id, placement) => {
    try {
        return await sequencesRepo.move(conn, id, placement);
    } catch (err) {
        if (err instanceof RangeError) throw badRequest(`position: ${err.message}`);

        throw err;
    }
};
```

and this handler between the PATCH and the DELETE:

```javascript
// PUT /api/sequences/:id/move — put this sequence at this position in this
// layer. Reordering a sequence within its band and moving it to another are the
// same operation over one or two ordered lists, so they are one endpoint.
//
// Edges the move leaves pointing upward are deleted with it, inside the same
// transaction: an edge means "this must finish before that can start", and one
// running up the canvas would mean nothing. The client derives the same set from
// the same rule, so nothing about that travels in this response.
router.put(
    '/:id/move',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const { layerId, position } = moveSequenceSchema.parse(req.body ?? {});

        const sequence = await withTransaction(async (conn) => {
            const project = await assertOwnership(conn, 'sequence', id, req.user.id);

            await assertLayerInProject(conn, layerId, project.id, req.user.id);

            return moveOrReject(conn, id, { layerId, position });
        });

        if (!sequence) throw notFound('Sequence');

        res.sendData(toSequence(sequence));
    })
);
```

Finally, extend the router's header comment. After the paragraph about `isCollapsed`, add:

```
 * `PUT /:id/move` is the exception to "one PATCH": a placement is not a field
 * edit. It replaces where the sequence lives outright, touches two ordered lists
 * and may delete edges, which is more than a partial update should ever mean.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/sequenceMoveRoute.test.js`

Expected: PASS, all twelve.

- [ ] **Step 5: Check the API guard suite still covers the new route**

Run: `DB_NAME=planapp_test npx jest tests/integration/apiGuards.test.js`

Expected: PASS. If that file enumerates every route to assert each is behind `isAuth`, add `PUT /api/sequences/:id/move` to its table — an unlisted route there is a hole, not a pass.

- [ ] **Step 6: Run the whole server suite**

Run: `DB_NAME=planapp_test npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/sequences.js tests/integration/sequenceMoveRoute.test.js
git commit -m "feat: add PUT /api/sequences/:id/move"
```

---

## Task 11: The placement rules and the optimistic cascade

Spec section 9, "Client" — the pure functions, with no React in sight.

**Files:**
- Modify: `src/client/src/lib/dragDrop.js`
- Modify: `src/client/src/state/cascades.js`
- Test: `src/client/src/lib/dragDrop.test.js`, `src/client/src/state/cascades.sequences.test.js`

- [ ] **Step 1: Write the failing placement tests**

Append to `src/client/src/lib/dragDrop.test.js`:

```javascript
describe('resolveSequencePlacement', () => {
    const sequence = (id, layerId, position) => ({ id, layerId, position });

    const sequences = [sequence(1, 10, 0), sequence(2, 10, 1), sequence(3, 20, 0)];

    test('appends a sequence joining another layer', () => {
        // Arrange
        const target = { kind: DROP_TARGET.append, layerId: 20 };

        // Act
        const placement = resolveSequencePlacement({
            activeSequence: sequences[0],
            target,
            sequences,
        });

        // Assert — the target layer holds one card, so the newcomer takes slot 1.
        expect(placement).toEqual({ layerId: 20, position: 1 });
    });

    test('takes the place of the card it was dropped on', () => {
        // Arrange
        const target = { kind: DROP_TARGET.item, layerId: 20, index: 0 };

        // Act
        const placement = resolveSequencePlacement({
            activeSequence: sequences[0],
            target,
            sequences,
        });

        // Assert
        expect(placement).toEqual({ layerId: 20, position: 0 });
    });

    test('counts a same-layer reorder from the list with the card lifted out', () => {
        // Arrange — card 1 moves to the end of its own layer, which holds two.
        const target = { kind: DROP_TARGET.append, layerId: 10 };

        // Act
        const placement = resolveSequencePlacement({
            activeSequence: sequences[0],
            target,
            sequences,
        });

        // Assert — one slot, not two: the card is not counted against itself.
        expect(placement).toEqual({ layerId: 10, position: 1 });
    });

    test('resolves to nothing when a card is let go where it already was', () => {
        // Arrange
        const target = { kind: DROP_TARGET.item, layerId: 10, index: 0 };

        // Act
        const placement = resolveSequencePlacement({
            activeSequence: sequences[0],
            target,
            sequences,
        });

        // Assert
        expect(placement).toBeNull();
    });

    test('resolves to nothing without a target or without a sequence', () => {
        // Arrange & Act & Assert
        expect(
            resolveSequencePlacement({ activeSequence: sequences[0], target: null, sequences })
        ).toBeNull();
        expect(
            resolveSequencePlacement({
                activeSequence: null,
                target: { kind: DROP_TARGET.append, layerId: 20 },
                sequences,
            })
        ).toBeNull();
    });
});
```

Add `resolveSequencePlacement` to the file's import from `./dragDrop`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=dragDrop`

Expected: FAIL — `resolveSequencePlacement is not a function`.

- [ ] **Step 3: Generalise the position helpers and add the rule**

In `src/client/src/lib/dragDrop.js`, replace `listOf`, `positionJoiningList` and `positionWithinList` with these — the arithmetic is unchanged, only the names and the doc comments widen from "to-do" to "item":

```javascript
/** The items of one list, in display order. */
const listOf = (items, key, value) => sortByPosition(items.filter((item) => item[key] === value));

/**
 * The index an item joining a list it is not already in should take.
 *
 * The list does not contain it, so a gap index and another item's index both
 * mean "go here, and push everything from here down" — the same thing the
 * server's `insertAt` does. Appending puts it after everything already there.
 */
const positionJoiningList = (target, list) =>
    target.kind === DROP_TARGET.append ? list.length : target.index;

/**
 * The index an item already in the list should end up at, counted the way both
 * the sortable preset and the server's `moveItem` count it: the index in the
 * list once the item has been lifted out of it.
 *
 * A gap index is read off the list as displayed, which still holds the item, so
 * a gap below where it started is one too high. An index over another item
 * already means "take that item's place", which needs no adjustment.
 */
const positionWithinList = (target, list, from) => {
    if (target.kind === DROP_TARGET.append) return list.length - 1;
    if (target.kind === DROP_TARGET.item) return target.index;

    return target.index > from ? target.index - 1 : target.index;
};
```

Update `resolveTodoPlacement`'s call to the widened `listOf`:

```javascript
    const list = listOf(todos, 'sequenceId', target.sequenceId);
```

(the rest of that function is unchanged), and add at the end of the file:

```javascript
/**
 * The move a sequence drop asks for, shaped as the body
 * `PUT /api/sequences/:id/move` takes, or null when it asks for nothing.
 *
 * Unlike a to-do, a sequence has no eligibility rule to check: every layer will
 * take every sequence. What a cross-layer move costs is edges, and that is
 * settled after the drop by `cascadeSequenceMove` rather than refused before it
 * (spec decision 2).
 *
 * `sequences` is the project's sequences as a plain array — the same shape the
 * graph hands out. Null rather than a throw, because a card let go where it
 * already was is an ordinary gesture, not a fault.
 */
export const resolveSequencePlacement = ({ activeSequence, target, sequences }) => {
    if (!activeSequence || !target) return null;
    if (target.layerId === null || target.layerId === undefined) return null;

    const list = listOf(sequences, 'layerId', target.layerId);

    if (activeSequence.layerId !== target.layerId) {
        return { layerId: target.layerId, position: positionJoiningList(target, list) };
    }

    const from = list.findIndex((sequence) => sequence.id === activeSequence.id);
    const position = positionWithinList(target, list, from);

    if (position === from) return null;

    return { layerId: target.layerId, position };
};
```

Finally, update the file's header comment. Replace:

```
// The v1 rules, narrower than the library would allow on its own:
```

with:

```
// Two kinds of thing are dragged here, and they answer to different rules. The
// to-do rules are narrower than the library would allow on its own; the sequence
// rules are barely rules at all, because every layer takes every sequence.
//
// The to-do rules:
```

and add after the existing bullet list:

```
//
// The sequence rules:
//
//   - A sequence may be dropped into any layer of its project, including its
//     own, where the drop is a reorder.
//   - Edges the move invalidates are not a reason to refuse it. They are dropped
//     with the move, and the cascade reports how many.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=dragDrop`

Expected: PASS, including every existing to-do placement test — the refactor must not have moved them.

- [ ] **Step 5: Commit the placement rule**

```bash
git add src/client/src/lib/dragDrop.js src/client/src/lib/dragDrop.test.js
git commit -m "feat: resolve where a dropped sequence card lands"
```

- [ ] **Step 6: Write the failing cascade tests**

Append to `src/client/src/state/cascades.sequences.test.js`:

```javascript
describe('cascadeSequenceMove', () => {
    /**
     * Three layers with two sequences in each of the first two, and one edge
     * from the top layer's first card down to the middle layer's first card.
     */
    const stateWith = (overrides = {}) => ({
        layers: {
            10: { id: 10, position: 0 },
            20: { id: 20, position: 1 },
            30: { id: 30, position: 2 },
        },
        sequences: {
            1: { id: 1, layerId: 10, position: 0 },
            2: { id: 2, layerId: 10, position: 1 },
            3: { id: 3, layerId: 20, position: 0 },
            4: { id: 4, layerId: 20, position: 1 },
        },
        edges: {
            100: { id: 100, parentId: 1, childId: 3 },
        },
        todos: {},
        ...overrides,
    });

    test('closes the old layer and opens a slot in the new one', () => {
        // Arrange
        const state = stateWith({ edges: {} });

        // Act — sequence 1 leaves layer 10 for the front of layer 20.
        const actions = cascadeSequenceMove(state, 1, { layerId: 20, position: 0 });

        // Assert — 2 moves up behind it; 3 and 4 move down to make room.
        expect(actions).toEqual([
            entityUpdated('sequences', 2, { position: 0 }),
            entityUpdated('sequences', 3, { position: 1 }),
            entityUpdated('sequences', 4, { position: 2 }),
        ]);
    });

    test('shifts only the cards passed over in a same-layer reorder', () => {
        // Arrange
        const state = stateWith({ edges: {} });

        // Act — sequence 1 moves to the end of layer 10.
        const actions = cascadeSequenceMove(state, 1, { layerId: 10, position: 1 });

        // Assert
        expect(actions).toEqual([entityUpdated('sequences', 2, { position: 0 })]);
    });

    test('removes an edge the move leaves pointing upward', () => {
        // Arrange — 1 is the parent of 3, which sits in layer 20.
        const state = stateWith();

        // Act — 1 drops to layer 30, below its own child.
        const actions = cascadeSequenceMove(state, 1, { layerId: 30, position: 0 });

        // Assert
        expect(actions).toContainEqual(entityRemoved('edges', 100));
    });

    test('removes an edge the move leaves inside one layer', () => {
        // Arrange
        const state = stateWith();

        // Act — 1 joins its own child's layer; parallel work gates nothing.
        const actions = cascadeSequenceMove(state, 1, { layerId: 20, position: 0 });

        // Assert
        expect(actions).toContainEqual(entityRemoved('edges', 100));
    });

    test('keeps an edge that still points downward after the move', () => {
        // Arrange — 1 parents 4, which is in layer 20; 1 moves within layer 10.
        const state = stateWith({ edges: { 100: { id: 100, parentId: 1, childId: 4 } } });

        // Act
        const actions = cascadeSequenceMove(state, 1, { layerId: 10, position: 1 });

        // Assert
        expect(actions).not.toContainEqual(entityRemoved('edges', 100));
    });

    test('leaves the state it was handed untouched', () => {
        // Arrange
        const state = stateWith();
        const snapshot = JSON.stringify(state);

        // Act
        cascadeSequenceMove(state, 1, { layerId: 30, position: 0 });

        // Assert
        expect(JSON.stringify(state)).toBe(snapshot);
    });
});
```

Add `cascadeSequenceMove` to the import from `./cascades`, and `entityRemoved` / `entityUpdated` to the import from `./projectActions`, if they are not there already.

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=cascades.sequences`

Expected: FAIL — `cascadeSequenceMove is not a function`.

- [ ] **Step 8: Add the cascade**

In `src/client/src/state/cascades.js`, add `canConnect` to the import from `../lib/graph`:

```javascript
import { canConnect, sortByPosition } from '../lib/graph';
```

Then add at the end of the file:

```javascript
/**
 * The edges a sequence's move would leave pointing the wrong way.
 *
 * `canConnect` is the same rule the server enforces in `assertCanConnect`: a
 * parent's layer must be strictly above its child's. Both ends are re-read
 * against the graph AS IT WILL BE — the moving sequence in its new layer, every
 * other sequence where it already is — because whether an edge survives depends
 * on where the move puts things, not where they are now.
 */
const edgesInvalidatedBy = (state, sequence, layerId) => {
    const layers = sortByPosition(Object.values(state.layers));
    const moved = { ...sequence, layerId };
    const after = (candidate) => (candidate.id === sequence.id ? moved : candidate);

    return Object.values(state.edges)
        .filter((edge) => edge.parentId === sequence.id || edge.childId === sequence.id)
        .filter((edge) => {
            const parent = state.sequences[edge.parentId];
            const child = state.sequences[edge.childId];

            if (!parent || !child) return false;

            return !canConnect(after(parent), after(child), layers);
        })
        .map((edge) => entityRemoved('edges', edge.id));
};

/**
 * Everything that follows putting a sequence at a position in a layer — the one
 * cascade behind `PUT /api/sequences/:id/move`.
 *
 * Changing layers: the one it left closes up, the one it joins opens a slot, and
 * any edge the move leaves pointing upward or sideways goes. That last part is
 * the same derivation the server runs inside its transaction, from the same rule
 * in `lib/graph`, so a successful move changes nothing further and a failed one
 * is rolled back whole.
 *
 * Staying in the same layer is a reorder: only the cards between where it left
 * and where it landed shift, and no edge can be invalidated by a move that
 * changes no layer — but the check runs anyway rather than being special-cased,
 * because "which edges break" is one question with one answer.
 */
export const cascadeSequenceMove = (state, sequenceId, { layerId, position }) => {
    const sequence = requireEntity(state, 'sequences', sequenceId);
    const doomedEdges = edgesInvalidatedBy(state, sequence, layerId);

    if (sequence.layerId === layerId) {
        return [
            ...doomedEdges,
            ...shiftPassedOver(
                'sequences',
                sequencesIn(state, layerId),
                sequence.position,
                position
            ),
        ];
    }

    return [
        ...doomedEdges,
        ...closeGap('sequences', sequencesIn(state, sequence.layerId), sequence.position),
        ...makeRoom('sequences', sequencesIn(state, layerId), position),
    ];
};
```

Note the assertion order in Step 6's first two tests: they use `edges: {}`, so `doomedEdges` is empty and the position actions are the whole array. The edge tests use `toContainEqual` and do not care about order.

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd src/client && CI=true npx react-scripts test --testPathPattern=cascades`

Expected: PASS, including the layer and to-do cascade suites.

- [ ] **Step 10: Commit**

```bash
git add src/client/src/state/cascades.js src/client/src/state/cascades.sequences.test.js
git commit -m "feat: cascade a sequence move through positions and edges"
```

---

## Task 12: Wire the drag up

Spec section 9, "Client" — the React half. **Requires Tasks 8, 9, 10 and 11.**

**Files:**
- Modify: `src/client/src/state/DragContext.js`, `src/client/src/hooks/useProjectMutations.js`, `src/client/src/components/Project/DragDropArea.js`, `src/client/src/components/Project/SequenceCard.js`, `src/client/src/components/Project/LayerRow.js`, `src/client/src/components/Styling/SequenceCard.css`, `src/client/src/components/Styling/Project.css`

- [ ] **Step 1: Widen the drag context**

In `src/client/src/state/DragContext.js`, replace the provider and the hook:

```javascript
export const DragProvider = ({ activeTodo, children }) => (
    <DragContext.Provider value={activeTodo}>{children}</DragContext.Provider>
);

/**
 * The to-do being dragged, or null when none is.
 *
 * Null rather than a throw outside a provider, unlike `useProjectContext`: "what
 * is being dragged" has an honest answer where there is no drag machinery at
 * all, and a card rendered on its own is simply never mid-drag.
 */
export const useActiveDragTodo = () => useContext(DragContext);
```

with:

```javascript
/** Nothing in the air. A frozen constant, so it is stable across renders. */
const NOTHING = Object.freeze({ activeTodo: null, activeSequence: null });

export const DragProvider = ({ value, children }) => (
    <DragContext.Provider value={value}>{children}</DragContext.Provider>
);

/**
 * The to-do being dragged, or null when none is.
 *
 * Null rather than a throw outside a provider, unlike `useProjectContext`: "what
 * is being dragged" has an honest answer where there is no drag machinery at
 * all, and a card rendered on its own is simply never mid-drag.
 */
export const useActiveDragTodo = () => (useContext(DragContext) ?? NOTHING).activeTodo;

/** The sequence card being dragged, or null when none is. */
export const useActiveDragSequence = () => (useContext(DragContext) ?? NOTHING).activeSequence;
```

Also replace the file's opening comment line "The to-do currently in the air, shared with everything that can be dropped on." with:

```
// Whatever is currently in the air — a to-do, or a sequence card — shared with
// everything that can be dropped on.
```

- [ ] **Step 2: Add the `moveSequence` verb**

In `src/client/src/hooks/useProjectMutations.js`, add `cascadeSequenceMove` to the import from `../state/cascades`, and pull `raiseNotice` out of the context:

```javascript
    const { state, createEntity, updateEntity, removeEntity, raiseNotice } = useProjectContext();
```

Then add this after `deleteSequence`:

```javascript
    /**
     * Puts a sequence at a position in a layer — the verb behind dragging a card
     * from one band to another (spec section 9 of the 2026-09-07 changes).
     *
     * A move between layers can leave an edge pointing upward, and those edges
     * go with it. That is not announced before the drop — refusing to move a
     * connected card would make reorganizing a plan nearly impossible — so it is
     * reported after, through the notice channel, and only when something was
     * actually lost.
     */
    const moveSequence = useCallback(
        (sequenceId, placement) => {
            const also = cascadeSequenceMove(state, sequenceId, placement);
            const removedEdges = also.filter((action) => action.collection === 'edges').length;

            if (removedEdges > 0) {
                const sequence = state.sequences[sequenceId];

                raiseNotice(
                    `Moved “${sequence.title}”. ` +
                        `${removedEdges} connection${removedEdges === 1 ? '' : 's'} ` +
                        `${removedEdges === 1 ? 'was' : 'were'} removed.`
                );
            }

            return updateEntity('sequences', sequenceId, {
                path: `/sequences/${sequenceId}/move`,
                method: 'put',
                changes: placement,
                body: placement,
                also,
            });
        },
        [updateEntity, raiseNotice, state]
    );
```

Add `moveSequence` to both the returned object and the `useMemo` dependency array, placed after `deleteSequence` in each.

Before relying on `action.collection`, check the shape `entityRemoved` produces in `projectActions.js` — if that field is named differently there, filter on whatever it actually is. Do not change the action shape to suit this.

- [ ] **Step 3: Handle both kinds of drag**

In `src/client/src/components/Project/DragDropArea.js`:

Add `useMemo` to the React import. Replace the dragDrop import:

```javascript
import { resolveTodoPlacement } from '../../lib/dragDrop';
```

with:

```javascript
import { resolveSequencePlacement, resolveTodoPlacement } from '../../lib/dragDrop';
```

Add this constant below `KEYBOARD_SENSOR_OPTIONS`:

```javascript
/** What a lift turned out to be, decided from the data the draggable carried. */
const DRAG_KIND = { todo: 'todo', sequence: 'sequence' };
```

Pull `moveSequence` out of the mutations:

```javascript
    const { moveTodo, moveSequence } = useProjectMutations();
```

Replace the state:

```javascript
    const [activeTodoId, setActiveTodoId] = useState(null);
```

with:

```javascript
    // What is in the air, as `{ kind, id }`, or null. One piece of state rather
    // than two, because exactly one thing is ever being dragged.
    const [active, setActive] = useState(null);
```

Replace `todoOf`, `activeTodo` and `handleDragStart`:

```javascript
    const todoOf = useCallback(
        (id) => (id === null || id === undefined ? null : state.todos[id] ?? null),
        [state.todos]
    );

    const activeTodo = todoOf(activeTodoId);

    const handleDragStart = useCallback((event) => {
        setActiveTodoId(event.active.data.current?.todoId ?? null);
    }, []);
```

with:

```javascript
    /**
     * What is being dragged, looked up in the graph. Both are exposed through
     * one context value so a card can ask either question without the provider
     * changing identity on every unrelated render.
     */
    const dragging = useMemo(
        () => ({
            activeTodo: active?.kind === DRAG_KIND.todo ? state.todos[active.id] ?? null : null,
            activeSequence:
                active?.kind === DRAG_KIND.sequence ? state.sequences[active.id] ?? null : null,
        }),
        [active, state.todos, state.sequences]
    );

    const handleDragStart = useCallback((event) => {
        const data = event.active.data.current;

        if (data?.todoId !== undefined) {
            setActive({ kind: DRAG_KIND.todo, id: data.todoId });
            return;
        }

        if (data?.sequenceId !== undefined) {
            setActive({ kind: DRAG_KIND.sequence, id: data.sequenceId });
            return;
        }

        setActive(null);
    }, []);
```

Replace `handleDragEnd` and `handleDragCancel`:

```javascript
    const handleDragEnd = useCallback(
        (event) => {
            setActiveTodoId(null);

            const lifted = todoOf(event.active.data.current?.todoId);
            if (!lifted) return;

            const placement = resolveTodoPlacement({
                activeTodo: lifted,
                target: event.over?.data.current?.dropTarget ?? null,
                todos: Object.values(state.todos),
            });

            if (placement) moveTodo(lifted.id, placement);
        },
        [moveTodo, state.todos, todoOf]
    );

    const handleDragCancel = useCallback(() => setActiveTodoId(null), []);
```

with:

```javascript
    /**
     * A drop the rules refuse — a to-do let go over another sequence, or over
     * the unorganized panel — resolves to no placement and so sends nothing.
     * That is not a silent failure: the card said it would not take it for the
     * whole drag, which is why the drop reached it saying so.
     *
     * A sequence drop is refused for one reason only: it landed where it already
     * was. Every layer takes every sequence, and what a move costs in edges is
     * settled by the cascade rather than by refusing the drop.
     */
    const handleDragEnd = useCallback(
        (event) => {
            setActive(null);

            const data = event.active.data.current;
            const target = event.over?.data.current?.dropTarget ?? null;

            if (data?.todoId !== undefined) {
                const lifted = state.todos[data.todoId];
                if (!lifted) return;

                const placement = resolveTodoPlacement({
                    activeTodo: lifted,
                    target,
                    todos: Object.values(state.todos),
                });

                if (placement) moveTodo(lifted.id, placement);
                return;
            }

            if (data?.sequenceId !== undefined) {
                const lifted = state.sequences[data.sequenceId];
                if (!lifted) return;

                const placement = resolveSequencePlacement({
                    activeSequence: lifted,
                    target,
                    sequences: Object.values(state.sequences),
                });

                if (placement) moveSequence(lifted.id, placement);
            }
        },
        [moveTodo, moveSequence, state.todos, state.sequences]
    );

    const handleDragCancel = useCallback(() => setActive(null), []);
```

And the provider at the bottom:

```jsx
            <DragProvider activeTodo={activeTodo}>{children}</DragProvider>
```

becomes:

```jsx
            <DragProvider value={dragging}>{children}</DragProvider>
```

- [ ] **Step 4: Give the sequence card a grip**

In `src/client/src/components/Project/SequenceCard.js`, add `useSortable` to the existing `@dnd-kit/sortable` import line, and accept an `index` prop:

```javascript
const SequenceCard = ({ sequence, todos, isActive }) => {
```

becomes:

```javascript
const SequenceCard = ({ sequence, todos, isActive, index }) => {
```

Add this directly below the existing `useDroppable` call:

```javascript
    /**
     * The card as something to pick up, and as somewhere to drop another card.
     *
     * The id is prefixed because to-do ids and sequence ids are independent
     * auto-increments, and two bare integers in one `DndContext` could name
     * different things. `dropTarget` carries the LAYER, because where a card
     * lands is a slot in a layer — the card it was dropped on is only how that
     * slot was aimed at.
     */
    const sortable = useSortable({
        id: `seq-${sequence.id}`,
        data: {
            sequenceId: sequence.id,
            dropTarget: { kind: DROP_TARGET.item, layerId: sequence.layerId, index },
        },
    });

    /**
     * The `<li>` already carries a ref — `registry.registerCard`, which is how
     * `useNodePositions` finds this card to draw edges to. The sortable needs
     * the same node, so the two are composed rather than one replacing the
     * other. (The to-do droppable's `setNodeRef` is NOT here: it lives on
     * `.sequence-card-body` further down, and stays there.)
     */
    const setCardNode = (node) => {
        registry?.registerCard(sequence.id, node);
        sortable.setNodeRef(node);
    };
```

Add `sortable.isDragging ? 'sequence-card--dragging' : ''` to the `className` array.

Define the grip beside the existing `chevron`:

```jsx
    const grip = (
        <button
            type="button"
            className="sequence-card-grip"
            aria-label={`Move ${sequence.title} to another layer`}
            {...sortable.attributes}
            {...sortable.listeners}
        >
            <span aria-hidden="true">⠿</span>
        </button>
    );
```

Render `{grip}` next to `{chevron}` in the card header. Then, on the `<li>`, replace:

```jsx
            ref={(node) => registry?.registerCard(sequence.id, node)}
```

with:

```jsx
            ref={setCardNode}
            style={{
                transform: sortable.transform
                    ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
                    : undefined,
                transition: sortable.transition,
            }}
```

Leave `ref={setNodeRef}` on `.sequence-card-body` exactly where it is — that is the to-do droppable and has nothing to do with this.

Confirm `'button'` is still in `INTERACTIVE_WITHIN_CARD` — it is what stops a press on the grip folding the card. Change nothing if it is there.

**Known limitation, and it is fine:** a card being dragged moves by CSS transform, which fires neither the `ResizeObserver` nor a scroll event, so its edges do not follow it mid-drag — they snap when the drop lands and the graph changes. Chasing a transform every frame would mean re-measuring every card on the canvas 60 times a second to animate a line that is about to be redrawn anyway. Do not add that.

- [ ] **Step 5: Make the layer row a drop target**

In `src/client/src/components/Project/LayerRow.js`, add:

```javascript
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';

import { DROP_TARGET } from '../../lib/dragDrop';
import { useActiveDragSequence } from '../../state/DragContext';
```

Inside the component, above the return:

```javascript
    const activeDragSequence = useActiveDragSequence();

    // Dropping on the row's own space appends to this layer. Disabled unless a
    // sequence is actually in the air, so it never competes with a to-do drag
    // for the pointer.
    const { isOver, setNodeRef } = useDroppable({
        id: `layer-${layer.id}`,
        disabled: !activeDragSequence,
        data: { dropTarget: { kind: DROP_TARGET.append, layerId: layer.id } },
    });
```

Give the `<section className="layer-row has-delete-bubble">` a `ref={setNodeRef}` and add `isOver ? 'layer-row--over' : ''` to its class list (build the list with the same `.filter(Boolean).join(' ')` idiom the sequence card uses).

Then wrap the card list:

```jsx
                        <ul className="layer-row-sequences">
                            {own.map((sequence) => (
                                <SequenceCard
                                    key={clientKeyOf(sequence)}
                                    sequence={sequence}
                                    todos={todos}
                                    isActive={sequence.id === activeSequenceId}
                                />
                            ))}
                        </ul>
```

becomes:

```jsx
                        <SortableContext
                            items={own.map((sequence) => `seq-${sequence.id}`)}
                            strategy={horizontalListSortingStrategy}
                        >
                            <ul className="layer-row-sequences">
                                {own.map((sequence, index) => (
                                    <SequenceCard
                                        key={clientKeyOf(sequence)}
                                        sequence={sequence}
                                        todos={todos}
                                        isActive={sequence.id === activeSequenceId}
                                        index={index}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
```

- [ ] **Step 6: Style the grip and the drop state**

In `src/client/src/components/Styling/SequenceCard.css`, add at the end:

```css
/* The one way to pick a card up. Faint until the card is hovered, like the grips
 * on the to-do rows inside it, so a canvas of cards is not a canvas of handles. */
.sequence-card-grip {
    flex: 0 0 auto;
    padding: 0 0.25rem;
    border: 0;
    background: none;
    color: #c8c8c8;
    font-size: 0.9rem;
    line-height: 1;
    cursor: grab;
}

.sequence-card:hover .sequence-card-grip,
.sequence-card-grip:focus-visible {
    color: #7a7a7a;
}

.sequence-card--dragging {
    opacity: 0.5;
    cursor: grabbing;
}
```

In `src/client/src/components/Styling/Project.css`, after the `.layer-row` block:

```css
/* A layer with a card in the air over it. The one moment a band draws itself —
 * a drop has to say where it will land, and unlike the hover tint removed above
 * this is momentary and answers a question the person is actively asking. */
.layer-row--over {
    background: #eef3fb;
    box-shadow: inset 0 0 0 1px #4a7bd0;
}
```

- [ ] **Step 7: Run the whole client suite**

Run: `npm run test:client`

Expected: PASS. If `SequenceCard.test.js` or `LayerRow.test.js` renders a card outside a `DndContext`, `useSortable` will throw — wrap those renders in the harness the tests already use for `useDroppable` (`sequenceCardHarness.js` exists for exactly this). Do not stub `useSortable`.

- [ ] **Step 8: Commit**

```bash
git add src/client/src/state/DragContext.js \
        src/client/src/hooks/useProjectMutations.js \
        src/client/src/components/Project/DragDropArea.js \
        src/client/src/components/Project/SequenceCard.js \
        src/client/src/components/Project/LayerRow.js \
        src/client/src/components/Styling/SequenceCard.css \
        src/client/src/components/Styling/Project.css
git commit -m "feat: drag a sequence card into another layer"
```

---

## Task 13: Prove it in a browser, and correct the old spec

Spec sections 10 and 11. Per-row scrolling, edge clipping and a real drag can only be judged with layout, and jsdom has none.

**Files:**
- Modify: `tests/e2e/criticalFlow.spec.js`, `tests/e2e/database.js`
- Modify: `docs/superpowers/specs/2026-08-27-planapp-design.md`

- [ ] **Step 1: Write the failing E2E tests**

Read `tests/e2e/criticalFlow.spec.js`, `tests/e2e/helpers.js` and `tests/e2e/database.js` first — they define how a project with layers and sequences is seeded and opened. Add these in that file's style, using its own helpers for setup:

```javascript
test('drags a sequence into another layer and reports the connections it cost', async ({ page }) => {
    // Arrange — layer "Learning" holding "Learn electronics", layer "Design"
    // holding "Design rotor system", with an edge between them. Seed it with
    // whatever helper this file already uses.
    await openProject(page, projectId);

    const card = page.getByRole('listitem').filter({ hasText: 'Learn electronics' });
    const targetLayer = page.getByRole('region', { name: 'Design' });

    // Act — drag the parent down into its own child's layer, which the edge
    // between them cannot survive. The intermediate move matters: the pointer
    // sensor has a 5px activation distance (POINTER_ACTIVATION_DISTANCE_PX in
    // DragDropArea.js), so it must actually travel before the drag begins.
    await card.getByRole('button', { name: /move .* to another layer/i }).hover();
    await page.mouse.down();
    await page.mouse.move(0, 0);
    await targetLayer.hover();
    await page.mouse.up();

    // Assert — the card moved, and the loss was reported rather than hidden.
    await expect(targetLayer.getByText('Learn electronics')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('1 connection was removed');
});

test('scrolls a crowded layer sideways rather than shrinking its cards', async ({ page }) => {
    // Arrange — a layer holding six sequences, in a 1280px viewport.
    await page.setViewportSize({ width: 1280, height: 900 });
    await openProject(page, crowdedProjectId);

    const row = page.locator('.layer-row-sequences').first();

    // Assert — the row overflows rather than squeezing: its content is wider
    // than its box, and the first card is still full width.
    const { scrollWidth, clientWidth } = await row.evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    const cardWidth = await row
        .locator('.sequence-card')
        .first()
        .evaluate((node) => node.getBoundingClientRect().width);
    // 25rem at the default root size, allowing a pixel of rounding.
    expect(cardWidth).toBeGreaterThan(399);
});

test('stops drawing an edge to a card scrolled out of its row', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 1280, height: 900 });
    await openProject(page, crowdedProjectId);

    const edges = page.locator('.edge-layer path');
    await expect(edges).not.toHaveCount(0);
    const before = await edges.count();

    // Act — push the connected card out of sight.
    await page
        .locator('.layer-row-sequences')
        .first()
        .evaluate((node) => node.scrollTo({ left: node.scrollWidth }));

    // Assert — the re-measure is coalesced onto a frame, so wait for the effect
    // rather than asserting into the same tick.
    await expect.poll(() => edges.count()).toBeLessThan(before);
});
```

The fixture ids and `openProject` must come from what the file already has. If there is no crowded-project fixture, add one to `tests/e2e/database.js` alongside the existing seeds: six sequences in one layer, with an edge from one of them down to a sequence in the layer below.

- [ ] **Step 2: Run the E2E suite**

Run: `DB_NAME=planapp_test npm run test:e2e`

Expected: PASS. These exercise code written in Tasks 4, 5 and 12, so they should be green on the first run — a failure here means one of those tasks is incomplete, not that the test is wrong.

- [ ] **Step 3: Commit the E2E coverage**

```bash
git add tests/e2e/criticalFlow.spec.js tests/e2e/database.js
git commit -m "test: cover the sequence drag, row scrolling and edge clipping end to end"
```

- [ ] **Step 4: Amend the old spec**

At the top of `docs/superpowers/specs/2026-08-27-planapp-design.md`, directly below the `**Status:**` line, add:

```markdown
**Amended by:** `2026-09-07-planapp-ui-changes-design.md`, which supersedes three
statements below. §2 puts horizontal crowding and sequence dragging out of scope;
both are now in. §4.6 says the canvas has no scrolling of its own — still true of
the canvas, but its layer rows now scroll sideways. The original text is left as
written so the decisions it records stay legible.
```

Change nothing else in that file. The point of an amendment note is that the superseded reasoning stays readable.

- [ ] **Step 5: Run everything**

Run: `DB_NAME=planapp_test npm run test:all`

Expected: PASS — server unit and integration, then client, then E2E.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-27-planapp-design.md
git commit -m "docs: note what the 2026-09-07 changes supersede"
```

---

## Done

Seven changes, thirteen tasks. Verify against the spec before calling it finished:

- [ ] Home cards hide blocked to-dos and blocked sequences (Task 6)
- [ ] Layer hover reveals the × and nothing else (Task 1)
- [ ] Project page fills the window at 0.75rem padding (Task 2)
- [ ] Add-layer is a divider, add-sequence is a circle (Task 3)
- [ ] Crowded layers scroll sideways with full-width cards (Task 4)
- [ ] Edges track a scrolled row and vanish when their end does (Task 5)
- [ ] Home cards are a name, with a drop-down on hover and focus (Task 7)
- [ ] Sequences drag between layers, invalid edges dropped and reported (Tasks 8–12)
- [ ] `DB_NAME=planapp_test npm run test:all` is green (Task 13)
