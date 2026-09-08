# PlanApp — Design Spec

**Date:** 2026-08-27
**Status:** Approved, ready for implementation planning

**Amended by:** `2026-09-07-planapp-ui-changes-design.md`, which supersedes three
statements below. §2 puts horizontal crowding and sequence dragging out of scope;
both are now in. §4.6 says the canvas has no scrolling of its own — still true of
the canvas, but its layer rows now scroll sideways. The original text is left as
written so the decisions it records stay legible.

---

## 1. Purpose

PlanApp is a project planner built around a layered dependency graph. A project is
not a flat checklist: it is a set of **sequences** (ordered runs of to-do items)
arranged in **layers**, connected by edges that express "this work must finish
before that work can start." The payoff is answering one question at a glance —
*what can I actually work on right now?* — across several parallel threads.

Worked example (used throughout): building a drone. A `learning` layer holds three
parallel sequences — learn aerodynamics, learn electronics, learn network
communications. Aerodynamics and electronics both feed into `design rotor system`
in the next layer. Network communications skips that layer entirely and feeds
directly into `connect drone to wifi` further down.

## 2. Scope

**In scope (v1):**

- Multi-user: anyone can register; each user sees only their own projects.
- Projects home page: grid of project cards, each showing its ready frontier.
- Project page: collapsible unorganized to-do panel + layered graph canvas.
- Full CRUD on projects, layers, sequences, to-dos, and edges.
- Drag a to-do from the unorganized panel into a sequence; reorder to-dos within a
  sequence.
- Click-to-connect sequences across layers.

**Explicitly out of scope (v1):**

- Sharing or collaboration between users. Projects have a single owner.
- Pan/zoom on the canvas. It is a plain scrolling container. Horizontal crowding
  when a layer holds many sequences is a known, accepted limitation.
- Dragging to-dos between sequences, or dragging to-dos back to the unorganized
  panel. Moving a to-do out is done through a per-item menu action, not a drag.
- Dragging sequence cards to reposition or reorder them. Sequences are spaced
  evenly across their layer in creation order.
- Due dates, reminders, attachments, and comments.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Multi-user from day one, no sharing | Keeps the auth the template already ships; ownership check on every endpoint |
| 2 | Sequence cards collapse/expand in place, **expanded by default** | A plan is read by seeing the work in it; collapsing folds away what is done with |
| 3 | Edges: many parents, many children, strictly downward, may skip layers | Layer ordering alone makes cycles structurally impossible — no cycle detection |
| 4 | Sequence status derived, with a manual `blocked` override | Status can never go stale; `blocked` stays a deliberate signal |
| 5 | Home page shows the **ready frontier** | "What can I start now", not "everything outstanding" |
| 6 | Canvas = DOM cards + measured SVG edge overlay | Matches the exact layout rules; no library to fight; inputs and DnD work natively |
| 7 | Untether by re-clicking the child while the parent is selected | One gesture creates and removes; can untether several parents at once |
| 8 | `@dnd-kit` for drag-and-drop | Pointer-based, keyboard sensor included, testable in Playwright |
| 9 | Optimistic UI with per-action REST calls | Feels instant; no whole-graph saves to conflict |

## 4. Architecture

React 18 (Create React App) SPA calling an Express + MySQL API, both already
scaffolded in this repo. JWT bearer auth in `localStorage`, validated by the
existing `isAuth` middleware.

```
Browser                          Server                    MySQL
─────────                        ──────                    ─────
ProjectsHome  ──GET /api/projects──▶  projectsRouter ──▶ projects
                                       └ frontier calc      sequences
ProjectPage   ──GET /api/projects/:id▶ (batched)            layers
  └ useProjectGraph                                         todos
      ├ projectReducer (pure, immutable)                    sequence_edges
      └ optimistic mutation ──PATCH/POST/DELETE──▶ resource routers
```

### 4.1 Template corrections

Two scaffold defaults conflict with multi-user and are fixed in phase 1:

1. The users table is named `admin`. Rename to `users`, updating
   `src/routes/auth.js`, `src/routes/user.js`, and `src/db/schema.sql` — the
   template already carries TODO comments marking each call site.
2. `register` inserts `access_level = 0` (pending approval) while
   `ProtectedRoute` requires `1`, so every new signup is locked out. Register
   grants `access_level = 1`.

### 4.2 Data model

All tables cascade from `projects`, which cascades from `users`.

**`projects`** — `id`, `owner_id` FK → `users(id)` ON DELETE CASCADE, `title`,
`description` NULL, `created_at`, `updated_at`. Index on `owner_id`.

**`layers`** — `id`, `project_id` FK ON DELETE CASCADE, `title` (default
`'Untitled layer'`), `position` INT (0-based, top to bottom), timestamps. Index on
`(project_id, position)`.

**`sequences`** — `id`, `project_id` FK, `layer_id` FK ON DELETE CASCADE, `title`
(default `'Untitled sequence'`), `description` NULL, `is_blocked` BOOL DEFAULT 0,
`position` INT (left to right within the layer), timestamps. Index on
`(layer_id, position)`.

**`todos`** — `id`, `project_id` FK, `sequence_id` FK ON DELETE **SET NULL**,
`text` VARCHAR(500), `status` ENUM(`'incomplete'`,`'complete'`,`'blocked'`)
DEFAULT `'incomplete'`, `position` INT, timestamps. Index on
`(project_id, sequence_id, position)`.

**`sequence_edges`** — `id`, `project_id` FK, `parent_id` FK → `sequences(id)` ON
DELETE CASCADE, `child_id` FK → `sequences(id)` ON DELETE CASCADE. UNIQUE
`(parent_id, child_id)`. Index on `project_id`.

Two properties this model is built around:

- **`todos.sequence_id IS NULL` means unorganized.** The unorganized panel is a query,
  not a separate table. Because the FK is ON DELETE SET NULL, deleting a sequence
  returns its to-dos to the unorganized panel rather than destroying them.
- **Sequence status is not stored.** Only `is_blocked` is persisted. Everything
  else is computed, so it cannot go stale when a to-do is ticked off.

`position` columns are dense (`0..n-1`). Reordering rewrites the affected rows
inside a transaction. Fine at the list sizes involved; revisit only if it bites.

### 4.3 Derived values

Defined once in `src/client/src/lib/graph.js` and mirrored server-side for the
home page:

```
sequenceStatus(sequence, todos):
  if sequence.is_blocked            -> 'blocked'
  if todos.length > 0 and all complete -> 'complete'
  else                              -> 'incomplete'
```

An empty sequence is `incomplete`.

```
readyFrontier(project):
  ready sequences = those where sequenceStatus != 'complete'
                    AND every parent sequence is 'complete'
  for each ready sequence, take its first 'incomplete' to-do by position
```

A sequence with no parents is ready as soon as it is incomplete. A project with
every sequence complete has an empty frontier.

```
canConnect(parent, child, layers):
  parent.project_id == child.project_id
  AND layerPosition(parent) < layerPosition(child)
```

Strictly less-than, so same-layer and upward edges are both rejected. Because
every edge decreases in layer position, the graph is acyclic by construction.

### 4.4 API

Everything under `/api`, everything behind `isAuth`. A shared
`assertOwnership(resourceType, id, userId)` helper resolves any resource up to its
owning project and returns 403 on mismatch. Request bodies are validated with
`zod` at the route boundary. Responses use the template's envelope
(`{ success, data, error }`).

```
GET    /api/projects                 list + ready frontier for each
POST   /api/projects                 { title, description? } — also creates one
                                     default layer at position 0
GET    /api/projects/:id             full graph: project, layers, sequences,
                                     edges, todos — one payload
PATCH  /api/projects/:id             { title?, description? }
DELETE /api/projects/:id

POST   /api/projects/:id/layers      { afterLayerId? } — appends, or inserts below
PATCH  /api/layers/:id               { title }
DELETE /api/layers/:id

POST   /api/layers/:id/sequences     creates an untitled sequence at the end
PATCH  /api/sequences/:id            { title?, description?, isBlocked? }
DELETE /api/sequences/:id

POST   /api/projects/:id/todos       { text, sequenceId? }  (null = unorganized)
PATCH  /api/todos/:id                { text?, status? }
PUT    /api/todos/:id/move           { sequenceId|null, position }
DELETE /api/todos/:id

POST   /api/projects/:id/edges       { parentId, childId } — validates canConnect
DELETE /api/projects/:id/edges       ?parentId=&childId= (query, not a body)
```

`PUT /api/todos/:id/move` is deliberately one endpoint covering both the drag-in
and the reorder case; both are "put this to-do at this position in this list."

`GET /api/projects` computes every project's frontier from one batched set of
queries over the owner's sequences, edges, and to-dos — not per-project. No N+1.

### 4.5 Frontend structure

Routes added to the existing flat table in `src/client/src/routes.js`, both wrapped
in `ProtectedRoute`: `/projects` and `/projects/:id`. Login's post-auth redirect
moves from `/dashboard` to `/projects`. The template's `Dashboard` route stays in
place, unused, rather than being deleted as part of this work.

```
components/Projects/   ProjectsHome  ProjectCard  CreateProjectDialog
components/Project/    ProjectPage  UnorganizedPanel  Canvas  LayerRow
                       SequenceCard  ConnectorDot  EdgeLayer
                       TodoComposer  TodoItem  DropZone
state/                 ProjectContext  projectReducer  projectActions
hooks/                 useProjectGraph  useNodePositions  useConnectSelection
lib/                   api.js  graph.js  geometry.js
```

`TodoComposer` is a single component used by both the unorganized panel and the
expanded sequence card — same field, same add button, same Enter-to-submit-and-
refocus behavior.

### 4.6 Canvas layout and edge rendering

A layer is a flex row. Sequence cards are spaced evenly with `justify-content`;
the add-sequence button pins to the right with `margin-left: auto`, and the
add-layer button sits below it in the same right-hand gutter. Expanding a card
grows its row; nothing is absolutely positioned.

Edges are drawn in an SVG overlay behind the cards:

1. Each `ConnectorDot` and `SequenceCard` registers its DOM node in a ref map
   keyed by sequence id.
2. `useNodePositions` runs a `useLayoutEffect` plus a `ResizeObserver` on the
   canvas element and produces canvas-relative coordinates for each connector dot
   and each card's top edge.
3. `EdgeLayer` renders one `<path>` per edge from those coordinates.

The `ResizeObserver` catches expand/collapse, window resize, and panel collapse
without any of those features needing to know edges exist.

**Routing.** Edges between adjacent layers are a vertical cubic bezier from the
parent's dot to the child's top edge. Edges that skip one or more layers route
orthogonally: out from the dot, right into a lane in the right-hand gutter, down
past the intervening layers, then left into the child's top edge. Each skip edge
gets its own lane index so concurrent skip edges do not overlap. All of this path
math lives in `lib/geometry.js` as pure functions of the measured coordinates, so
it is unit-testable without a DOM.

### 4.7 Interactions

**Adding to-dos.** `TodoComposer` submits on Enter, clears, and keeps focus, so
to-dos can be typed in rapidly one after another. Empty and whitespace-only input
is rejected inline.

**Connecting.** `useConnectSelection` holds a set of selected parent sequence ids.
Clicking a connector dot toggles it in or out of the set and fills it in. While the
set is non-empty the canvas is in connect mode: sequences in a layer strictly
below *every* selected parent get an eligible outline, all others dim. Clicking an
eligible sequence toggles each `(parent, child)` edge — created if absent, deleted
if present — then clears the selection. Escape or a click on empty canvas also
clears it.

**Drag-and-drop** (`@dnd-kit`). Draggables: unorganized to-dos, and to-dos inside
an expanded sequence. Droppables: a sequence card body (appends), and `DropZone`
gaps between to-dos in an expanded card (inserts at that index). Cross-sequence
drops are rejected in v1; the sortable preset handles reorder within a sequence.
Moving a to-do out of a sequence is a per-item menu action ("Move to unorganized"
/ "Delete"), not a drag.

**Optimistic updates.** The reducer applies each change immediately, using a
temporary negative id for creates. The API response either reconciles the real id
in or rolls the action back and raises an error toast. Every reducer case
constructs new objects; nothing is mutated in place.

**Editing titles.** Sequence and layer titles are inline inputs that save on blur
or Enter via a debounced PATCH.

### 4.8 Projects home page

A responsive grid of project cards. Each card has a title block (project title,
overall to-do progress such as `12/34`) and a body block listing the ready
frontier — one line per ready sequence, showing the sequence name and its next
incomplete to-do. A project with an empty frontier shows a completed state. The
grid has an empty state prompting project creation.

## 5. Error handling

- **Server:** every route validates its body with `zod` and returns 400 with the
  specific field error on failure. `assertOwnership` returns 403. Missing
  resources return 404. Unexpected errors are logged with full context server-side
  and returned as a generic 500 message, never leaking internals.
- **Client:** `lib/api.js` is the single fetch wrapper; it attaches the JWT,
  unwraps the response envelope, and throws a typed `ApiError`. Mutations catch it,
  roll the optimistic change back, and surface a human-readable toast. A 401
  clears the token and redirects to login. Load failures on the project page show a
  retry state rather than a blank canvas.
- No error is swallowed silently.

## 6. Testing

Client testing runs on the existing `react-scripts` Jest + React Testing Library
setup. The server has none, so `jest` and `supertest` are added to root devDeps.
Target is 80% coverage.

- **Unit:** `projectReducer` across every action including optimistic rollback;
  `lib/graph.js` (`canConnect` layer-order rule, derived status, ready frontier);
  `lib/geometry.js` (lane assignment, path generation); the position-reindexing
  helper.
- **Integration:** supertest against the Express app on a test schema, each test
  in a rolled-back transaction. Priority cases: ownership 403s on every resource
  type; the edge endpoint rejecting same-layer and upward connections;
  `todos/:id/move` on both the drag-in and reorder paths; the ON DELETE SET NULL
  cascade returning to-dos to unorganized when a sequence is deleted.
- **Component:** RTL for `TodoComposer` (Enter adds and refocuses),
  `SequenceCard` expand/collapse, and connect-mode eligibility highlighting.
- **E2E:** Playwright, one critical flow — register, create a project, add an
  unorganized to-do, add a sequence, drag the to-do in, mark it complete, add a
  layer, connect two sequences, and confirm the home page frontier updates.

jsdom provides no layout and no `ResizeObserver`, so nothing depending on real
measurement is asserted in unit tests. That is exactly why the path math is
extracted into pure functions in `lib/geometry.js`; visual edge correctness is
covered by the E2E flow instead.

## 7. Build order

Each phase is test-driven, ends green, and is independently reviewable.

1. Schema migration, the two template corrections, and DB repositories
2. Projects CRUD API + home grid + create dialog — first clickable slice
3. `GET /api/projects/:id` full graph + reducer + read-only canvas (layers and
   cards, no edges)
4. Layers and sequences CRUD + the add-sequence and add-layer buttons
5. To-dos: unorganized panel, `TodoComposer`, in-card lists, status toggles
6. Drag-and-drop with `@dnd-kit`
7. Edges: connector dots, connect mode, measurement, `EdgeLayer` routing
8. Ready frontier on the home page
9. E2E coverage and polish

Phases 1–2 produce something loggable-into and clickable immediately. Edges, the
hardest part, land late on top of a canvas already proven to render and persist
correctly.

## 8. Dependencies added

| Package | Where | Why |
|---|---|---|
| `zod` | server | Boundary validation on every route body |
| `jest`, `supertest` | server (dev) | Integration tests; the server has no test setup today |
| `@dnd-kit/core`, `@dnd-kit/sortable` | client | Pointer-based DnD with a keyboard sensor |
| `@playwright/test` | root (dev) | E2E critical flow |
