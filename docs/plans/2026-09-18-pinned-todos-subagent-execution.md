# Execution Runbook — Pinned To-Dos, Unified Sequence Lists, Editable Descriptions

**Companion to:** `docs/plans/2026-09-18-pinned-todos-and-descriptions.md` (the design plan)
**Date:** 2026-09-18
**Executor:** Claude Code orchestrator + Codex subagents (`gpt-5.6-sol`, reasoning effort `high`)
**Method:** `superpowers:subagent-driven-development` — fresh subagent per task, two-stage review after each

---

## 0. How to run this

### 0.1 Dispatch form

Every implementation and review task below is dispatched as a **Codex** subagent through the
`codex:codex-rescue` forwarder. The forwarder strips routing flags from the prompt text and passes
them to the Codex CLI, so the flags go at the end of the prompt:

```text
Agent(
  subagent_type: "codex:codex-rescue",
  description: "<task id>: <short name>",
  prompt: "<PASTE: Shared Context Block + the task block verbatim>

--model gpt-5.6-sol --effort high --write --fresh --background"
)
```

Flag meanings for this runbook:

| Flag | Value | Why |
|---|---|---|
| `--model` | `gpt-5.6-sol` | Requested model for all subagents |
| `--effort` | `high` | Requested reasoning effort for all subagents |
| `--write` | on | Implementation tasks edit the working tree |
| `--fresh` | on | Each task is a fresh Codex run; never inherit a prior task's session |
| `--background` | on | Tasks are multi-step and long-running |

**Review tasks drop `--write`** — reviewers read and report, they do not edit.

### 0.1.1 NEVER use `--resume`. Always `--fresh` with full context.

`--resume` maps to `--resume-last`, which resolves to the *latest tracked Codex thread for this
repo* — not to the thread you meant. Any stray Codex invocation in between silently steals it.

This already happened once: the forwarder ran `task --help` before forwarding a T1 resume, which
created a throwaway thread; the resume then landed on that thread instead of T1's, arrived with no
memory of the approved design, and started wandering through skill-cache files with `--write`
enabled. It had to be cancelled.

So every dispatch — first attempt, retry, or post-review fix round — uses `--fresh` and carries
its complete context inline:

- the Shared Context Block,
- the full task block,
- for a retry: what already happened, what is preserved on disk, and what changed,
- for a fix round: the reviewer's findings quoted in full, plus the task block again.

This is more prompt text per dispatch. It is also the only form that is not silently order-
dependent. The runbook's self-contained task blocks exist precisely so this is cheap.

### 0.1.2 Codex cannot commit. The orchestrator commits.

The Codex sandbox denies writing `.git/index.lock`:

```text
fatal: Unable to create '.../.git/index.lock': Operation not permitted
```

So a task can stage nothing and commit nothing, however its prompt is worded. T1 hit this after
finishing its work correctly, and reported BLOCKED at the commit step.

Therefore each task prompt should:

- tell the subagent to leave its work uncommitted in the working tree, and NOT to attempt a commit;
- ask it to report the files it changed and the gate output instead.

The orchestrator then verifies and commits. Concretely, after each task:

1. `git status --short` — confirm ONLY the task's owned files changed.
2. Re-run the task's gate independently. Never trust the pasted counts.
3. Read the diff of the source files.
4. Commit with the `<type>: <description>` convention and the `Co-Authored-By` trailer.

This is not a workaround to remove later. Verifying before committing is the orchestrator's job
in this runbook anyway; the sandbox simply enforces it.

### 0.2 Ordering rule

Tasks run **strictly sequentially, one implementer at a time, on one branch.** This deviates from
§8 of the design plan, which sketched parallel branches/worktrees. Reason: Codex subagents write to
the same working tree, so concurrent implementers would collide in `graph.js`, the Project CSS
files, and shared fixtures. The wave structure of §8 survives as *task ordering*; the parallelism
does not.

Execution order and dependency chain:

```text
W0 (orchestrator)
  └─ T1 ─ T2 ─ T3        (server: persistence → endpoint → payloads/cleanup)
  └─ T4                  (client model; needs only frozen names, may run after W0)
        T3 + T4 ─ T5     (client state/mutations)
                  T5 ─ T6 ─ T7 ─ T8   (Project detail UI, sequential: shared CSS/components)
                  T3 ─ T9 ─ T10       (Projects Home, Calendar)
                       T8 + T10 ─ T11 (E2E, dead-code scan, full gates)
```

### 0.3 Per-task loop

1. Dispatch implementer (task block below).
2. Handle status: `DONE` → step 3. `DONE_WITH_CONCERNS` → read concerns, decide, then step 3.
   `NEEDS_CONTEXT` → supply it, re-dispatch. `BLOCKED` → change something (more context, smaller
   task, or escalate to the human); never re-run unchanged.
3. Dispatch **spec compliance reviewer** (§12.1). Issues → dispatch a FRESH fix round (`--fresh --write`) carrying the task block plus the reviewer's findings verbatim → re-review.
4. Only after spec review is clean, dispatch **code quality reviewer** (§12.2). Issues → fix → re-review.
5. Record the task's HEAD SHA, tick it off, move to the next task.

Never start T(n+1) while T(n) has an open review finding.

### 0.4 Preconditions (orchestrator, before T1) — DONE

- [x] Working tree clean; the superseded `docs/superpowers/**` files committed as deletions (`177afaf`).
- [x] Feature branch `feat/pinned-todos` created from `3c8bb42`.
- [x] Baseline recorded: **32 suites / 465 tests passing** via `DB_NAME=planapp_test npm test -- --runInBand`.
- [x] `todos.is_pinned` + `idx_todos_project_pinned` applied to the `planapp_test` database by hand.

### 0.5 Schema changes are the ORCHESTRATOR's job, not a subagent's

This repo has no migration runner. `src/db/schema.sql` is a destructive DROP/CREATE script used
only by `init.sh` for a fresh install, so there is no supported way for a task to move an existing
database forward. A subagent told to "apply the schema change" will improvise, and the first T1
run proved that improvisation goes straight to repairing Homebrew.

Therefore, for any task that adds or alters a column:

1. The orchestrator applies the DDL to `planapp_test` by hand BEFORE dispatching, using the
   project's own `mysql2` driver and the credentials in `.env`, and verifies with `SHOW COLUMNS`.
2. The task prompt states the column is already present and forbids all DDL.
3. The task edits `src/db/schema.sql` as TEXT ONLY — the fresh-install `CREATE TABLE` plus the
   migration note at the top of the file.

Only T1 in this runbook adds a column. If a later task turns out to need one, stop and apply it
the same way rather than delegating it.

**Known gap, out of scope:** applying pending DDL to a developer's database is manual and
undocumented. Worth a migration runner later; not part of this feature.

---

## 1. Shared Context Block

**Paste this verbatim at the top of every implementation task prompt.**

```text
## Repository

PlanApp — Express + MySQL2 server under `src/`, Create React App client under `src/client/`.
Server tests: `tests/unit`, `tests/integration` (Jest, root). Client tests: colocated
`*.test.js` under `src/client/src` (CRA Jest). E2E: `tests/e2e` (Playwright).
Read `AGENTS.md` at the repo root for stack and layout conventions.

## Environment facts — already verified. Do not re-investigate them.

A first attempt at T1 burned its entire run trying to repair a Homebrew MySQL installation that
was never broken in any way that mattered. Do not repeat it. These facts are verified:

- A MySQL server (version 8.0.27) is ALREADY RUNNING and reachable. Do not start, install,
  reinstall, relink, or repair any database server.
- The `planapp_test` database EXISTS and the suite connects to it. The verified green baseline on
  branch `feat/pinned-todos` is 32 suites / 465 tests passing.
- The `todos.is_pinned` column and the `idx_todos_project_pinned` index have ALREADY been applied
  to `planapp_test` by the orchestrator. No task needs to run DDL against any database.
- `src/db/schema.sql` is the DESTRUCTIVE fresh-install definition (DROP/CREATE), and this repo has
  no migration runner. NEVER execute that file against a database. Tasks only EDIT its text; the
  orchestrator applies pending DDL to `planapp_test` by hand before dispatching the task that
  needs it.
- The server gate REQUIRES the test database name. Without the `DB_NAME=planapp_test` prefix the
  integration helper (`tests/helpers/db.js`) refuses to run and you will see ~333 spurious
  failures unrelated to your change.

ABSOLUTELY FORBIDDEN in every task in this runbook:
- Running `brew` in any form, installing or repairing system packages, or touching anything under
  /opt/homebrew.
- Starting, stopping, or reconfiguring a database server.
- Running DDL/DML against any database outside of what the Jest tests themselves do.
- Any `otool`, dylib hunting, or toolchain debugging.

If a gate fails for a reason that looks environmental, STOP and report BLOCKED with the exact
error text. Do not attempt to repair the environment. That is not your job.

## Non-negotiable coding rules (from the user's global CLAUDE.md)

- IMMUTABILITY IS CRITICAL. Never mutate an existing object, array, Map, or Set — return new
  copies. This applies to reducers, graph updates, and selection state alike.
- KISS, DRY, YAGNI. No abstraction before it is needed. No speculative options.
- Many small focused files, organized by feature. Files 200-400 lines typical, 800 max.
  Functions under 50 lines. No nesting past 4 levels — use early returns.
- No magic numbers; name meaningful thresholds and limits as UPPER_SNAKE_CASE constants.
- Naming: camelCase values/functions, PascalCase types/components, UPPER_SNAKE_CASE constants,
  `use` prefix for hooks, `is`/`has`/`should`/`can` for booleans.
- Handle errors explicitly; never swallow. User-friendly messages in UI, detailed context in
  server logs. Validate at system boundaries and fail fast.
- Tests use Arrange-Act-Assert and are named for the behavior under test, e.g.
  `returns empty array when no markets match query`.
- Commits: `<type>: <description>` — feat, fix, refactor, docs, test, chore, perf, ci.
- Follow test-driven development: write the failing test first, then the implementation.

## Frozen contracts — do not rename, do not invent alternatives

Database column:        todos.is_pinned  tinyint(1) NOT NULL DEFAULT '0'
Index:                  idx_todos_project_pinned (project_id, is_pinned)
Wire field on a to-do:  isPinned (boolean)
Wire field on a project card: pinnedTodos (array)
Wire field on a calendar item: isPinned (boolean)
Bulk pin endpoint:      PUT /api/projects/:id/todos/pins
  request  { "todoIds": [12, 18, 31], "isPinned": true }
  response { "todos": [ /* full toTodo payloads for the updated rows */ ] }

Pinned-list row serializer shape:
{
  "id": 12,
  "text": "Wire up token refresh",
  "status": "blocked",
  "sequenceId": 9,
  "sequenceTitle": "Session handling",
  "position": 2,
  "isPinned": true
}
sequenceId and sequenceTitle are null for Unorganized rows.

Pinned-list ordering (stable, applied in this order):
  1. filed to-dos before unorganized to-dos
  2. layer position
  3. sequence position
  4. to-do position
  5. to-do id (tie-break)

New server module name:  src/lib/projectsPinnedTodos.js
New client modules:      src/client/src/components/Project/PinSelectionContext.js
                         src/client/src/components/Project/PinControls.js
                         src/client/src/components/Project/InlineDescription.js
Empty-description prompt text (exact):  What problem are you trying to solve?
Projects Home empty pinned state (exact): No pinned to-dos yet.

## Product decisions you must honor

1. Pinning never moves a to-do. It only flips isPinned and adds a pin indicator.
2. Every to-do is pinnable: filed, unorganized, incomplete, blocked, or complete.
3. Completion removes neither the pin nor the calendar booking. A completed item is crossed out
   and stays visible. Deleting the to-do is the only thing that removes its booking (existing FK
   cascade).
4. Unpinning never unschedules an existing booking. It only removes the item from pinned lists
   and from sequence-active calculations.
5. A sequence is active when it contains at least one pinned to-do. Several sequences may be
   active at once. Pin activity is ADDITIVE styling — it never overrides Blocked/Complete/
   Incomplete lifecycle status.
6. The "top pinned" to-do of a sequence is the pinned to-do with the smallest stored `position`,
   regardless of its status.
7. Blank descriptions are stored as NULL. The prompt text is UI placeholder, never saved content.
8. No data is auto-pinned by the migration. Existing calendar bookings are untouched.

## Scope discipline

- Touch only the files your task lists as owned. If you believe you must edit a file outside that
  list, stop and report NEEDS_CONTEXT with the reason.
- NEVER touch anything under `docs/superpowers/**`. Those files are being deleted in a separate
  change already staged on this branch.
- Do not reformat, re-lint, or "improve" code unrelated to your task.

## Reporting

End your run with:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Which tests you wrote and the actual command output (pass/fail counts)
- Files changed
- Self-review findings
- Concerns

Do not claim a gate passed unless you ran it and saw it pass. Paste the real output.
It is always OK to stop and say the task is too hard. Bad work is worse than no work.
```

---

## 2. T1 — Pin persistence: schema, repository, serializers

**Depends on:** W0 · **Gate:** `DB_NAME=planapp_test npm test -- --runInBand`

```text
## Task T1: Persist the pin flag

Add the `is_pinned` column and expose it through the to-do repository and serializers.
No HTTP route changes in this task.

### Files you own
- src/db/schema.sql
- src/db/repositories/todosRepo.js
- src/lib/serializers.js
- tests/unit/serializers.test.js
- tests/integration/todosRepo.test.js

### Requirements

1. Schema TEXT ONLY — do NOT execute any DDL. The column is already live in `planapp_test`
   (see the Environment facts block). In `src/db/schema.sql`:
   - update the destructive `CREATE TABLE todos` definition so a fresh database gets `is_pinned`
     after `completed_at`, plus the `idx_todos_project_pinned` key;
   - add the in-place migration note at the top of the file, following the convention already
     used there for prior migrations, recording:

     ALTER TABLE `todos`
       ADD COLUMN `is_pinned` tinyint(1) NOT NULL DEFAULT '0' AFTER `completed_at`,
       ADD KEY `idx_todos_project_pinned` (`project_id`, `is_pinned`);

2. Serialization. Add `isPinned: Boolean(row.is_pinned)` to `toTodo`.

3. Repository selects. Include `is_pinned` in every `todosRepo` select list, so no existing read
   path silently drops the field.

4. New repository operations, each taking the caller's connection so it composes inside an
   existing transaction:
   - `listPinnedByOwner(conn, ownerId)` — ONE joined query across the owner's projects, sequences
     and layers. LEFT JOIN sequences and layers so Unorganized pins (no sequence) are included.
     Returns rows in the frozen pinned-list order.
   - `listPinnedByProject(conn, projectId)` — the single-project equivalent, same ordering.
   - `findByIds(conn, todoIds)` — batched read used later for validation/reconciliation.
   - `setPinned(conn, todoIds, isPinned)` — ONE parameterized UPDATE. No loop over ids.

5. A narrow pinned-row serializer producing exactly the frozen pinned-list shape, with
   `sequenceId` and `sequenceTitle` null for Unorganized rows.

### Tests (write them first)

- serializes isPinned as a boolean, for both 0 and 1 stored values
- creates new to-dos unpinned by default
- listPinnedByProject returns pinned rows ordered by layer, sequence, then to-do position
- listPinnedByProject places unorganized pins last
- listPinnedByProject includes complete and blocked pinned to-dos
- listPinnedByOwner never returns another owner's pins
- listPinnedByOwner issues a constant number of queries as project count grows
- setPinned updates every named id in one statement
- findByIds returns only the requested rows

### Gate

DB_NAME=planapp_test npm test -- --runInBand

Paste the real output. Then commit with a `feat:` message.
```

---

## 3. T2 — Atomic bulk pin endpoint

**Depends on:** T1 · **Gate:** `DB_NAME=planapp_test npm test -- --runInBand`

```text
## Task T2: PUT /api/projects/:id/todos/pins

Add the atomic bulk pin/unpin endpoint. The client confirms a multi-select in ONE request; a
partial write would break that interaction, so everything happens in one transaction.

### Files you own
- src/routes/projects.js
- src/lib/validation.js
- a new project-scoped ownership assertion helper under src/lib/ (name it to match the existing
  assertLayerInProject.js / assertSequenceInProject.js / assertTodosOwned.js convention)
- tests/integration/todosRoutes.test.js (or a new focused tests/integration/todoPinsRoute.test.js)
- tests for the new assertion helper, matching the existing assertTodosOwned.test.js style

### Requirements

PUT /api/projects/:id/todos/pins
  request  { "todoIds": [12, 18, 31], "isPinned": true }
  response { "todos": [ /* full toTodo payloads for the updated rows */ ] }

Validation and transaction rules, in this order:

1. `:id` must be a valid project id owned by the caller.
2. `todoIds` must be a non-empty array of positive integers. Deduplicate before persistence.
   Enforce a maximum batch size as a NAMED constant (no magic number) and reject over-limit
   batches with a 400.
3. `isPinned` must be a boolean. Reject truthy strings and 0/1.
4. Every named to-do must exist AND belong to that same project. A to-do from a DIFFERENT
   project owned by the SAME user is still rejected.
5. Validate the COMPLETE set before any UPDATE, so a mixed valid/invalid batch writes nothing.
6. One UPDATE (todosRepo.setPinned) and one read-back, both inside one transaction. Return the
   updated rows.

Use the project-scoped assertion helper — do NOT call assertOwnership once per to-do.
Follow the error shape and status codes already used by the neighbouring routes in
src/routes/projects.js.

### Tests (write them first)

- pins multiple to-dos in one request and returns the updated rows
- unpins multiple to-dos in one request
- accepts complete, blocked, and unorganized to-dos in the same batch
- deduplicates repeated ids
- rejects an empty todoIds array without writing
- rejects a non-array / non-integer / negative id without writing
- rejects a batch above the maximum size without writing
- rejects a non-boolean isPinned without writing
- rejects a batch containing a missing to-do id without writing any of the valid ones
- rejects a batch containing a to-do from another project owned by the same user
- rejects a batch containing another user's to-do
- verifies no partial write occurred after each rejection, by re-reading the rows

### Gate

DB_NAME=planapp_test npm test -- --runInBand

Paste the real output. Then commit with a `feat:` message.
```

---

## 4. T3 — Pinned project payloads, calendar `isPinned`, server frontier removal

**Depends on:** T2 · **Gate:** `DB_NAME=planapp_test npm test -- --runInBand`

```text
## Task T3: Replace frontier project payloads with pinnedTodos

### Files you own
- src/lib/projectsPinnedTodos.js (new)
- src/routes/projects.js (payload shaping only — do not revisit T2's pin endpoint)
- src/db/repositories/calendarItemsRepo.js
- src/lib/serializers.js (toCalendarItem only)
- DELETE: src/lib/frontier.js, src/lib/projectsFrontier.js
- DO NOT delete `src/shared/frontierFixtures.json` here. The client test
  `src/client/src/lib/graph.frontier.test.js` still imports it, and T4 owns that file.
  Deleting the fixture in T3 would break the client suite for the whole gap between T3 and
  T4, and T3's server-only gate would not notice. **T4 deletes the fixture and its last
  consumer together.**
- DELETE: tests/unit/frontier.test.js, tests/integration/projectsFrontierRoute.test.js
- tests/integration/projectsRoutes.test.js, tests/integration/calendarItemsRepo.test.js,
  tests/integration/calendarRoutes.test.js, tests/unit/serializers.test.js

### Requirements

1. New module src/lib/projectsPinnedTodos.js exporting:
   - listProjectsWithPinnedTodos(conn, ownerId)
   - findProjectWithPinnedTodos(conn, projectId)
   Each batches the pinned rows (via todosRepo.listPinnedByOwner / listPinnedByProject from T1),
   groups them by project id, and attaches `pinnedTodos` to the serialized project. Preserve the
   existing `todoCount` and `completedTodoCount` fields exactly as they are today.
   Query count must stay constant as project count grows — no per-project query in a loop.

2. Remove THREE payload fields, not one: `frontier`, `sequenceCount` and
   `blockedSequenceCount`. The latter two exist solely to tell three different
   empty-frontier states apart on the project card, and that distinction is deleted with
   them. `todoCount` and `completedTodoCount` are PRESERVED.

3. GET /api/projects, POST /api/projects, and PATCH /api/projects/:id must ALL return the same
   card shape, with `pinnedTodos` present (an empty array when there are none).

4. Calendar. Include `is_pinned` in the calendar item join in calendarItemsRepo, and expose
   `isPinned` from `toCalendarItem`. A booking must report the to-do's CURRENT pin state without
   its placement changing.

5. Only after the replacement tests pass, delete the server frontier code and its tests listed
   above, plus any frontier-only serializers, counts, and comments in files you own.

### Tests (write them first)

- GET /api/projects returns pinnedTodos on every card
- POST /api/projects returns a card with an empty pinnedTodos array
- PATCH /api/projects/:id returns the same card shape with pinnedTodos
- pinnedTodos rows follow the frozen ordering, unorganized last
- pinnedTodos includes complete and blocked pins
- a project with no pins returns an empty array, not null
- the project list query count stays constant as projects grow
- one user's pins never appear in another user's payload
- calendar items include current status and isPinned after complete, block, pin, and unpin
- deleting a to-do still cascades away its calendar booking

### Gate

DB_NAME=planapp_test npm test -- --runInBand
rg -n "frontier" src tests    # must return no live server references

Paste the real output. Then commit — a `feat:` for the payload and a `refactor:` for the removal.
```

---

## 5. T4 — Client derivations: pin helpers and the uniform sequence model

**Depends on:** W0 only (works against frozen names, not server code) · **Gate:** `npm run test:client`

```text
## Task T4: Pin derivations in graph.js and sequenceCard.js

Pure functions and their unit tests only. NO React component edits in this task — if a component
stops compiling because you removed a helper, leave it and report it; the next task fixes callers.

### Files you own
- src/client/src/lib/graph.js
- src/client/src/lib/graph.test.js
- DELETE: src/client/src/lib/graph.frontier.test.js
- DELETE: src/shared/frontierFixtures.json (T4 is its last consumer; T3 deliberately left it)
- src/client/src/lib/sequenceCard.js
- src/client/src/lib/sequenceCard.test.js

### Requirements

1. Keep the existing status and count helpers. Replace the frontier helpers with:
   - pinnedTodosOf(sequence, todos) — the sequence's pinned to-dos, in stored `position` order
   - topPinnedTodoOf(sequence, todos) — the pinned to-do with the smallest `position`, whatever
     its status; undefined/null when the sequence has no pin
   - activeSequenceIds(sequences, todos) — a Set of the id of EVERY sequence containing at least
     one pinned to-do

   Pin activity is no longer exclusive. It must not depend on layer order, blocked state,
   completion state, or any ready-frontier calculation.

2. sequenceCardModel returns:
   - own
   - outstanding   (every non-complete to-do, one flat list, in position order)
   - done
   - topPinnedTodoId
   - the existing counts and lifecycle status data
   Remove `next` and `then` from the model.

3. Everything returns new values. Never mutate the inputs. Do not sort an input array in place —
   copy first.

### Tests (write them first)

- activeSequenceIds returns every sequence containing a pin, not just one
- activeSequenceIds returns an empty set when nothing is pinned
- topPinnedTodoOf picks the smallest position regardless of status
- topPinnedTodoOf picks a complete pinned to-do when it has the smallest position
- topPinnedTodoOf picks a blocked pinned to-do when it has the smallest position
- pinnedTodosOf ignores pins belonging to another sequence
- pinnedTodosOf ignores unorganized pins
- sequenceCardModel puts every non-complete to-do in outstanding in position order
- sequenceCardModel keeps complete to-dos in done
- sequenceCardModel exposes topPinnedTodoId, and null when the sequence has no pin
- the helpers do not mutate the caller's sequences or todos (assert with a frozen or copied fixture)

### Gate

CI=true npm test --prefix src/client -- --runInBand

Paste the real output. Then commit with a `refactor:` message.
```

---

## 6. T5 — Client state: project updates and the atomic pin mutation

**Depends on:** T3, T4 · **Gate:** `npm run test:client`

```text
## Task T5: projectUpdated action and setTodosPinned mutation

Wire the frozen endpoint into the client state layer. NO component edits in this task.

### Files you own
- src/client/src/state/projectActions.js
- src/client/src/state/projectReducer.js
- src/client/src/state/projectReducer.test.js
- src/client/src/hooks/useProjectGraph.js
- src/client/src/hooks/useProjectGraph.test.js
- src/client/src/hooks/useProjectMutations.js
- src/client/src/hooks/useProjectMutations.todos.test.js
- src/client/src/lib/api.js (only to add the pins request helper)

### Requirements

1. Add a dedicated `projectUpdated` action and reducer case. It reconciles ONLY project fields.
   A PATCH response carrying card-only data must never replace the whole graph or clobber the
   sequences/todos/layers maps.

2. Add `updateProject(changes)` to useProjectGraph using one optimistic snapshot and the existing
   rollback/toast path.

3. Add a focused `setTodosPinned(todoIds, isPinned)` that:
   - applies NEW COPIES of every selected to-do in ONE new `todos` map (do not mutate to-do
     objects one at a time, and do not write the map key by key into the old map)
   - sends ONE request to PUT /api/projects/:id/todos/pins
   - reconciles the returned rows
   - rolls the ENTIRE graph back to the pre-batch snapshot on failure, and raises the existing
     toast
   - handles a stale response the way the existing mutations in this hook already do

4. Expose `setTodosPinned` and `updateProjectDescription` from useProjectMutations.
   `updateProjectDescription` trims outer whitespace, preserves internal newlines, and sends an
   empty draft as null.

### Tests (write them first)

- projectUpdated merges project fields without touching the todos/sequences/layers maps
- setTodosPinned sends exactly one request for a multi-id batch
- setTodosPinned applies the optimistic pin to every selected to-do
- setTodosPinned produces a new todos map and leaves the previous to-do objects unmutated
- setTodosPinned reconciles the server rows onto the graph
- setTodosPinned rolls the whole batch back and raises a toast when the request fails
- setTodosPinned ignores a stale response arriving after a newer mutation
- updateProjectDescription sends a trimmed multiline value
- updateProjectDescription sends null for a blank draft
- updateProjectDescription rolls back and raises a toast on PATCH failure

### Gate

CI=true npm test --prefix src/client -- --runInBand

Paste the real output. Then commit with a `feat:` message.
```

---

## 7. T6 — Pin selection mode: context, controls, selectable rows

**Depends on:** T5 · **Gate:** `npm run test:client`

```text
## Task T6: Pin/Unpin selection mode on the Project page

### Files you own
- src/client/src/components/Project/PinSelectionContext.js (new)
- src/client/src/components/Project/PinControls.js (new)
- src/client/src/components/Project/ProjectPage.js
- src/client/src/components/Project/TodoItem.js
- src/client/src/components/Project/DraggableTodo.js
- src/client/src/components/Project/SequenceDoneGroup.js
- src/client/src/components/Project/UnorganizedPanel.js
- src/client/src/components/Styling/Todos.css
- the colocated tests for each of the above

Leave the uniform-list refactor, the description editor, and the Unorganized panel's dock
position alone — later tasks own those.

### Requirements

1. PinSelectionContext exposes exactly:
     mode: 'idle' | 'pin' | 'unpin'
     selectedTodoIds: Set
     isEligible(todo)
     isSelected(todoId)
     toggle(todoId)
     startPin()
     startUnpin()
     cancel()
     confirm()
     isSaving
   ProjectPage owns the state and provides it inside ProjectProvider. This state is transient UI
   state — it must NEVER enter the persisted graph or a rollback snapshot, and it must not be
   prop-drilled through Canvas, LayerRow, SequenceCard, DoneGroup, or UnorganizedPanel.

   ALWAYS replace the Set with a NEW Set on every update. Never mutate the previous Set.

2. PinControls renders two header buttons.
   At rest:      [Pin] [Unpin]
   In pin mode:  [Confirm] [Cancel]   — only UNPINNED to-dos are eligible and highlighted
   In unpin mode:[Cancel] [Confirm]   — only PINNED to-dos are eligible and highlighted
     (in pin mode the Pin button becomes Confirm and Unpin becomes Cancel; in unpin mode the
      Unpin button becomes Confirm and Pin becomes Cancel)
   Confirm is disabled while the selection is empty.
   Confirm performs ONE atomic setTodosPinned call and exits selection mode only on success.
   Cancel clears the draft selection and sends no request.

3. Row selection. While a selection mode is active, a transparent selection control covers each
   ELIGIBLE row. The whole row becomes clickable for selection WITHOUT triggering the row's
   checkbox, drag handle, delete, action menu, or card collapse.
   The control must be keyboard reachable, and must expose `aria-pressed` plus an accessible
   label naming both the operation and the to-do, e.g. "Pin: Wire up token refresh".

4. All row types participate: sequence rows, Done-group rows, and Unorganized rows.

5. Pinned rows show a persistent pin icon at all times — not just in selection mode — and
   otherwise stay exactly where they are.

6. Styling uses existing CSS custom properties from `src/client/src/index.css`. Add no new
   hardcoded colors or spacing values.

### Tests (write them first)

- pin mode marks only unpinned rows eligible
- unpin mode marks only pinned rows eligible
- toggling a selection produces a new Set and leaves the previous Set unchanged
- toggling several rows accumulates them
- Confirm is disabled with an empty selection
- Confirm issues exactly one API call for a multi-row selection
- Confirm exits selection mode only after the call succeeds
- a failed Confirm stays in selection mode, rolls the graph back, and raises a toast
- Cancel clears the selection and issues no request
- clicking a row in selection mode does not toggle its checkbox
- clicking a row in selection mode does not open its action menu or delete it
- clicking a row in selection mode does not collapse the sequence card
- the selection control is reachable by keyboard and exposes aria-pressed
- Done-group rows are selectable
- Unorganized rows are selectable
- pinned rows render a pin icon outside selection mode

### Gate

CI=true npm test --prefix src/client -- --runInBand

Paste the real output. Then commit with a `feat:` message.
```

---

## 8. T7 — Uniform sequence lists, active sequences, Unorganized relocation

**Depends on:** T6 · **Gate:** `npm run test:client`

```text
## Task T7: One row style per sequence; remove the spotlight

### Files you own
- src/client/src/components/Project/SequenceCard.js
- src/client/src/components/Project/SequenceCardCollapsed.js
- src/client/src/components/Project/SequenceCardFooter.js
- src/client/src/components/Project/Canvas.js
- src/client/src/components/Project/LayerRow.js
- src/client/src/components/Project/UnorganizedPanel.js (dock position + default collapsed only)
- src/client/src/components/Styling/SequenceCard.css
- src/client/src/components/Styling/Project.css
- DELETE: src/client/src/components/Project/SequenceSpotlight.js
- DELETE: src/client/src/hooks/useSequenceSpotlight.js and useSequenceSpotlight.test.js
  (only if no caller remains after this task — verify with rg, and report if a caller remains)
- the colocated tests for each of the above, plus sequenceCardHarness.js if fixtures need pins

### Requirements

1. Every non-complete to-do renders through the SAME sortable row component. Delete the
   spotlight path entirely: SequenceSpotlight, SortableSpotlight, and the "NEXT STEP", "NEXT",
   and "THEN" UI strings.

2. Keep the existing Done group. It represents completion, not ordering priority. Done rows keep
   their pin icon and their top-pin emphasis when applicable.

3. Add an emphasis modifier to the row whose id is `topPinnedTodoId`. Emphasis is ADDITIVE: a
   complete top pin stays crossed out, a blocked top pin keeps its blocked styling.

4. Active sequences. Canvas memoizes `activeSequenceIds(sequences, todos)` from graph.js.
   LayerRow asks `activeIds.has(sequence.id)`. Add the active/ring treatment to EVERY sequence
   with a pin — several may be active at once. Sequence status (Blocked / Complete / Incomplete)
   stays independent: a pinned blocked or complete sequence must not lose its true status.

5. Collapsed sequence cards show: title; the multiline description, or the exact prompt text
   "What problem are you trying to solve?" when it is empty; the progress/status summary; and
   the top pinned to-do when one exists, with its pin, blocked and complete states. This task
   DISPLAYS the sequence description in both card states — it does NOT add sequence-description
   editing.

6. Unorganized panel: change the fixed dock in Project.css from `left` to `right`, and initialize
   `isExpanded` to false. Preserve the count in the collapsed pill. Do not disturb the selection
   behavior T6 added.

7. Use existing CSS custom properties. No new hardcoded colors or spacing.

### Tests (write them first)

- every outstanding to-do renders with the same row component
- no "NEXT STEP", "NEXT", or "THEN" label appears anywhere
- the top pinned row carries the emphasis modifier
- a complete top pin keeps its crossed-out styling alongside the emphasis
- a blocked top pin keeps its blocked styling alongside the emphasis
- Done grouping is preserved and Done rows show pin state
- every sequence containing a pin is marked active
- two sequences with pins are both active simultaneously
- a pinned blocked sequence still reports Blocked status
- a pinned complete sequence still reports Complete status
- a collapsed card shows its description
- a collapsed card with no description shows "What problem are you trying to solve?"
- a collapsed card shows its top pinned to-do with pin, blocked and complete states
- the Unorganized panel starts collapsed
- the collapsed Unorganized pill still shows its count

### Gate

CI=true npm test --prefix src/client -- --runInBand
rg -n "NEXT STEP|SequenceSpotlight|activeSequenceId\b" src/client/src

Paste the real output. Then commit — `refactor:` for the removal, `feat:` for the active/collapsed work.
```

---

## 9. T8 — Editable multiline project description

**Depends on:** T7 · **Gate:** `npm run test:client`

```text
## Task T8: InlineDescription

### Files you own
- src/client/src/components/Project/InlineDescription.js (new)
- src/client/src/components/Project/InlineDescription.test.js (new)
- src/client/src/components/Project/ProjectPage.js (mount the editor only)
- src/client/src/components/Styling/Project.css

Do NOT stretch InlineTitle beyond its one-line contract — leave InlineTitle.js untouched.

### Requirements

Render a <textarea> below the project title.

- multiline text up to the existing 2,000-character server limit (reference the server's limit;
  do not introduce a second, different magic number)
- placeholder / prompt for a null description is exactly:
    What problem are you trying to solve?
- save on blur, through the existing debounced mutation style used elsewhere in this codebase
  (see useDebouncedCallback)
- Cmd+Enter / Ctrl+Enter is an explicit keyboard commit; plain Enter inserts a newline
- Escape cancels the pending edit and restores the stored value
- trim outer whitespace at the API boundary while preserving internal newlines
- an empty draft is submitted as null
- update the project graph optimistically via updateProjectDescription (T5) and roll back with
  the existing toast when PATCH fails

Use the same empty-description wording on sequence cards so the open and collapsed states agree
(T7 already applied it to the collapsed state — confirm the open state matches).

### Tests (write them first)

- renders the stored description
- shows "What problem are you trying to solve?" when the description is null
- plain Enter inserts a newline and does not save
- Cmd+Enter commits the draft
- Ctrl+Enter commits the draft
- blur commits the draft
- Escape restores the stored value and sends no request
- a multiline value survives the round trip with internal newlines intact
- outer whitespace is trimmed before the request
- a blank draft is sent as null
- a failed PATCH rolls the value back and raises a toast

### Gate

CI=true npm test --prefix src/client -- --runInBand

Paste the real output. Then commit with a `feat:` message.
```

---

## 10. T9 — Projects Home pinned block

**Depends on:** T3 · **Gate:** `npm run test:client`

```text
## Task T9: Replace the Ready Now / frontier block with a Pinned block

### Files you own
- src/client/src/components/Projects/ProjectCard.js
- src/client/src/components/Projects/ProjectCard.test.js
- src/client/src/components/Projects/ProjectsHome.js (fixtures and comments only)
- src/client/src/components/Projects/ProjectsHome.test.js
- src/client/src/components/Styling/Projects.css

### Requirements

- Render `project.pinnedTodos` in the deterministic order the server sends. Do not re-sort.
- Each row shows a pin icon, the to-do text, and the sequence title when the item is filed.
- An unorganized pinned item is labeled exactly: Unorganized
- Complete pinned items stay listed and crossed out.
- Empty state text is exactly: No pinned to-dos yet.
- Overall progress and the project description on the card are unchanged.
- Remove the frontier-specific empty states such as "everything is blocked" and "every sequence
  is complete". Pins are an explicit list, so an empty list has exactly one meaning.
- Use existing CSS custom properties. No new hardcoded colors or spacing.

### Tests (write them first)

- renders a pinned row with its pin icon, text, and sequence title
- labels an unorganized pinned row "Unorganized"
- renders a complete pinned row crossed out and still present
- renders a blocked pinned row with its blocked styling
- renders "No pinned to-dos yet." when pinnedTodos is empty
- preserves the server ordering of pinnedTodos
- no "everything is blocked" or "every sequence is complete" copy remains
- overall progress still renders

### Gate

CI=true npm test --prefix src/client -- --runInBand

Paste the real output. Then commit with a `feat:` message.
```

---

## 11. T10 — Calendar pinned pool and status styling

**Depends on:** T9 · **Gate:** `npm run test:client`

```text
## Task T10: Calendar reads pinnedTodos

### Files you own
- src/client/src/hooks/usePool.js and usePool.test.js
- src/client/src/hooks/useCalendar.js and useCalendar.test.js
- src/client/src/components/Calendar/ProjectPanel.js and ProjectPanel.test.js
- src/client/src/components/Calendar/ProjectAccordionCard.js
- src/client/src/components/Calendar/PanelTodoRow.js
- src/client/src/components/Calendar/DayItemCard.js and DayItemCard.test.js
- src/client/src/components/Calendar/CalendarPage.js and CalendarPage.test.js
- src/client/src/components/Styling/Calendar.css

### Requirements

The right panel reads `project.pinnedTodos`, never `project.frontier`.

- Include pins of EVERY status, and unorganized pins.
- Scheduled rows stay in the panel with their Day badge, exactly as today.
- Complete rows are crossed out in BOTH the panel row and the booked day card.
- Blocked rows get a FULL RED BORDER in BOTH the panel row and the booked day card, so the
  status reads before and after scheduling. Use an existing danger/red CSS custom property —
  do not hardcode a color.
- A pin icon appears on currently pinned pool rows and on bookings.
- An unscheduled COMPLETE pin stays visible but is NOT a drag source. Completed work can be
  reviewed, not newly booked.
- A BLOCKED pin stays draggable unless it is already scheduled.
- Completing a booked item refreshes the pinned pool so the SAME row turns complete, rather than
  being replaced by a frontier successor.
- An existing booking keeps rendering after the to-do is unpinned. The calendar item payload
  carries the current `isPinned` (T3), so the icon disappears on the next read while the booking
  itself remains.

### Tests (write them first)

- the pool maps pinnedTodos, not frontier
- the pool includes complete, blocked, and unorganized pins
- a scheduled pinned row keeps its Day badge in the panel
- a complete pool row and its booked day card are both crossed out
- a blocked pool row and its booked day card both carry the blocked modifier
- an unscheduled complete row is not a drag source
- a blocked unscheduled row is draggable
- completing a booked item refreshes the same pinned row as complete
- a booked item stays rendered after its to-do is unpinned
- an unpinned booking loses its pin icon on the next read
- a pinned pool row and a pinned booking both show a pin icon

### Gate

CI=true npm test --prefix src/client -- --runInBand
rg -n "frontier" src/client/src    # must return no live references

Paste the real output. Then commit with a `feat:` message.
```

---

## 12. T11 — E2E, dead-code sweep, full gates

**Depends on:** T8, T10 · **Gate:** all four gates in §13

```text
## Task T11: End-to-end flows and final cleanup

### Files you own
- tests/e2e/criticalFlow.spec.js, tests/e2e/calendar.spec.js, tests/e2e/helpers.js
- tests/integration cross-feature tests
- any remaining frontier/spotlight comments and references outside docs/

Do NOT change production behavior in this task. If a test exposes a real bug, report it as
DONE_WITH_CONCERNS with the failing assertion — do not silently patch the feature code.

### E2E critical flow to implement

1. Create filed, blocked, completed, and unorganized to-dos.
2. Enter Pin mode, select across all of those locations, and confirm ONCE.
3. Verify pin icons, MULTIPLE active sequences, and top-pin emphasis.
4. Verify Projects Home lists exactly those pins.
5. Verify Calendar lists exactly those pins.
6. Schedule an incomplete pin and a blocked pin; verify the blocked red border.
7. Complete the scheduled item; verify it stays booked and is crossed out.
8. Return to the project and unpin the booked item; verify the Calendar booking REMAINS but its
   pinned-pool row disappears.
9. Delete that to-do; verify the booking disappears.
10. Edit a multiline project description and verify it survives a reload.
11. Collapse a sequence and verify its description remains visible.

### Dead-code sweep

rg -n "frontier|NEXT STEP|THEN|SequenceSpotlight|activeSequenceId" src tests

This must return no live behavior references. Any remaining hit must be intentional historical
documentation under docs/ — list every surviving hit in your report with a one-line justification.

rg -n "isPinned|pinnedTodos|todos/pins" src tests

Confirm the frozen names are used consistently and nothing drifted to a variant spelling.

### Gates — run in this order so failures stay attributable

DB_NAME=planapp_test npm test -- --runInBand
CI=true npm test --prefix src/client -- --runInBand
npm run build --prefix src/client
DB_NAME=planapp_test npm run test:e2e

Paste the real output of all four. Then commit with a `test:` message.
```

---

## 13. Review prompts

### 13.1 Spec compliance reviewer (after every implementer)

Dispatch read-only: `--model gpt-5.6-sol --effort high --fresh` (no `--write`).

```text
You are reviewing whether an implementation matches its specification. Read-only: report, do not edit.

## What was requested

[PASTE the full task block from the runbook]

## What the implementer claims they built

[PASTE the implementer's report verbatim]

## Do not trust the report

The report may be incomplete, inaccurate, or optimistic. Verify everything independently by
reading the actual code and running the stated gate yourself.

Check for:
- Missing requirements — anything requested but not actually implemented, including claims that
  something works when the code does not do it
- Extra work — anything built that was not requested, over-engineering, speculative options
- Misunderstandings — the right feature implemented the wrong way, or the wrong problem solved
- Frozen-contract drift — any renamed field, endpoint, or exact UI string
- Immutability violations — in-place mutation of objects, arrays, Maps, or Sets anywhere in
  the diff
- Tests that assert on mocks rather than behavior, or that were written after the implementation

Report:
- Spec compliant, or
- Issues found: each with a file:line reference and whether it is missing, extra, or wrong
```

### 13.2 Code quality reviewer (only after spec review is clean)

Dispatch read-only with the SHA range for the task.

```text
You are performing a code quality review. Read-only: report, do not edit.

Diff under review: <BASE_SHA>..<HEAD_SHA>
Task: [task id and one-line summary]
Requirements: [paste the task block]

Review against the repository's coding standards:
- Immutability: no mutation of existing objects/arrays/Maps/Sets
- KISS / DRY / YAGNI — flag speculative abstraction and real (not imagined) duplication
- File and function size: files 200-400 lines typical and 800 max, functions under 50 lines,
  nesting no deeper than 4 levels
- Naming conventions: camelCase, PascalCase, UPPER_SNAKE_CASE, use/is/has/should/can prefixes
- No magic numbers
- Explicit error handling; user-friendly UI messages, detailed server logs
- Boundary validation
- CSS uses existing custom properties, not new hardcoded colors or spacing
- Tests follow Arrange-Act-Assert and are named for the behavior under test

Also check:
- Does each new file have one clear responsibility with a well-defined interface?
- Can each unit be understood and tested independently?
- Does the implementation follow the file structure the task specified?
- Did THIS change create large files or significantly grow existing ones? (Ignore pre-existing
  file size — judge only what this diff contributed.)
- Are there comments left behind that still describe frontier semantics?

Report: Strengths; Issues grouped Critical / Important / Minor with file:line; Assessment.
```

---

## 14. Final integrator review (orchestrator, after T11)

Review the whole branch for:

- immutable state updates everywhere, including the selection `Set` and the batched `todos` map;
- batch atomicity and ownership boundaries on `PUT /api/projects/:id/todos/pins`;
- keyboard and accessibility behavior in selection mode (`aria-pressed`, focus order, labels);
- stale-response and rollback behavior in the project and calendar hooks;
- CSS token use — no new hardcoded colors or spacing;
- comments that still describe frontier semantics;
- **no accidental modification to the already-deleted `docs/superpowers/**` files.**

Then run `superpowers:finishing-a-development-branch`.

---

## 15. Definition of Done (verbatim from the design plan §12)

- No live UI or API behavior depends on ready frontier calculations.
- Every to-do can be pinned/unpinned through the specified batch interaction.
- Pins stay in place and are visibly marked.
- Every sequence with a pin is active; its topmost pin is emphasized.
- Sequence outstanding lists contain no Next Step/Then distinction.
- Projects Home and Calendar show pins instead of frontier items.
- Completed pins stay visible and crossed out; blocked Calendar items have red borders.
- Completion and unpinning do not remove existing bookings; deleting the to-do does.
- Unorganized is bottom-right and closed by default.
- Project descriptions are editable multiline fields with the new prompt.
- Collapsed sequence cards show their descriptions.
- Server, client, build, and E2E gates pass.

---

## 16. Task checklist

- [ ] W0 — clean tree, branch `feat/pinned-todos`, baseline test run recorded
- [x] T1 — pin persistence (schema, repo, serializers) — `40d7456`, review fix `313f8a6`
- [x] T2 — atomic bulk pin endpoint — `f584bf7`
- [ ] T3 — pinnedTodos payloads, calendar isPinned, server frontier removal
- [ ] T4 — graph.js pin derivations, uniform sequenceCard model
- [ ] T5 — projectUpdated action, setTodosPinned, updateProjectDescription
- [ ] T6 — PinSelectionContext, PinControls, selectable rows
- [ ] T7 — uniform sequence lists, active sequences, Unorganized relocation
- [ ] T8 — InlineDescription
- [ ] T9 — Projects Home pinned block
- [ ] T10 — Calendar pinned pool and status styling
- [ ] T11 — E2E, dead-code sweep, full gates
- [ ] Final integrator review + finishing-a-development-branch
