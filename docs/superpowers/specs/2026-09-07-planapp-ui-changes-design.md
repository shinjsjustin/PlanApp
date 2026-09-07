# PlanApp — UI Changes Design Spec

**Date:** 2026-09-07
**Status:** Approved, ready for implementation planning
**Amends:** `2026-08-27-planapp-design.md` (see section 11)

---

## 1. Purpose

Seven changes to an app that now exists and has been used. They are not one
feature; they are the corrections a first pass earns. Grouped into one spec
because four of the seven touch the same three files, and doing them separately
would mean reworking the same CSS four times.

The through-line, where there is one: the canvas should show more and get in the
way less, and the home page should say less until asked.

| # | Change | Section |
|---|--------|---------|
| 1 | Home cards hide blocked work | 3 |
| 2 | Layer hover shows only the delete × | 4 |
| 3 | Project page goes full-bleed | 5 |
| 4 | "Add layer" and "add sequence" become distinguishable | 6 |
| 5 | Layers scroll horizontally instead of squishing | 7 |
| 6 | Home cards show a name, with a hover drop-down | 8 |
| 7 | Sequences can be dragged between layers | 9 |

Sections 3–9 are independent and may be built in any order, with one ordering
note in section 7.

## 2. Decisions

Recorded because each was a real fork, and the reasoning is worth more later than
the answer.

1. **Each layer scrolls on its own**, rather than the canvas scrolling as a
   whole. Per-row scrolling costs edge-tracking work that a canvas-wide scroller
   would not (section 7), but it keeps short layers still while a long one is
   panned, and keeps the add-sequence button pinned and reachable.
2. **A cross-layer sequence move deletes newly-invalid edges without a prompt,
   and reports afterward.** Refusing the move would make a connected sequence
   nearly immovable, which defeats the feature. Confirming each one would make
   routine reorganizing heavy. So the drag stays fast and a dismissible notice
   says what it cost — the only destructive action in the app that reports after
   the fact rather than asking before it.
3. **The home card's drop-down overlays rather than expands.** An in-flow
   expansion grows the card and reflows every card in its grid row on hover.
4. **Hover *and* `:focus-within` open the drop-down**, and touch devices get it
   open permanently. The stretched title link already supplies the focus, so
   keyboard access costs nothing and needs no new control.
5. **The add-layer button changes shape rather than gaining a label.** A
   band-shaped control makes a band and a card-shaped control makes a card; text
   would have required widening the gutter, which is mirrored in `geometry.js` as
   the skip-edge lane origin.

## 3. Home cards hide blocked work

### Behaviour

A blocked to-do (`status: 'blocked'`) is skipped when choosing a sequence's next
to-do, exactly as a complete one is. A blocked sequence (`isBlocked: true`) does
not appear in the ready frontier at all.

Both follow from what the frontier is for: the card answers *what can I work on
right now*, and neither of these is an answer.

### Implementation

`nextTodoOf` narrows from "not complete" to "is incomplete". `readyFrontier`
gains one filter, dropping sequences whose status is `blocked`.

The change lands in three files, because `src/lib/frontier.js` (CommonJS, server)
and `src/client/src/lib/graph.js` (ESM, client) are hand-maintained twins:

- `src/lib/frontier.js`
- `src/client/src/lib/graph.js`
- `src/shared/frontierFixtures.json` — new cases, read by both
  `tests/unit/frontier.test.js` and `src/client/src/lib/graph.frontier.test.js`

The fixtures are the enforcement mechanism, not documentation: a twin that does
not follow the other turns one of those two suites red.

### Deliberate side-effect on the project page

`readyFrontier` has two consumers — the home page, through
`src/lib/projectsFrontier.js`, and `activeSequenceId`, which picks the spotlit
card on the canvas.

`activeSequenceId` already filters `!sequence.isBlocked`, so the sequence filter
is a no-op there. The to-do filter is not: a sequence whose only open to-dos are
blocked now has `nextTodo === null` and stops carrying the spotlight ring. This
is intended. The spotlight means "start here", and there is nothing startable in
such a sequence.

`sequenceStatus` is untouched, so the sequence cards' own status words are
unaffected.

## 4. Layer hover shows only the delete ×

### Behaviour

Hovering a layer band reveals its delete × and changes nothing else. The band
stays invisible, and the edges drawn behind it stay visible.

### Implementation

In `src/client/src/components/Styling/Project.css`, remove:

- `.layer-row:hover { background: #f2f3f4; }`
- `transition: background-color 120ms ease;` from `.layer-row`
- the `@media (prefers-reduced-motion)` block that existed only to disable that
  transition

`.layer-row` keeps `position: relative`, its padding, and its negative left
margin. Those are the box the × pins its corner to — `--delete-bubble-top` and
`--delete-bubble-right` are measured against them — not tint machinery.

The reveal itself keys off `.has-delete-bubble:hover` in `DeleteBubble.css` and
is not touched.

## 5. Project page goes full-bleed

### Behaviour

The project page uses the full width of the window with minimal padding.

### Implementation

`.project-page` drops `--page-max`, `max-width` and `margin: 0 auto`.
`--page-pad` goes from `1.5rem` to `0.75rem`. The `env(safe-area-inset-left)` and
`env(safe-area-inset-right)` floors stay: the ground still runs to the physical
edges of the screen.

`.unorganized-panel` currently reconstructs the page's left margin to park itself
beside the content column:

```css
left: max(var(--page-pad), calc((100vw - var(--page-max)) / 2 - var(--panel-width) - 0.75rem));
```

With no margin to park in, this collapses to `left: var(--page-pad)`. The panel
becomes honestly an overlay at every window width — which is what its collapsed
pill was always for.

The `@media (max-width: 40rem)` block that narrows `--panel-width` still applies
and is unchanged.

`.projects-page` keeps its 1100px cap. This change is the project page only.

## 6. "Add layer" and "add sequence" become distinguishable

### Behaviour

The two buttons differ in shape, and each shape matches what it creates.

```
  Layer: Learning
  [card] [card] [card]   ( + )   <- add sequence: card-sized, in the gutter

  ············· + ············   <- add layer: band-sized, spans the canvas

  Layer: Building
  [card] [card]          ( + )
```

### Implementation

In `LayerRow.js`, `.canvas-layer-footer` stops being a `.canvas-gutter` holding a
circle. It becomes a single full-width `.layer-divider` button: a dashed rule
spanning the canvas with a `+` centred in it, quiet at rest, firmer border and
darker glyph on `:hover` and `:focus-visible`.

The add-sequence button is unchanged — the round `+` in the 3rem gutter beside
its row.

`--canvas-gutter` stays 3rem. `CANVAS_GUTTER_WIDTH` in
`src/client/src/lib/geometry.js` mirrors that number to place the skip-edge
lanes, and neither can read the other's value; leaving the gutter alone means
that mirror stays correct without being touched.

The existing `aria-label`s (`Add a layer below X`, `Add a sequence to X`) are
kept as they are. They were never the ambiguous part.

## 7. Layers scroll horizontally instead of squishing

### Behaviour

A layer holding more sequences than fit scrolls horizontally within its own band.
Cards keep their width. Other layers do not move. The add-sequence button stays
pinned and reachable however far the row is scrolled.

### Implementation

- `.layer-row-sequences` gains `overflow-x: auto` and changes
  `justify-content: space-evenly` to `flex-start`.
- `.sequence-card` changes `flex: 0 1 25rem` to `flex: 0 0 25rem`, so cards hold
  their width rather than shrinking toward `min-width: 0`.
- The add-sequence button is already a sibling *outside* `.layer-row`, so it
  needs no change to stay pinned.

That much makes the rows scroll. Two further pieces keep the edges honest, and
they are the actual cost of choosing per-row scrolling (decision 1).

### Edges must follow a scrolled row

`useNodePositions` measures against the canvas and re-measures when a
`ResizeObserver` fires on it. A card moving inside a scrolled row moves without
the canvas resizing, so the observer never fires and every path to that card goes
stale.

Fix: one capture-phase `scroll` listener on the canvas node, re-measuring on
`requestAnimationFrame`. Scroll events do not bubble but do capture, so a single
listener catches every descendant scroller — no per-row registration, and rows
that appear or vanish need no bookkeeping.

The existing `scrollLeft`/`scrollTop` terms in `measure`'s origin stay as they
are; they remain zero, since the canvas itself is still not a scroll container.

### Edges to scrolled-away cards must not draw

A card clipped at its row's edge is still somewhere geometrically, and a line
drawn to it would cut across neighbouring bands — the SVG overlay is stretched
across the whole canvas, not clipped per row.

Fix: `useNodePositions` records an `isClipped` flag per node, comparing the
card's rect against the rect of its scrolling row — found as
`card.closest('.layer-row-sequences')`, falling back to not-clipped when there is
no such ancestor, so a card rendered outside a row is drawn rather than dropped.
`edgePaths` skips any edge with a clipped endpoint, extending the rule it already
applies in
`src/client/src/lib/geometry.js` — an edge whose ends are not both known is left
out rather than drawn from a guess.

The flag is measurement and stays untested in jsdom; the filter is arithmetic
over plain data and is unit-tested like the rest of `geometry.js`.

### Ordering note

Section 5 (full-bleed) widens the canvas and so reduces how often a row needs to
scroll at all. Building 5 first makes 7 easier to judge by eye, but neither
depends on the other in code.

## 8. Home cards show a name, with a hover drop-down

### Behaviour

A card at rest shows the project title and nothing else. Hovering it — or tabbing
to its title link — drops a panel down over the cards below, holding the progress
line, the description, and the ready frontier.

On a device with no hover, the panel is simply always open.

### Implementation

`ProjectCard.js` keeps its title block; the progress line, the description and
`FrontierBlock` move inside a new `.project-card-reveal` element.

The panel is `position: absolute; top: 100%`, inheriting the card's border,
radius and background, with a `z-index` that puts it above neighbouring cards
(and `.project-card:hover` raised to match, so it stacks above its own row). It
is not an in-flow expansion: growing the card would reflow its whole grid row on
hover (decision 3).

Revealed by `.project-card:hover` and `.project-card:focus-within`. The stretched
link at `.project-card-title a::after` already supplies that focus when the title
is tabbed to, so no new control is introduced (decision 4).

Under `@media (hover: none)` the panel reverts to `position: static` and stays
open — a permanently-open absolute panel would sit on top of the card below it
forever. Under `@media (prefers-reduced-motion: reduce)` the transition is
dropped, and the reveal is instant.

Content stays in the accessibility tree throughout. The collapse is visual
density, not information hiding, so nothing is `hidden` or `aria-hidden`.

Nothing in the panel is interactive, so the card-wide link overlay covering it is
correct rather than a problem. `Rename`, the confirm dialog and the inline error
stay outside the panel and keep `project-card-raised`.

## 9. Sequences can be dragged between layers

The largest of the seven, and the only one that touches the database.

### Behaviour

A sequence card carries a grip handle. Dragging it onto another layer files it
there; dragging it within its layer reorders it. Dropping it onto another card
takes that card's place; dropping it onto the row's empty space appends it.

Edges the move invalidates are deleted without a prompt. When any were, a
dismissible notice appears above the canvas — *"Moved “Learn electronics”.
2 connections were removed."* — so the drag stays fast and the cost is still
visible (decision 2).

### The edge problem

`assertCanConnect` requires every edge to point strictly downward — the parent's
layer above the child's. That single comparison is also the whole cycle story:
every edge steps down a layer, so a chain can never return to where it began.

Moving a sequence between layers can break that invariant for edges that were
valid when they were made. Per decision 2, the move proceeds, the offending edges
are deleted, and a notice reports how many afterward.

### Server

**`src/db/repositories/sequencesRepo.js`** — add
`move(conn, id, { layerId, position })`, modelled directly on `todosRepo.move`:

- Same layer: reindex with `moveItem`.
- Different layer: validate the target index with `insertAt` *before* writing
  anything, then `UPDATE sequences SET layer_id`, then reindex source and target.

Validating first is what stops a bad position leaving the sequence detached from
its old layer.

**Edge cleanup** — one `DELETE` joining `sequence_edges` to both endpoints'
sequences and their layers, removing any edge touching this sequence where the
parent's layer position is no longer strictly above the child's. Runs inside the
same transaction as the move.

**`src/routes/sequences.js`** — `PUT /api/sequences/:id/move`, body
`{ layerId, position }`, with:

- `assertOwnership(conn, 'sequence', id, req.user.id)`
- a new `src/lib/assertLayerInProject.js`, mirroring the existing
  `assertSequenceInProject` — no layer equivalent exists yet, and the move must
  refuse a layer in someone else's project or in another project of this owner's
- the `RangeError → badRequest` mapping `todos.js` already uses for a stale
  client naming a slot in a list that has since shrunk

The response is the updated sequence, in the same shape every other sequence
mutation returns. It does not enumerate the deleted edges — see below.

### Client

**`src/client/src/lib/dragDrop.js`** — extract `positionJoiningList` and
`positionWithinList`, which are already generic over "a list", and add
`resolveSequencePlacement({ activeSequence, target, sequences })` alongside
`resolveTodoPlacement`. Same arithmetic, two callers.

**`src/client/src/state/DragContext.js`** — the provider value becomes
`{ activeTodo, activeSequence }`. `useActiveDragTodo()` stays as a selector over
it, so `DropZone` and the sequence cards need no change.

**`src/client/src/components/Project/DragDropArea.js`** — branches on
`event.active.data.current.kind`.

**dnd-kit ids get namespaced** (`todo-5`, `seq-5`). To-do and sequence ids are
independent auto-increments, so bare integers would collide across the two
draggable kinds in one `DndContext`. The real id keeps travelling in `data`,
which is how the handlers already read it.

**`SequenceCard.js`** — a grip handle in the card header, not a draggable card
body. The body's click already belongs to connect mode.

**Drop targets** — the layer row body registers a droppable carrying
`DROP_TARGET.append` with its `layerId`; each sequence card registers
`DROP_TARGET.item` with its `layerId` and its index in the row, through
`useSortable`. The two existing `DROP_TARGET` kinds are reused unchanged — what
differs between a to-do drop and a sequence drop is the list named, not the
arithmetic. `DROP_TARGET.gap` is not used for sequences: sortable's item targets
already cover every slot except after the last, which append covers. (To-dos need
`DropZone` gaps because a to-do row is too short to aim at reliably; a 25rem card
is not.)

**`src/client/src/state/cascades.js`** —
`cascadeSequenceMove(state, sequenceId, { layerId, position })`, reusing
`shiftPassedOver` for a same-layer reorder and `closeGap` + `makeRoom` for a
cross-layer move, plus `entityRemoved('edges', …)` for every edge the move
invalidates.

**`src/client/src/hooks/useProjectMutations.js`** —
`moveSequence(sequenceId, placement)`, through `updateEntity` with
`method: 'put'`, exactly as `moveTodo` does. When the cascade removed any edges,
it raises the notice below.

### The notice

The page has one toast today, and it is an error: `state.actionError`, set by
`rolledBack`, painted red, carrying `role="alert"`. A successful move that cost
some connections is not an error, so it needs a second, quieter channel rather
than a reuse of that one.

- **`projectReducer.js`** — a `notice` field beside `actionError`, with
  `noticeRaised` and `noticeCleared` handlers. `rolledBack` also clears `notice`:
  a rolled-back move restores the edges, so a notice claiming they were removed
  would be a lie left on screen.
- **`projectActions.js`** — `noticeRaised(message)` and `noticeCleared()`.
- **`useProjectGraph.js`** — exposes `raiseNotice` and `dismissNotice`, mirroring
  the existing `dismissActionError`.
- **`ProjectPage.js`** — renders `state.notice` in a second `.project-toast` with
  a `--notice` modifier and `role="status"`, not `role="alert"`: it reports
  something that already happened and must not interrupt a screen reader
  mid-sentence.
- **`Project.css`** — `.project-toast--notice` overrides only the three colour
  declarations, on a neutral ground rather than the error palette.

The notice is raised optimistically, alongside the change it describes, and
dismissed by hand like the error toast. No timer: an auto-dismissing toast is one
more thing to make the E2E suite flaky, and this message is worth reading.

### Why the response does not enumerate deleted edges

The client computes the same removals from the same rule, using `canConnect` in
`graph.js` — the twin-derivation pattern the codebase already runs on for the
frontier. That keeps the endpoint's response shape identical to every other
mutation, keeps the optimistic path and its rollback uniform, and puts the rule
in one place per runtime rather than one place per direction of travel.

## 10. Testing

Test-first throughout, red before green, against the project's existing 80%
floor.

**Unit** — `resolveSequencePlacement` and the extracted position helpers;
`cascadeSequenceMove` for both the same-layer and cross-layer cases and for edge
invalidation; the clipped-endpoint filter in `edgePaths`; new
`frontierFixtures.json` cases for blocked to-dos and blocked sequences, read by
both twins.

**Integration** — `PUT /api/sequences/:id/move`: a cross-layer move reindexes
both layers, a same-layer move reindexes one, invalidated edges are gone and
valid ones survive, an out-of-range position answers 400 and writes nothing, a
layer in another project is refused, a sequence belonging to another user is
refused.

**Component** — the collapsed project card shows the title and not the frontier;
the frontier is present in the DOM for a screen reader; the layer divider button
carries its label; the notice toast renders `state.notice` with `role="status"`
and disappears when dismissed. Reducer-level: `noticeRaised` then `rolledBack`
leaves no notice standing.

**E2E** — `tests/e2e/criticalFlow.spec.js` gains a sequence dragged across
layers. Per-row scrolling and edge clipping go here too and nowhere else: jsdom
reports every rectangle as zero, so a scrolled row and a clipped edge cannot be
asserted anywhere but a real browser.

## 11. Amendments to the 2026-08-27 spec

Three statements in `2026-08-27-planapp-design.md` no longer describe the app:

- **§2, out of scope**: "Pan/zoom on the canvas. It is a plain scrolling
  container. Horizontal crowding when a layer holds many sequences is a known,
  accepted limitation." — Superseded by section 7. Pan and zoom remain out of
  scope; horizontal crowding is no longer accepted.
- **§2, out of scope**: "Dragging sequence cards to reposition or reorder them.
  Sequences are spaced evenly across their layer in creation order." —
  Superseded by section 9.
- **§4.6**: the canvas "has no scrolling of its own" — still true of the canvas;
  the layer rows inside it now do.

A short amendment note pointing here will be added to that document rather than
editing its body, so the original decisions stay legible.
