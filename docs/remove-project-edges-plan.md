# Remove Project Sequence Lines Plan

## Goal

Remove the line-based dependency model from the project page and persistence layer. The project canvas should show layers and sequences only: no connecting lines, connector dots, connect mode, edge API, edge reducer state, or edge table.

The ready frontier becomes layer-based:

- A layer contributes at most one frontier sequence.
- Sort layers by `position`, then sort each layer's sequences by `position` without mutating either input.
- Skip completed sequences and inspect the first sequence in the layer whose derived status is not complete.
- Include that sequence only when its status is incomplete.
- If that sequence is manually blocked, the layer contributes nothing; do not skip past it.
- Layers are independent. A blocked or unfinished sequence in one layer does not gate another layer.
- Existing next-to-do behavior stays: first incomplete to-do by position, or `null` when the sequence is empty or all outstanding to-dos are blocked.

## Review corrections incorporated

The original draft had the right product direction but missed several dependencies that could leave the app or fresh databases broken:

- `projectsFrontier` needs real layer rows, so `layersRepo.listByOwner` and its tests are part of the frontier change. The home-page query count stays constant by replacing the edge query with a layer query.
- The full graph route, ownership middleware, serializer tests, API guard census, cascade tests, sequence move tests, and E2E seed helpers all contain edge assumptions and must be updated.
- The schema must retain `DROP TABLE IF EXISTS sequence_edges` in the destructive teardown, before parent tables are dropped, so rerunning the schema against a database created by the old version does not fail on foreign keys. The same statement is documented as the in-place upgrade for existing databases. The table's `CREATE TABLE` block is removed.
- Connection-removal notices have no producer after edges disappear, so the notice action/state/UI is removed rather than left as dead infrastructure.
- Calendar uses of “edge” (resize edges, card edges, geometry wording) are unrelated and must remain.
- The original final command used the development database from `.env`; server validation must explicitly set `DB_NAME=planapp_test`.

## Execution conventions

- Run these subagent tasks sequentially in order; later tasks depend on earlier ones and deliberately remove temporary compatibility left by earlier tasks.
- Follow `/Users/justin/AGENTS.md` and this repository's `AGENTS.md`. Keep updates immutable.
- Work test-first for each behavior change: make the focused test fail for the intended reason, implement the smallest fix, then rerun it.
- Commit completed work with the repository convention (`feat:`, `refactor:`, `test:`, and so on). Do not amend unrelated commits.
- Do not broaden scope into calendar resize-edge code.
- Intermediate tasks may leave edge code assigned to a later task. The zero-reference sweep belongs to the final task.
- Baseline on 2026-09-18: `DB_NAME=planapp_test npm test -- --runInBand`, `npm run test:client`, and `npm run test:e2e` all pass.

## Subagent 1 — Replace edge-gated frontier semantics with layer order

### Scope

Change the shared client/server frontier and the projects-home data loader. Preserve edge helpers still used by the old UI/client cascades until their owning tasks remove those consumers.

### Files

- `src/client/src/lib/graph.js`
- `src/lib/frontier.js`
- `src/lib/projectsFrontier.js`
- `src/db/repositories/layersRepo.js`
- `src/shared/frontierFixtures.json`
- `src/client/src/lib/graph.frontier.test.js`
- `src/client/src/lib/graph.test.js`
- `tests/unit/frontier.test.js`
- `tests/integration/projectsFrontierRoute.test.js`
- `tests/integration/layersRepo.test.js`

### Steps

- [ ] Rewrite the shared frontier fixtures and both fixture-driven suites around layers: completed-leftmost advancement, one item per layer, blocked-first suppression without skipping, independent layers, empty/all-complete projects, blocked to-dos, and next-to-do ordering. Pass `layers` instead of `edges`, and extend the immutability assertion to cover layers.
- [ ] Implement matching immutable `readyFrontier({ layers, sequences, todos })` logic in client and server. Return entries in layer-position order, with each layer's chosen sequence determined by sequence position. Keep `sequenceStatus` and `nextTodoOf` behavior unchanged.
- [ ] Change `activeSequenceId` to accept `{ layers, sequences, todos }`, derive candidates from the new frontier, ignore frontier entries with `nextTodo === null`, and choose the earliest startable sequence by layer position then sequence position. Update focused client tests, including the case where a blocked first sequence prevents a later sequence in that same layer from receiving the spotlight.
- [ ] Add `layersRepo.listByOwner`, ordered by project and layer position, with owner-isolation integration coverage. Update `projectsFrontier` to fetch, serialize, group, and pass layers instead of edges for both list and single-project payloads.
- [ ] Update `projectsFrontierRoute` integration coverage to the new semantics. The representative three-layer project should surface the first unfinished sequence from every applicable layer (three lines in the current drone fixture), a blocked first sequence should suppress only its own layer, and the one-project/five-project statement count must remain equal.
- [ ] Run the focused client frontier tests and `DB_NAME=planapp_test npm test -- --runInBand tests/unit/frontier.test.js tests/integration/layersRepo.test.js tests/integration/projectsFrontierRoute.test.js`, then commit this task.

### Acceptance checks

- Frontier code takes no edge input.
- Every layer contributes zero or one entry under the exact blocked/complete rule above.
- Client and server remain locked to the same fixture table.
- The project-list loader remains constant-query and owner-scoped.

## Subagent 2 — Remove project edge/connect UI

### Scope

Simplify the project canvas and sequence card while leaving drag/drop, editing, deletion, folding, spotlight, and add controls intact.

### Delete

- `src/client/src/components/Project/EdgeLayer.js`
- `src/client/src/components/Project/EdgeLayer.test.js`
- `src/client/src/components/Project/ConnectorDot.js`
- `src/client/src/components/Project/ConnectMode.test.js`
- `src/client/src/hooks/useConnectSelection.js`
- `src/client/src/hooks/useConnectSelection.test.js`
- `src/client/src/hooks/useNodePositions.js`
- `src/client/src/state/ConnectContext.js`
- `src/client/src/state/NodeRegistryContext.js`
- `src/client/src/lib/geometry.js`
- `src/client/src/lib/geometry.test.js`
- `src/client/src/components/Styling/Edges.css`

### Update

- `src/client/src/components/Project/Canvas.js`
- `src/client/src/components/Project/SequenceCard.js`
- `src/client/src/components/Project/ProjectPage.js`
- `src/client/src/components/Project/LayerRow.js`
- `src/client/src/components/Styling/Project.css`
- `src/client/src/components/Project/Canvas.test.js`
- `src/client/src/components/Project/sequenceCardHarness.js`
- `src/client/src/lib/graph.js`
- `src/client/src/lib/graph.test.js`
- Any directly affected project component test fixtures/comments

### Steps

- [ ] Add/update focused canvas and card assertions for the simplified UI, then remove `EdgeLayer`, node measurement, geometry, connect selection, Escape/background clearing, connect providers, edge-derived node mapping, connector dots, connect overlays, `data-connect`, and connect CSS classes. Keep collection derivation memoized where it avoids rebuilding arrays, and call `activeSequenceId({ layers, sequences, todos })`.
- [ ] Remove the `Edges.css` import and delete all edge-only UI/hooks/context/geometry files and their obsolete tests listed above. Remove `isEligibleChild` and its tests now that connect mode has no consumer; retain `canConnect` temporarily because client cascade cleanup belongs to Subagent 4.
- [ ] Clean project canvas/card/gutter comments and CSS that describe line routing, connector measurement, or connect mode. Keep `--canvas-gutter` and the right gutter itself because it still owns the add-sequence control.
- [ ] Run focused `Canvas`, `SequenceCard`, `ProjectPage`, and `graph` tests plus `npm run build --prefix src/client`, then commit this task.

### Acceptance checks

- No `Connect from …` or `Connect to …` control renders.
- No `.edge-layer` SVG, connector dot, node registry, or connect provider remains.
- Sequence cards still fold, edit, delete, drag, accept to-dos, and show the active spotlight.
- The right gutter remains an add-sequence column.

## Subagent 3 — Remove server edge API, repository, serializer, and schema table

### Scope

Remove persisted/API edge functionality while preserving project/layer/sequence/todo behavior and safe schema reruns.

### Delete

- `src/db/repositories/edgesRepo.js`
- `src/lib/assertCanConnect.js`
- `tests/integration/edgesRepo.test.js`
- `tests/integration/edgesRoutes.test.js`

### Update

- `src/routes/projects.js`
- `src/routes/sequences.js`
- `src/db/repositories/sequencesRepo.js`
- `src/db/repositories/projectsRepo.js`
- `src/db/schema.sql`
- `src/lib/serializers.js`
- `src/lib/assertSequenceInProject.js`
- `src/middleware/assertOwnership.js`
- `tests/unit/serializers.test.js`
- `tests/integration/apiGuards.test.js`
- `tests/integration/assertOwnership.test.js`
- `tests/integration/cascades.test.js`
- `tests/integration/projectGraphRoute.test.js`
- `tests/integration/sequenceMoveRoute.test.js`
- `tests/integration/sequencesRoutes.test.js`

### Steps

- [ ] Update graph-route and API census tests first: `GET /api/projects/:id` returns exactly project/layers/sequences/todos, and the edge POST/DELETE endpoints are no longer part of the API surface. Remove edge fixtures from those suites.
- [ ] Remove edge route schemas/imports/handlers and the edge graph query from `projects.js`; update its query-count documentation. Remove `toEdge`, the edge ownership resource type, and their tests. Delete `edgesRepo` and `assertCanConnect` after all server imports are gone.
- [ ] Remove invalid-edge deletion SQL from `sequencesRepo.move` and edge-specific route/repository comments. Update sequence-move and sequence-delete tests so they continue to prove dense positions, cross-layer ownership, todo freeing, and transaction behavior without testing connections.
- [ ] Remove edge setup/assertions from schema cascade tests while retaining project/layer/sequence/todo cascade coverage. Update `projectsRepo`, `assertSequenceInProject`, and E2E-adjacent server comments that claim edges are part of a cascade or request.
- [ ] In `schema.sql`, remove the `sequence_edges` `CREATE TABLE` block. Add an existing-database upgrade note containing `DROP TABLE IF EXISTS sequence_edges;`, and retain that same drop in the destructive teardown before `todos`/`sequences`/`projects` so old foreign keys cannot break a rerun. These are the only intentional server-side `sequence_edges` references after this task.
- [ ] Run `DB_NAME=planapp_test npm test -- --runInBand`; use a server-only `rg` sweep to confirm no `edgesRepo`, `assertCanConnect`, `toEdge`, edge route, or edge ownership references remain; then commit this task.

### Acceptance checks

- Project graph responses contain no `edges` property.
- `/api/projects/:id/edges` has no registered handlers.
- Moving a sequence only moves/reindexes sequences.
- Fresh schemas do not create the edge table, and old schemas can be safely torn down or upgraded.

## Subagent 4 — Remove client edge state, mutations, cascades, and notices

### Scope

Bring client state and optimistic mutations in line with the four-collection graph payload, and remove the connection-removal notice channel that becomes unused.

### Delete

- `src/client/src/hooks/useProjectMutations.edges.test.js`

### Update

- `src/client/src/state/projectReducer.js`
- `src/client/src/state/projectActions.js`
- `src/client/src/state/cascades.js`
- `src/client/src/hooks/useProjectGraph.js`
- `src/client/src/hooks/useProjectMutations.js`
- `src/client/src/components/Project/ProjectPage.js`
- `src/client/src/components/Styling/Project.css`
- `src/client/src/lib/graph.js`
- `src/client/src/lib/graph.test.js`
- `src/client/src/state/cascadeHarness.js`
- `src/client/src/testUtils/mutationsHarness.js`
- `src/client/src/components/Project/sequenceCardHarness.js`
- `src/client/src/hooks/useProjectGraph.test.js`
- `src/client/src/hooks/useProjectMutations.layers.test.js`
- `src/client/src/hooks/useProjectMutations.sequences.test.js`
- `src/client/src/state/cascades.layers.test.js`
- `src/client/src/state/cascades.sequences.test.js`
- `src/client/src/state/projectReducer.test.js`
- Other project test fixtures still declaring `edges`

### Steps

- [ ] Update reducer and hook tests first for a graph with only `layers`, `sequences`, and `todos` collections. Remove `edges` from `COLLECTIONS`, initial state, loading, rollback snapshots, fixtures, and assertions while preserving immutable optimistic rollback behavior.
- [ ] Remove `toggleEdge`, edge mutation tests, edge-removal cascade actions, move-sequence connection counting, and connection notices. Simplify `cascadeSequenceRemoval`, `cascadeLayerRemoval`, and `cascadeSequenceMove` while retaining todo freeing and dense-position actions.
- [ ] Remove the now-unused notice action types/creators/state, `raiseNotice`/`dismissNotice`, notice toast markup/CSS, harness spies, and notice-specific tests. Keep action errors and their alert unchanged.
- [ ] Remove `canConnect` and its remaining tests once the cascade no longer imports it. Clean edge-specific comments in `useProjectGraph`, mutation hooks, reducer rollback docs, cascade docs, and test harnesses.
- [ ] Run the affected reducer/cascade/mutation/hook/component tests and the full `npm run test:client`, then commit this task.

### Acceptance checks

- Client graph state has exactly layers, sequences, and todos.
- No client mutation calls `/projects/:id/edges`.
- Sequence/layer deletion still frees to-dos and closes positions.
- Sequence movement still reindexes both layers and no longer emits a connection notice.

## Subagent 5 — Rewrite E2E coverage, sweep stale references, and validate

### Scope

Remove obsolete edge/connect browser scenarios, preserve non-edge interaction coverage, and perform the final repository-wide proof.

### Update

- `tests/e2e/helpers.js`
- `tests/e2e/criticalFlow.spec.js`
- `tests/e2e/keyboard.spec.js`
- `tests/e2e/dragPartitioning.spec.js`
- `tests/e2e/database.js`
- `playwright.config.js`
- Remaining comments/fixtures found by the scoped searches below

### Steps

- [ ] Simplify E2E seeding: remove edge path parsing/assertion helpers and edge API calls; rename `seedConnectedPlan` to a neutral layered-plan helper; make crowded-plan setup only seed what horizontal-scroll coverage needs.
- [ ] Remove connect-mode, persisted-line, line-clipping, connector keyboard, and connection-removal-notice E2E steps. Keep and adapt project creation, todos, folding, sequence dragging (open and folded), nested drag collision partitioning, keyboard todo drag/reorder, and crowded-row scrolling.
- [ ] Update frontier E2E expectations to layer independence: after the parent is reopened, both the parent's layer and the child's layer may contribute a frontier line. Add an explicit assertion that the simplified project page has no connect controls, connector dots, or edge SVG.
- [ ] Run scoped stale-reference searches and remove or justify every hit. The only intentional `sequence_edges` hits are the two schema upgrade/teardown drops; calendar resize-edge terminology and `useResizeEdge` are unrelated and stay.
- [ ] Run final validation in order: `DB_NAME=planapp_test npm test -- --runInBand`, `npm run test:client`, `npm run build --prefix src/client`, and `npm run test:e2e`. Fix regressions within scope, rerun the failed command, and commit the completed sweep.

### Required searches

```bash
rg -n -i "edgesRepo|assertCanConnect|toggleEdge|ConnectorDot|EdgeLayer|ConnectProvider|NodeRegistryProvider|connect from|connect to|connector-dot|edge-layer" src tests playwright.config.js -g '!**/node_modules/**'
```

```bash
rg -n "sequence_edges" src tests playwright.config.js -g '!**/node_modules/**'
```

```bash
rg -n "\bedges\b" src/client/src/components/Project src/client/src/hooks/useProjectGraph.js src/client/src/hooks/useProjectMutations.js src/client/src/state src/client/src/lib/graph.js src/routes src/lib src/db/repositories tests -g '!**/node_modules/**'
```

### Definition of done

- Project pages show layered sequences only.
- No connecting lines, connector dots, connect mode, edge API, edge repository, edge serializer, edge reducer state, or edge table creation remains.
- Frontier is derived entirely from layer order, sequence order, sequence status, and to-dos.
- Existing-database removal is documented and destructive schema reruns remain safe.
- Server, client, production build, and E2E validation all pass.
