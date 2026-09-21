# Pinned To-Dos, Unified Sequence Lists, and Editable Descriptions

**Date:** 2026-09-18  
**Status:** Complete — implementation, integration review, and all validation gates passed (2026-09-20)
**Scope:** Database, API, Project detail, Projects Home, Calendar, automated tests

## 1. Goal

Replace the app's frontier/“next step” model with explicit user-controlled pins.
A pin identifies work the user wants to keep visible across the Project page,
Projects Home, and Calendar without moving the to-do from its current sequence
or the Unorganized panel.

This change also:

- adds atomic multi-select Pin and Unpin workflows to the Project page;
- makes every sequence containing a pinned to-do visually active;
- emphasizes the topmost pinned to-do in each active sequence;
- renders outstanding sequence to-dos as one uniform list, with no “Next Step”
  spotlight or “Then” section;
- moves Unorganized to the bottom-right and closes it by default;
- adds an editable multiline project description;
- changes the empty-description prompt to “What problem are you trying to
  solve?”;
- shows sequence descriptions while cards are collapsed; and
- keeps completed and blocked pinned work visible in Calendar with distinct
  status styling.

## 2. Resolved Product Decisions

1. **Pinning does not move a to-do.** It only changes `isPinned` and adds a pin
   indicator wherever that to-do is rendered.
2. **Every to-do can be pinned:** filed, unorganized, incomplete, blocked, or
   complete.
3. **Completion does not remove a pin or a calendar booking.** A completed item
   is crossed out and remains visible. Deleting the to-do remains the only action
   that removes its booking through the existing foreign-key cascade.
4. **Unpinning does not unschedule an existing booking.** It removes the item
   from pinned lists and sequence-active calculations, but the historical
   calendar booking remains until explicitly unscheduled or the to-do is deleted.
5. **Blocked calendar items have a red border.** Apply this to both the pinned
   pool row and a booked day card so the status is visible before and after
   scheduling.
6. **Pins replace frontier everywhere:** Projects Home payloads/cards, Calendar's
   right panel, and Project-page sequence activity.
7. **A sequence is active when it contains at least one pinned to-do.** More than
   one sequence may therefore be active at once.
8. **The topmost pinned item** is the pinned to-do with the smallest stored
   `position` in that sequence. Its emphasis is additive: a complete item stays
   crossed out and a blocked item keeps its blocked styling.
9. **Outstanding sequence items use one row style.** The special spotlight and
   the “THEN” heading are removed. The existing Done group remains, because it
   represents completion rather than ordering priority.
10. **Blank descriptions remain null in storage.** The question “What problem
    are you trying to solve?” is UI prompt text, not saved content.
11. **Existing data is not auto-pinned during migration.** Existing calendar
    bookings remain intact; projects initially have no pins until the user makes
    an explicit choice.

## 3. Target User Experience

### 3.1 Project-page Pin and Unpin modes

Place two controls in the Project header: **Pin** and **Unpin**.

At rest:

- `Pin` starts pin mode.
- `Unpin` starts unpin mode.
- Pinned rows show a persistent pin icon but otherwise stay in their sequence or
  Unorganized list.

In pin mode:

- only unpinned to-dos are eligible and highlighted;
- clicking any eligible row toggles it in the pending selection;
- `Pin` changes to `Confirm`;
- `Unpin` changes to `Cancel`;
- `Confirm` is disabled while no rows are selected;
- confirming performs one atomic request and exits selection mode on success;
- cancellation clears the draft selection without sending a request.

In unpin mode the behavior is symmetric:

- only pinned to-dos are eligible and highlighted;
- `Unpin` changes to `Confirm`;
- `Pin` changes to `Cancel`.

While either selection mode is active, a transparent selection control covers
an eligible row. This lets the entire row be clicked without accidentally
checking, dragging, deleting, or opening its action menu. The selection control
must be keyboard reachable and expose `aria-pressed` plus a label naming the
operation and to-do.

The pending selection is local UI state. The project graph is not modified until
Confirm, after which the normal optimistic mutation/rollback path applies the
whole batch.

### 3.2 Sequence presentation

For each sequence:

- derive `hasPinnedTodo` from its own to-dos;
- derive `topPinnedTodoId` from pinned to-dos sorted by `position`;
- add an active/ring treatment to every sequence with `hasPinnedTodo`;
- render every non-complete to-do through the same sortable row component;
- add a pin icon to pinned rows;
- add an emphasis modifier to the row whose id is `topPinnedTodoId`;
- keep complete to-dos in the Done group, including their pin icon and top-pin
  emphasis when applicable;
- remove `SequenceSpotlight`, `SortableSpotlight`, “NEXT STEP,” “NEXT,” and
  “THEN” UI paths;
- keep sequence status (`Blocked`, `Complete`, `Incomplete`) independent from
  pin activity, so a pinned blocked or complete sequence does not lose its true
  status.

A collapsed sequence shows:

- title;
- multiline description, or the empty-description prompt;
- progress/status summary;
- top pinned to-do when one exists, with its pin, blocked, and complete states.

### 3.3 Unorganized panel

- Change the fixed dock from `left` to `right` in `Project.css`.
- Initialize `isExpanded` to `false`.
- Preserve the count in the collapsed pill.
- Its rows participate in Pin/Unpin selection and show pin icons exactly like
  sequence rows.

### 3.4 Project description

Add a focused `InlineDescription` component rather than stretching
`InlineTitle` beyond its one-line contract.

Behavior:

- render a `<textarea>` below the project title;
- support multiline text up to the existing 2,000-character server limit;
- use “What problem are you trying to solve?” as the placeholder/prompt for a
  null description;
- save on blur through the existing debounced mutation style;
- use `Cmd+Enter`/`Ctrl+Enter` as an explicit keyboard commit while plain Enter
  inserts a newline;
- use Escape to cancel a pending edit and restore the stored value;
- trim the outer whitespace at the API boundary while preserving internal
  newlines;
- submit an empty draft as `null`;
- update the project graph optimistically and roll back with the existing toast
  if PATCH fails.

Use the same empty-description wording on sequence cards so open and collapsed
states do not disagree. This pass does not add sequence-description editing; it
only displays the sequence description in both card states.

### 3.5 Projects Home

Replace each card's Ready Now/frontier block with a **Pinned** block.

- `project.pinnedTodos` is rendered in deterministic project order.
- Each row shows a pin icon, to-do text, and sequence title when filed.
- Unorganized pinned items are labeled `Unorganized`.
- Complete pinned items remain listed and crossed out.
- Empty state: `No pinned to-dos yet.`
- Existing overall progress and project description remain unchanged.

Remove frontier-specific empty states such as “everything is blocked” and “every
sequence is complete”; pins are an explicit list, so an empty list has one
meaning.

### 3.6 Calendar

The right panel reads `project.pinnedTodos`, not `project.frontier`.

- Include all pinned statuses and unorganized pinned items.
- Keep scheduled rows in the panel with their Day badge, as today.
- Complete rows are crossed out in both the panel and booked day card.
- Blocked rows receive a full red border in both the panel and booked day card.
- Show a pin icon on currently pinned pool rows and bookings.
- An unscheduled complete pin remains visible but is not a drag source; completed
  work can be reviewed but not newly booked.
- A blocked pin remains draggable unless already scheduled.
- Completing a booked item refreshes the pinned pool so its same row changes to
  complete rather than being replaced by a frontier successor.
- Existing booked items continue to render even when later unpinned. The calendar
  item payload carries current `isPinned`, so its icon disappears after the next
  read while the booking itself remains.

## 4. Data Model and Migration

Add one persisted boolean to `todos`:

```sql
ALTER TABLE `todos`
  ADD COLUMN `is_pinned` tinyint(1) NOT NULL DEFAULT '0' AFTER `completed_at`,
  ADD KEY `idx_todos_project_pinned` (`project_id`, `is_pinned`);
```

Update the destructive `CREATE TABLE todos` definition and add the in-place
migration note at the top of `src/db/schema.sql`.

Why the pin belongs on `todos`:

- it is intrinsic to the to-do and survives moving between sequences;
- sequence deletion already keeps to-dos and therefore keeps their pins;
- project deletion naturally cascades it;
- no join table is needed because pinning has no per-user multiplicity inside a
  user-owned project.

No backfill beyond the default is performed. Existing rows become unpinned;
existing `calendar_items` rows are untouched.

## 5. API and Server Design

### 5.1 Serialization and repositories

Add `isPinned: Boolean(row.is_pinned)` to `toTodo` and include `is_pinned` in all
`todosRepo` select lists.

Add repository operations:

- `listPinnedByOwner(conn, ownerId)` — one joined query across the owner's
  projects, sequences, and layers;
- `listPinnedByProject(conn, projectId)` — the single-project equivalent;
- `findByIds(conn, todoIds)` — batched validation/reconciliation read;
- `setPinned(conn, todoIds, isPinned)` — one parameterized UPDATE inside the
  caller's transaction.

Pinned list ordering:

1. filed to-dos before unorganized to-dos;
2. layer position;
3. sequence position;
4. to-do position;
5. to-do id as a stable tie-break.

A narrow pinned-list serializer should return:

```json
{
  "id": 12,
  "text": "Wire up token refresh",
  "status": "blocked",
  "sequenceId": 9,
  "sequenceTitle": "Session handling",
  "position": 2,
  "isPinned": true
}
```

`sequenceId` and `sequenceTitle` are null for Unorganized rows.

Also include `is_pinned` in the Calendar item join and expose `isPinned` from
`toCalendarItem`, so an existing booking can accurately show or remove its icon
without affecting its placement.

### 5.2 Atomic bulk pin endpoint

Add:

```text
PUT /api/projects/:id/todos/pins
{
  "todoIds": [12, 18, 31],
  "isPinned": true
}
```

Response:

```text
{ "todos": [/* updated full toTodo payloads */] }
```

Validation and transaction rules:

1. `:id` must be a valid project id owned by the caller.
2. `todoIds` must be a non-empty array of positive integers, deduplicated before
   persistence, with a named maximum batch size.
3. `isPinned` must be a boolean.
4. Every named to-do must exist and belong to that same project. A to-do from
   another project owned by the same user is still rejected.
5. Validate the complete set before UPDATE so a mixed valid/invalid batch writes
   nothing.
6. Apply one UPDATE and return the updated rows in one transaction.

Use a project-scoped assertion/helper rather than N calls to `assertOwnership`.
Do not send one PATCH per selected to-do; partial confirmation would violate the
single Confirm interaction.

### 5.3 Replace frontier project payloads

Replace `projectsFrontier.js` with a pinned-payload helper, for example
`projectsPinnedTodos.js`:

- `listProjectsWithPinnedTodos(conn, ownerId)`;
- `findProjectWithPinnedTodos(conn, projectId)`;
- group the batched pinned rows by project id;
- attach `pinnedTodos` to each serialized project;
- preserve `todoCount` and `completedTodoCount`.

`GET /api/projects`, `POST /api/projects`, and `PATCH /api/projects/:id` must all
return the same card shape with `pinnedTodos` present. The list remains constant
query count as project count grows.

Once all consumers use pins, remove:

- `src/lib/frontier.js`;
- `src/lib/projectsFrontier.js`;
- `src/shared/frontierFixtures.json`;
- frontier serializers and frontier-only counts;
- their unit/integration tests and comments.

## 6. Client State and Derived Models

### 6.1 Project graph mutations

Extend the project state boundary without making `project` pretend to be an
entity collection:

- add a dedicated `projectUpdated` action/reducer case;
- add `updateProject(changes)` to `useProjectGraph` using one optimistic snapshot;
- add an atomic multi-entity update helper, or a focused `setTodosPinned`, that
  applies new copies of every selected to-do, sends the bulk endpoint, reconciles
  returned rows, and rolls the entire graph back on failure;
- expose `setTodosPinned` and `updateProjectDescription` from
  `useProjectMutations`.

All updates must remain immutable. A batch should create one new `todos` map,
not mutate existing to-do objects one by one.

### 6.2 Pin-selection context

Add a small Project feature context containing:

```text
mode: idle | pin | unpin
selectedTodoIds: Set
isEligible(todo)
isSelected(todoId)
toggle(todoId)
startPin()
startUnpin()
cancel()
confirm()
isSaving
```

`ProjectPage` owns the state and provides it inside `ProjectProvider`. Keeping it
separate from the persisted graph prevents transient selection state from
entering rollback snapshots and avoids prop drilling through Canvas, LayerRow,
SequenceCard, DoneGroup, and UnorganizedPanel.

Always replace Sets with new Sets during updates; never mutate the prior Set.

### 6.3 Pin-derived graph functions

In `client/src/lib/graph.js`, retain status/count helpers but replace frontier
helpers with pin helpers:

- `pinnedTodosOf(sequence, todos)`;
- `topPinnedTodoOf(sequence, todos)`;
- `activeSequenceIds(sequences, todos)` returning a Set or array of every
  sequence containing a pin.

`Canvas` memoizes the active id set. `LayerRow` asks `activeIds.has(sequence.id)`.
Pin activity is no longer exclusive and does not depend on layer order, blocked
state, completion state, or ready-frontier calculations.

In `sequenceCardModel`, return:

- `own`;
- `outstanding`;
- `done`;
- `topPinnedTodoId`;
- existing counts and lifecycle status data.

Remove `next` and `then` from the model after all renderers/tests migrate.

## 7. File-Level Implementation Map

### Server/data

- `src/db/schema.sql`
- `src/db/repositories/todosRepo.js`
- `src/db/repositories/calendarItemsRepo.js`
- `src/lib/serializers.js`
- `src/lib/validation.js`
- `src/lib/projectsPinnedTodos.js` (new)
- `src/routes/projects.js`
- delete frontier-only modules after migration

### Project detail

- `src/client/src/components/Project/ProjectPage.js`
- `src/client/src/components/Project/PinSelectionContext.js` (new)
- `src/client/src/components/Project/PinControls.js` (new)
- `src/client/src/components/Project/InlineDescription.js` (new)
- `src/client/src/components/Project/TodoItem.js`
- `src/client/src/components/Project/SequenceDoneGroup.js`
- `src/client/src/components/Project/SequenceCard.js`
- `src/client/src/components/Project/SequenceCardCollapsed.js`
- `src/client/src/components/Project/DraggableTodo.js`
- `src/client/src/components/Project/Canvas.js`
- `src/client/src/components/Project/LayerRow.js`
- `src/client/src/components/Project/UnorganizedPanel.js`
- `src/client/src/components/Styling/Project.css`
- `src/client/src/components/Styling/SequenceCard.css`
- `src/client/src/components/Styling/Todos.css`
- remove `SequenceSpotlight.js` when no caller remains

### Project state/model

- `src/client/src/lib/graph.js`
- `src/client/src/lib/sequenceCard.js`
- `src/client/src/hooks/useProjectGraph.js`
- `src/client/src/hooks/useProjectMutations.js`
- `src/client/src/state/projectActions.js`
- `src/client/src/state/projectReducer.js`

### Projects Home

- `src/client/src/components/Projects/ProjectCard.js`
- `src/client/src/components/Projects/ProjectsHome.js` fixtures/comments
- `src/client/src/components/Styling/Projects.css`

### Calendar

- `src/client/src/hooks/usePool.js`
- `src/client/src/hooks/useCalendar.js`
- `src/client/src/components/Calendar/ProjectPanel.js`
- `src/client/src/components/Calendar/ProjectAccordionCard.js`
- `src/client/src/components/Calendar/PanelTodoRow.js`
- `src/client/src/components/Calendar/DayItemCard.js`
- `src/client/src/components/Calendar/CalendarPage.js`
- `src/client/src/components/Styling/Calendar.css`

## 8. Subagent Execution Plan

Use isolated branches/worktrees and give each subagent exclusive ownership of
its primary files. The integrating agent defines payload names first and
cherry-picks in dependency order.

### Wave 0 — Integrator: freeze contracts

Before parallel work:

1. Add this plan and record the final API examples.
2. Reserve canonical names: `isPinned`, `pinnedTodos`, and
   `PUT /projects/:id/todos/pins`.
3. Add shared fixture builders with `isPinned: false` defaults where practical,
   reducing unrelated test churn.
4. Record the baseline test results.

### Wave 1A — Backend subagent: persistence and API

**Owns:** schema, repositories, serializers, project routes, server integration
and unit tests.

Deliverables:

- migration and fresh-schema definitions;
- pin field serialization;
- atomic bulk pin endpoint and project-scoped validation;
- pinned project payload helper;
- calendar payload `isPinned`;
- removal of server frontier code only after replacement tests pass.

Gate:

```bash
npm test -- --runInBand
```

### Wave 1B — Model subagent: pin derivations and uniform sequence model

**Owns:** `client/src/lib/graph.js`, `client/src/lib/sequenceCard.js`, and their
unit tests.

Deliverables:

- multiple active sequence derivation;
- top-pin derivation;
- `outstanding`/`done` model without `next`/`then`;
- tests for pins on complete, blocked, moved, and unorganized to-dos;
- no React component edits in this branch.

This can run in parallel with Wave 1A because it works against the frozen wire
field names rather than server code.

### Wave 2A — Project-detail subagent: selection, rows, descriptions

**Depends on:** Waves 1A and 1B.  
**Owns:** Project components, project hooks/state, and Project/Todos CSS/tests.

Deliverables:

- pin-selection context and controls;
- all row types selectable, including Done and Unorganized;
- pin icons and top-pin emphasis;
- single outstanding list and removal of spotlight UI;
- multiline project description editor;
- collapsed sequence descriptions;
- bottom-right, initially closed Unorganized panel;
- optimistic atomic pin mutation and rollback tests.

### Wave 2B — Surface subagent: Projects Home and Calendar

**Depends on:** Wave 1A.  
**Owns:** Projects components/CSS, Calendar components/hooks/CSS, and their tests.

Deliverables:

- pinned project card block;
- pinned Calendar pool mapping;
- complete/blocked/pinned styles;
- completed pins remain visible and inert when unscheduled;
- booked items remain after completion or unpinning;
- updated pool refresh semantics and status fixtures.

Wave 2A and 2B can run in parallel because they own disjoint component and CSS
areas. The integrator resolves only shared fixture imports if needed.

### Wave 3 — Integration/E2E subagent

**Depends on:** both Wave 2 branches merged.  
**Owns:** cross-feature integration tests, Playwright flows, dead-code scan, and
comment/documentation cleanup.

Deliverables:

- replace frontier E2E assertions with pin workflows;
- verify home and calendar consistency;
- verify blocked and completed calendar styling;
- verify unpin does not remove a booking and delete does;
- remove remaining frontier/spotlight references that are not historical docs;
- run full test and build gates.

### Final integrator review

The integrating agent performs a focused review for:

- immutable state updates;
- batch atomicity and ownership boundaries;
- keyboard/accessibility behavior in selection mode;
- stale-response/rollback behavior in project and calendar hooks;
- CSS token use (no new hardcoded colors or spacing);
- comments that still describe frontier semantics;
- no accidental modifications to the already-deleted
  `docs/superpowers/**` files.

## 9. Test Plan

### Server unit/integration

- serializes `isPinned` as a boolean;
- creates new to-dos unpinned;
- pins and unpins multiple to-dos atomically;
- accepts complete, blocked, and unorganized to-dos;
- rejects empty, malformed, over-limit, missing, foreign-user, and
  same-user/different-project batches without partial writes;
- returns updated rows from a successful batch;
- returns pinned rows ordered by layer, sequence, and to-do position, with
  Unorganized last;
- never leaks another user's pins;
- keeps project-list query count constant as projects grow;
- POST/PATCH/GET project card payloads all contain `pinnedTodos`;
- calendar items include current `status` and `isPinned` after complete, block,
  pin, and unpin changes;
- deleting a to-do still cascades its booking.

### Client unit/component

- derives every pinned sequence as active;
- chooses the smallest-position pin as top pin regardless of status;
- renders all outstanding items with the same row component and no Next/Then
  labels;
- preserves Done grouping while showing pin state;
- enters each selection mode with the correct eligible rows;
- toggles any number of selections immutably;
- disables empty confirmation;
- confirms through one API call and exits only on success;
- cancels without changing graph state;
- rolls the entire pin batch back and raises a toast on failure;
- pin selection does not trigger checkbox, menu, delete, drag, or card collapse;
- Unorganized is bottom-right and collapsed initially;
- project description supports multiline save, null clearing, Escape revert,
  and rollback;
- collapsed sequence cards show descriptions and the prompt when empty;
- Projects Home renders pinned, complete, and unorganized rows;
- Calendar pool maps `pinnedTodos`, keeps completed rows, and disables dragging
  for completed unscheduled rows;
- Calendar blocked rows/cards get the blocked modifier;
- Calendar completion refreshes the same pinned row as complete;
- scheduled rows remain visible after their pin is removed.

### E2E critical flow

1. Create filed, blocked, completed, and unorganized to-dos.
2. Enter Pin mode, select across those locations, and confirm once.
3. Verify pin icons, multiple active sequences, and top-pin emphasis.
4. Verify Projects Home lists exactly those pins.
5. Verify Calendar lists exactly those pins.
6. Schedule an incomplete pin and a blocked pin; verify the blocked red border.
7. Complete the scheduled item; verify it stays booked and is crossed out.
8. Return to the project and unpin the booked item; verify its Calendar booking
   remains but its pinned-pool row disappears.
9. Delete that to-do; verify its booking disappears.
10. Edit a multiline project description and verify it survives reload.
11. Collapse a sequence and verify its description remains visible.

## 10. Validation Gates

Run in this order so failures stay attributable:

```bash
npm test -- --runInBand
CI=true npm test --prefix src/client -- --runInBand
npm run build --prefix src/client
DB_NAME=planapp_test npm run test:e2e
```

Also run targeted searches:

```bash
rg -n "frontier|NEXT STEP|THEN|SequenceSpotlight|activeSequenceId" src tests
rg -n "isPinned|pinnedTodos|todos/pins" src tests
```

The first search should return no live behavior references after cleanup; any
remaining hits must be intentional historical documentation.

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A multi-select confirm partially updates | One project-scoped bulk endpoint and one transaction |
| Selection clicks trigger existing row controls | Mode-only overlay control; underlying interactions disabled |
| Completed pins disappear due to old frontier filters | Pinned queries filter only `is_pinned`, never status |
| Unpin accidentally destroys calendar history | Pin update never touches `calendar_items`; explicit tests cover it |
| Active styling hides blocked/complete truth | Treat pin activity as an additive class, not lifecycle status |
| Top pin changes unexpectedly after drag | Derive it from persisted `position`; reorder response remains source of truth |
| Unorganized pins are omitted because they lack a sequence | LEFT JOIN sequences/layers and explicit null serialization |
| Home and Calendar payloads drift | Both consume the same `pinnedTodos` project-list contract |
| Project description response replaces graph with card-only data | Reconcile only project fields through a dedicated project action |
| Parallel agents collide in shared files | Freeze names first, use exclusive ownership, merge Wave 1 before Wave 2 |
| Existing installations lose bookings | Migration adds only `todos.is_pinned`; calendar tables and rows are untouched |

## 12. Definition of Done

- No live UI or API behavior depends on ready frontier calculations.
- Every to-do can be pinned/unpinned through the specified batch interaction.
- Pins stay in place and are visibly marked.
- Every sequence with a pin is active; its topmost pin is emphasized.
- Sequence outstanding lists contain no Next Step/Then distinction.
- Projects Home and Calendar show pins instead of frontier items.
- Completed pins stay visible and crossed out; blocked Calendar items have red
  borders.
- Completion and unpinning do not remove existing bookings; deleting the to-do
  does.
- Unorganized is bottom-right and closed by default.
- Project descriptions are editable multiline fields with the new prompt.
- Collapsed sequence cards show their descriptions.
- Server, client, build, and E2E gates pass.
