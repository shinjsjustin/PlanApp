# PlanApp — Build Prompts

Nine prompts, one per phase of §7 of
[the design spec](../specs/2026-08-27-planapp-design.md). Run them in order, one
per session (or one per compaction window). Each is self-contained: it names the
real files in this repo, states what "done" means, and ends green.

**Paste this preamble at the top of every phase prompt** (or keep the spec open
and say "same ground rules as last phase"):

> Read `docs/superpowers/specs/2026-08-27-planapp-design.md` first — it is the
> approved design and it wins over your own instincts about structure. Work
> test-first: write the failing test, watch it fail, write the minimal code,
> watch it pass, refactor. Immutable data only — construct new objects, never
> mutate. Files stay under ~400 lines; split when they grow. Every error is
> handled explicitly and surfaced; nothing is swallowed. Do not implement
> anything from a later phase. When the phase is done, run the full test suite
> and show me the output.

Read docs/superpowers/specs/2026-08-27-planapp-design.md first — it is the approved design and it wins over your own instincts about structure. Work test-first: write the failing test, watch it fail, write the minimal code, watch it pass, refactor. Immutable data only — construct new objects, never mutate. Files stay under ~400 lines; split when they grow. Every error is handled explicitly and surfaced; nothing is swallowed. Do not implement anything from a later phase. When the phase is done, run the full test suite and show me the output.

---

## Phase 1 — Schema, template corrections, repositories

```
Implement phase 1 of the PlanApp build order: the database schema, the template
corrections, and the DB repository layer. No HTTP routes and no UI in this phase.

State of the repo you must account for before writing anything:
- `src/db/schema.sql` defines exactly one table, `admin`. Rename it to `users`,
  keeping every column as-is, and update the two call sites that reference it:
  `src/routes/auth.js` (two queries) and `src/routes/user.js` (one query).
  Remove the "TODO: Replace admin with your actual users table name" comments
  once done.
- Spec §4.1 also lists an `access_level` correction. Verify before acting:
  `src/routes/auth.js` already inserts `access_level = 1`, so that correction is
  already satisfied. Do not change it. Say so in your summary rather than
  silently skipping it.
- `src/db/db.js` exports a promise-based mysql2 pool. Use it; do not introduce
  an ORM.

Write into `src/db/schema.sql`:
- `projects`, `layers`, `sequences`, `todos`, `sequence_edges` exactly as
  specified in spec §4.2 — every FK, every ON DELETE rule (note `todos.sequence_id`
  is ON DELETE SET NULL, not CASCADE), every index, every default.
- The file must be runnable top-to-bottom against a fresh `planapp` schema.
  Add a matching teardown or `DROP TABLE IF EXISTS` preamble so it is re-runnable.

Then build `src/db/repositories/` — one small module per table
(`projectsRepo.js`, `layersRepo.js`, `sequencesRepo.js`, `todosRepo.js`,
`edgesRepo.js`) plus a shared `src/db/repositories/positions.js` holding the
dense-position reindexing helper described in spec §4.2. Repositories take
parameterised SQL only — never string-concatenated values. Each exposes plain
async functions; no classes.

Set up server testing as part of this phase: add `jest` and `supertest` to root
devDependencies and an `npm test` script. Write the tests first:
- `positions.js` reindexing: inserting at an index, removing from the middle,
  moving within a list — asserting the result is always dense 0..n-1 and that
  the helper returns a new array rather than mutating its input.
- Repository integration tests against a real test schema, each test wrapped in
  a transaction that is rolled back. Cover: deleting a sequence sets its todos'
  `sequence_id` to NULL rather than deleting them; deleting a project cascades
  to every child table; the `(parent_id, child_id)` uniqueness constraint on
  `sequence_edges` is enforced.

Tell me the exact command to point tests at a test database, and what I need to
create by hand before running them.
```

---

## Phase 2 — Projects CRUD API + home grid + create dialog

```
Implement phase 2 of the PlanApp build order: projects CRUD end to end. This is
the first clickable slice — I should be able to log in, land on /projects, create
a project, rename it, and delete it.

Before writing routes, settle one thing and tell me your call: spec §4.4 says
responses use "the template's envelope { success, data, error }", but no such
envelope exists — `src/routes/auth.js` and `src/routes/user.js` return bare JSON
today, and `src/client/src/components/Authentication/Login.js` reads
`data.token` off the raw response. Build the envelope as new shared middleware
(`src/middleware/respond.js` or similar) and apply it to the new /api routes.
Leave auth/user on their current bare shape for now so login keeps working, and
note the inconsistency in your summary — do not half-migrate them.

Server:
- `src/routes/projects.js` with the five project endpoints from spec §4.4.
  `POST /api/projects` must also create one default layer at position 0, inside
  a transaction with the project insert.
- `src/middleware/assertOwnership.js` — the shared
  `assertOwnership(resourceType, id, userId)` helper from spec §4.4. It resolves
  any resource up to its owning project and 403s on mismatch. Build it now for
  every resource type, not just projects; later phases depend on it.
- `zod` for body validation at the route boundary; 400 with the specific field
  error on failure, 404 for missing resources, 403 for ownership, and a generic
  500 that logs full context server-side and leaks nothing.
- Mount the router in `src/server.js` behind `isAuth`, ABOVE the
  `express.static` / `app.get('*')` catch-all block — anything mounted below it
  is unreachable.
- Do NOT compute the ready frontier yet. `GET /api/projects` returns projects
  with a todo count; the frontier lands in phase 8.

Client:
- `src/client/src/lib/api.js` — the single fetch wrapper for the whole app. It
  attaches the JWT from localStorage, unwraps the envelope, and throws a typed
  `ApiError` carrying status and message. A 401 clears the token and redirects
  to /login.
- `components/Projects/ProjectsHome.js`, `ProjectCard.js`,
  `CreateProjectDialog.js`. Grid layout, an empty state prompting creation,
  a loading state, and a retry state on load failure.
- Add `/projects` to the flat route table in `src/client/src/routes.js`, wrapped
  in `ProtectedRoute`. Change Login's post-auth `navigate('/dashboard')` to
  `/projects`. Leave the `/dashboard` route and the `Dashboard` component in
  place, unused — do not delete them.

Tests first:
- supertest integration: each endpoint's happy path; 403 when another user's
  project id is passed to GET/PATCH/DELETE; 400 on an empty title; the default
  layer actually existing after POST.
- RTL: ProjectsHome empty state, populated grid, and error/retry state with the
  API mocked.
```

---

## Phase 3 — Full-graph fetch, reducer, read-only canvas

```
Implement phase 3 of the PlanApp build order: the single full-graph endpoint,
the client-side state layer, and a read-only canvas. Nothing on the canvas is
editable yet and no edges are drawn — that is phases 4 and 7.

Server:
- `GET /api/projects/:id` returns one payload containing the project, its
  layers, sequences, edges, and todos, per spec §4.4. Batch the queries — five
  queries total, not one per layer or per sequence. Ownership enforced through
  `assertOwnership`.

Client — this is the phase that sets the shape of everything after it, so get it
right:
- `src/client/src/lib/graph.js` — the pure derived-value functions from spec
  §4.3: `sequenceStatus`, `readyFrontier`, `canConnect`. Exact semantics: an
  empty sequence is 'incomplete'; `is_blocked` wins over everything; a sequence
  with no parents is ready as soon as it is incomplete; `canConnect` is strictly
  less-than on layer position, so same-layer and upward edges are both rejected.
  These are pure functions of plain data — no React, no fetch.
- `state/projectReducer.js` — normalised state (entities keyed by id), every
  case constructing new objects. Include the optimistic-update machinery now:
  creates use a temporary negative id, and there is an explicit reconcile action
  (temp id -> real id) and an explicit rollback action.
- `state/ProjectContext.js` and `state/projectActions.js`.
- `hooks/useProjectGraph.js` — loads the graph, exposes state plus mutation
  helpers. Mutation helpers dispatch optimistically, call the API, then
  reconcile or roll back and raise an error toast.
- `components/Project/ProjectPage.js` + `Canvas.js` + `LayerRow.js` +
  `SequenceCard.js`. Layers stack top to bottom by position; a LayerRow is a
  flex row; sequence cards are spaced evenly with justify-content. Cards
  collapse/expand in place and are collapsed by default. Nothing is absolutely
  positioned. The canvas is a plain scrolling container — no pan, no zoom.
- `components/Project/UnorganizedPanel.js` as a collapsible shell only; its
  contents arrive in phase 5.
- Route `/projects/:id` wrapped in `ProtectedRoute`; project cards link to it.

Tests first:
- `lib/graph.js`: every branch of `sequenceStatus`; `readyFrontier` including
  the all-complete-project empty case and the no-parents case; `canConnect`
  rejecting same-layer, upward, and cross-project pairs.
- `projectReducer`: every action, including optimistic create -> reconcile and
  optimistic create -> rollback, asserting the previous state object is
  unchanged after each dispatch.
- RTL: SequenceCard expand/collapse.
```

---

## Phase 4 — Layers and sequences CRUD

```
Implement phase 4 of the PlanApp build order: layer and sequence mutations, and
the buttons that drive them.

Server — the layer and sequence endpoints from spec §4.4:
- `POST /api/projects/:id/layers` with optional `{ afterLayerId }`: appends when
  absent, inserts directly below that layer when present, reindexing the
  positions of every layer beneath it inside one transaction.
- `PATCH /api/layers/:id`, `DELETE /api/layers/:id` — deleting a layer cascades
  to its sequences, whose todos then fall back to unorganized via ON DELETE SET
  NULL. Reindex the remaining layers.
- `POST /api/layers/:id/sequences` creates an untitled sequence at the end of
  that layer.
- `PATCH /api/sequences/:id` accepting `{ title?, description?, isBlocked? }`,
  and `DELETE /api/sequences/:id` with reindexing.
- All of it behind `assertOwnership` and zod-validated.

Client:
- The add-sequence button pins to the right of its layer row with
  `margin-left: auto`; the add-layer button sits below it in the same right-hand
  gutter. Reserve that gutter as a real, permanent column — phase 7 routes
  skip-edges through it, and retrofitting the space later will hurt.
- Inline editable titles on layers and sequences, saving on blur or Enter via a
  debounced PATCH. Escape reverts.
- The `is_blocked` toggle on a sequence card, and card styling that reflects
  derived status from `lib/graph.js` — blocked, complete, incomplete.
- Delete actions with a confirmation for anything that would orphan work; the
  confirm copy must say that a deleted sequence returns its to-dos to the
  unorganized panel rather than destroying them.
- Every mutation goes through the optimistic path built in phase 3.

Tests first:
- supertest: inserting a layer with `afterLayerId` produces dense 0..n-1
  positions; deleting a sequence leaves its todos alive with a NULL
  `sequence_id`; 403 on another user's layer and sequence ids.
- reducer cases for layer/sequence add, rename, delete, and blocked toggle.
```

---
Read docs/superpowers/specs/2026-08-27-planapp-design.md first — it is the approved design and it wins over your own instincts about structure. Work test-first: write the failing test, watch it fail, write the minimal code, watch it pass, refactor. Immutable data only — construct new objects, never mutate. Files stay under ~400 lines; split when they grow. Every error is handled explicitly and surfaced; nothing is swallowed. Do not implement anything from a later phase. When the phase is done, run the full test suite and show me the output.
## Phase 5 — To-dos

```
Implement phase 5 of the PlanApp build order: to-dos everywhere except
drag-and-drop, which is phase 6.

Remember the core property from spec §4.2: `todos.sequence_id IS NULL` means
unorganized. The unorganized panel is a filter over the project's todos, not a
separate collection. Do not add a table, a flag, or a synthetic "inbox"
sequence.

Server — the four todo endpoints from spec §4.4:
- `POST /api/projects/:id/todos` with `{ text, sequenceId? }`, null meaning
  unorganized. Appends at the end of the target list.
- `PATCH /api/todos/:id` with `{ text?, status? }`.
- `PUT /api/todos/:id/move` with `{ sequenceId|null, position }` — one endpoint
  covering both the drag-in and the reorder case, since both are "put this to-do
  at this position in this list". Reindex both the source and destination lists
  inside one transaction.
- `DELETE /api/todos/:id`, reindexing what remains.

Client:
- `components/Project/TodoComposer.js` — ONE component used by both the
  unorganized panel and the expanded sequence card. Submits on Enter, clears the
  field, and keeps focus so to-dos can be typed in rapidly one after another.
  Empty and whitespace-only input is rejected inline without a network call.
- `components/Project/TodoItem.js` — the text, a status control cycling
  incomplete/complete/blocked, and a per-item menu with "Move to unorganized"
  and "Delete". That menu action is how a to-do leaves a sequence; it is
  deliberately not a drag.
- Fill in `UnorganizedPanel` with the composer and the list of unorganized
  to-dos, plus a count in its collapsed header.
- The expanded sequence card lists its to-dos in position order with a composer
  at the bottom.
- Sequence card status re-derives from `lib/graph.js` the moment a to-do is
  ticked — no stored status anywhere.

Tests first:
- supertest on `todos/:id/move`: the drag-in path (NULL -> a sequence at an
  index), the reorder path (within one sequence), and the move-out path (to
  NULL), each asserting both affected lists end dense.
- RTL on TodoComposer: Enter adds, the field clears, focus is retained, and
  whitespace-only input is rejected without dispatching.
```

---
Read docs/superpowers/specs/2026-08-27-planapp-design.md first — it is the approved design and it wins over your own instincts about structure. Work test-first: write the failing test, watch it fail, write the minimal code, watch it pass, refactor. Immutable data only — construct new objects, never mutate. Files stay under ~400 lines; split when they grow. Every error is handled explicitly and surfaced; nothing is swallowed. Do not implement anything from a later phase. When the phase is done, run the full test suite and show me the output.
## Phase 6 — Drag-and-drop

```
Implement phase 6 of the PlanApp build order: drag-and-drop with @dnd-kit. Add
`@dnd-kit/core` and `@dnd-kit/sortable` to the CLIENT package
(`src/client/package.json`), not the root.

Scope, exactly as spec §4.7 and §2 fix it — hold this line even if the library
makes more feel easy:
- Draggables: unorganized to-dos, and to-dos inside an expanded sequence card.
- Droppables: a sequence card body (appends to the end), and `DropZone` gaps
  between to-dos in an expanded card (inserts at that index).
- Reordering within one sequence uses the sortable preset.
- Cross-sequence drops are REJECTED in v1 — dropping a to-do from sequence A
  onto sequence B does nothing, with a clear visual signal that the target is
  not eligible while dragging.
- Dragging a to-do back to the unorganized panel is NOT supported. That is the
  per-item menu action from phase 5.
- Sequence cards themselves are NOT draggable. They are spaced evenly across
  their layer in creation order.

Configure the pointer sensor with an activation constraint so a click on a
to-do's status control or menu is never swallowed by a drag, and register the
keyboard sensor so the whole thing is operable without a mouse.

Every drop goes through the existing `PUT /api/todos/:id/move` from phase 5 and
the existing optimistic path — no new endpoint, no new reducer machinery. A
failed move rolls the list back to its pre-drag order and toasts.

Tests first:
- Reducer-level tests for the move action covering append-to-sequence,
  insert-at-index, and rollback-restores-original-order.
- An RTL test that the drag handle is present and that keyboard activation
  reaches the move dispatch. Do not try to assert pixel-level drag behaviour in
  jsdom; the real drag is covered by the phase 9 E2E flow.
```

---
Read docs/superpowers/specs/2026-08-27-planapp-design.md first — it is the approved design and it wins over your own instincts about structure. Work test-first: write the failing test, watch it fail, write the minimal code, watch it pass, refactor. Immutable data only — construct new objects, never mutate. Files stay under ~400 lines; split when they grow. Every error is handled explicitly and surfaced; nothing is swallowed. Do not implement anything from a later phase. When the phase is done, run the full test suite and show me the output.
## Phase 7 — Edges

```
Implement phase 7 of the PlanApp build order: sequence edges — connect mode,
measurement, and the SVG edge overlay. This is the hardest phase and it lands on
a canvas that phases 3-6 already proved renders and persists correctly. Do not
redesign the layout to make edges easier; the measurement approach exists
precisely so the layout stays untouched.

Server:
- `POST /api/projects/:id/edges` with `{ parentId, childId }`, validating
  `canConnect` server-side — same project, and the parent's layer position
  strictly less than the child's. Reject with 400 and a specific message
  otherwise.
- `DELETE /api/projects/:id/edges?parentId=&childId=` — query parameters, not a
  body.
- No cycle detection. Layer ordering makes cycles structurally impossible, and
  adding a check would imply otherwise.

Client — connect mode (spec §4.7):
- `hooks/useConnectSelection.js` holds a SET of selected parent sequence ids.
  Clicking a `ConnectorDot` toggles that sequence in or out of the set and fills
  the dot in.
- While the set is non-empty the canvas is in connect mode: sequences in a layer
  strictly below EVERY selected parent get an eligible outline; everything else
  dims.
- Clicking an eligible sequence toggles each (parent, child) edge — created if
  absent, deleted if present — then clears the selection. One gesture both
  tethers and untethers, and several parents can be untethered at once.
- Escape, or a click on empty canvas, clears the selection.

Client — measurement and rendering (spec §4.6):
- Each `ConnectorDot` and `SequenceCard` registers its DOM node in a ref map
  keyed by sequence id.
- `hooks/useNodePositions.js` runs a `useLayoutEffect` plus a `ResizeObserver`
  on the canvas element and produces canvas-relative coordinates for every
  connector dot and every card's top edge. This is what catches expand/collapse,
  window resize, and panel collapse without any of those features knowing edges
  exist — so do not add explicit edge-recalculation calls into those features.
- `lib/geometry.js` holds ALL path math as pure functions of measured
  coordinates, with no DOM access: adjacent-layer edges are a vertical cubic
  bezier from the parent's dot to the child's top edge; skip-layer edges route
  orthogonally out of the dot, right into a lane in the right-hand gutter, down
  past the intervening layers, then left into the child's top edge. Each
  concurrent skip edge gets its own lane index so they never overlap.
- `components/Project/EdgeLayer.js` renders one `<path>` per edge from those
  coordinates, in an SVG overlay BEHIND the cards.

Tests first:
- supertest: the edge endpoint rejecting a same-layer pair, an upward pair, and
  a cross-project pair; the DELETE query-param form removing the right row; the
  unique constraint surfacing as a clean error rather than a 500.
- `lib/geometry.js` unit tests: lane assignment for two and three overlapping
  skip edges, adjacent-layer path generation, and skip-layer path generation —
  all as pure input/output, no DOM.
- RTL: connect-mode eligibility highlighting — with one parent selected, only
  strictly-lower sequences carry the eligible class.

jsdom has no layout and no ResizeObserver. Do not assert anything that depends
on real measurement in unit tests; that is what the pure geometry functions and
the phase 9 E2E flow are for.
```

---
Read docs/superpowers/specs/2026-08-27-planapp-design.md first — it is the approved design and it wins over your own instincts about structure. Work test-first: write the failing test, watch it fail, write the minimal code, watch it pass, refactor. Immutable data only — construct new objects, never mutate. Files stay under ~400 lines; split when they grow. Every error is handled explicitly and surfaced; nothing is swallowed. Do not implement anything from a later phase. When the phase is done, run the full test suite and show me the output.
## Phase 8 — Ready frontier on the home page

```
Implement phase 8 of the PlanApp build order: the ready frontier, computed
server-side and rendered on the projects home page.

Server:
- Mirror `lib/graph.js`'s derived logic server-side (spec §4.3) — sequence
  status, then the frontier: ready sequences are those whose status is not
  'complete' AND every parent sequence IS 'complete'; for each ready sequence
  take its first 'incomplete' to-do by position.
- `GET /api/projects` returns each project with its frontier and its overall
  to-do progress (e.g. 12/34).
- Compute every project's frontier from ONE batched set of queries over the
  owner's sequences, edges, and todos — not one query per project, and not one
  per sequence. Prove it: add a test that asserts the query count is constant as
  the number of projects grows. An N+1 here is the specific failure this phase
  is written to avoid.
- Keep the client and server derivations in step. If you can share one module
  between them without contorting the build, do that and say so; if not, put a
  comment in each pointing at the other, and make the tests for both read from
  one shared table of fixtures so they cannot drift silently.

Client:
- `ProjectCard` grows a body block listing the frontier — one line per ready
  sequence showing the sequence name and its next incomplete to-do.
- A project with an empty frontier shows a completed state, distinct from a
  project with no sequences at all.
- The title block shows overall progress.

Tests first:
- Frontier fixtures covering: a sequence with no parents; a sequence with two
  parents where only one is complete (not ready); the same with both complete
  (ready); a blocked sequence; an all-complete project returning an empty
  frontier; and the drone example from spec §1 end to end.
- RTL: the frontier list, the empty-frontier completed state, and the
  no-sequences state.
```

---
Read docs/superpowers/specs/2026-08-27-planapp-design.md first — it is the approved design and it wins over your own instincts about structure. Work test-first: write the failing test, watch it fail, write the minimal code, watch it pass, refactor. Immutable data only — construct new objects, never mutate. Files stay under ~400 lines; split when they grow. Every error is handled explicitly and surfaced; nothing is swallowed. Do not implement anything from a later phase. When the phase is done, run the full test suite and show me the output.

## Phase 9 — E2E and polish

```
Implement phase 9 of the PlanApp build order: E2E coverage and polish. Add
`@playwright/test` to the ROOT devDependencies.

Write one critical-flow E2E test that walks the whole product, per spec §6:
register a new account, create a project, add an unorganized to-do, add a
sequence, drag the to-do into it, mark it complete, add a layer, connect two
sequences across those layers, and confirm the home page frontier updates to
reflect all of it. This is the only test that exercises real layout, real
drag-and-drop, and real edge rendering — everything jsdom cannot see. Assert
that an edge path is actually present in the DOM with non-degenerate
coordinates, not merely that an edge row exists in state.

Then the polish pass:
- Run the whole suite and report coverage against the 80% target. Where a file
  is short, say whether the gap is worth closing or is genuinely untestable in
  jsdom — do not write assertions purely to move the number.
- Audit for swallowed errors: every catch either handles or surfaces. Every
  mutation failure rolls back AND toasts.
- Confirm no route is reachable without `isAuth` and no resource is reachable
  without `assertOwnership`. Attempt one cross-user request against every
  resource type and confirm all 403.
- Confirm no console.log or debug statements remain, and no secrets are
  hardcoded.
- Keyboard path: the connect gesture, the composer, and the DnD keyboard sensor
  all operable without a mouse.
- Check file sizes; split anything over ~400 lines.

Give me a short written list of what is deliberately unfinished in v1 —
horizontal crowding when a layer holds many sequences, no pan/zoom, no
cross-sequence drag — so it is on the record rather than looking like a bug.
```

---

## Between phases

After each phase, before starting the next:

```
Review what phase N just produced against
docs/superpowers/specs/2026-08-27-planapp-design.md and against the coding
standards in my global rules. Flag anything CRITICAL or HIGH, and anything that
drifted from the spec — especially scope that crept in from a later phase. Do
not fix anything yet; show me the list first.
```
