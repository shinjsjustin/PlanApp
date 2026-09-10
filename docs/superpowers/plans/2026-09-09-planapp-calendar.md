# Calendar Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/calendar` — a right-hand pool of each project's startable to-dos and a left-hand strip of 24-hour day columns, with drag-and-drop scheduling, edge resizing, a downward-only push cascade, and overflow that spills whole items into the next day.

**Architecture:** Two new user-owned tables (`calendar_days`, `calendar_items`) behind `/api/calendar`, following the repository → serializer → `respond` envelope pattern the rest of the API already uses. The scheduling arithmetic lives entirely on the client in `src/client/src/lib/schedule.js` as pure functions over plain data, because it has to run on every pointer move to draw the drag ghost; the server validates that the layout it is handed is legal rather than recomputing it. Client state follows `useProjectGraph`: a normalised reducer with optimistic mutations that roll back on failure.

**Tech Stack:** Express 4, MySQL 2 (promise pool), Zod 4, React 18 (CRA), React Router 6, `@dnd-kit/core`, Jest + Supertest (server), React Testing Library (client), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-09-09-planapp-calendar-design.md`. Read it before starting. Section numbers referenced below are that document's.

---

## Before you start

**Read these files.** The plan imitates them closely, and reviewers will expect the new code to look like them:

| File | Why |
|---|---|
| `src/db/repositories/layersRepo.js` | The repository shape: `TABLE`, `SELECT_COLUMNS`, `listIds`, dense-position reindexing |
| `src/db/repositories/sql.js` | `firstRow`, `buildAssignments`, `applyPositions` — and the table allow-list you must extend |
| `src/db/repositories/positions.js` | `insertAt`, `removeItem`, `toPositions` — never hand-roll reindexing |
| `src/routes/layers.js` | Route shape: `asyncRoute`, `assertOwnership`, `withTransaction`, `res.sendData` |
| `src/lib/validation.js` | Shared Zod field schemas and `parseId` |
| `src/lib/serializers.js` | snake_case → camelCase at the boundary; `owner_id` never leaves the server |
| `src/middleware/assertOwnership.js` | The single ownership check; you add one resource type to it |
| `tests/integration/layersRoutes.test.js` | Integration test shape: `useTransaction`, `createTestUser`, `authHeaderFor` |
| `src/client/src/hooks/useProjectGraph.js` | The optimistic-mutation engine `useCalendar` mirrors |
| `src/client/src/state/projectReducer.js` | Normalised reducer, `snapshotOf`, `clientKeyOf` |
| `src/client/src/components/Project/DragDropArea.js` | `DndContext` wiring and scoped collision detection |
| `src/client/src/lib/dragDrop.js` | The precedent: drop *meaning* is pure functions, not DOM code |

**Conventions that are not negotiable in this repo:**

- **Never mutate.** Every reducer case, every cascade function, every helper returns new objects. This is the single most-enforced rule in the codebase.
- **No hardcoded values.** Colours, spacing, radii and type sizes come from the `:root` tokens in `src/client/src/index.css`. Magic numbers become named constants.
- **Errors are never swallowed.** Every failure path either rolls back and surfaces a message, or rethrows.
- **Comments explain *why*, not *what*.** Match the density of the surrounding files — they are heavily commented with reasoning, not narration.
- **Files stay small.** 200–400 lines typical, 800 hard ceiling.

**Environment:**

```bash
# Server + integration tests need a database whose name ends in _test
DB_NAME=planapp_test npm test

# Client tests
npm run test:client

# Everything
npm run test:all
```

If `planapp_test` does not exist yet, create it and load the schema:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS planapp_test"
mysql -u root -p planapp_test < src/db/schema.sql
```

---

## File Structure

### Server — created

| File | Responsibility |
|---|---|
| `src/db/repositories/calendarDaysRepo.js` | `calendar_days` CRUD; dense `position` per owner |
| `src/db/repositories/calendarItemsRepo.js` | `calendar_items` reads (with the display join) and bulk apply |
| `src/lib/calendarPlacement.js` | Pure validation of a resolved placement set: grid, bounds, overlap |
| `src/routes/calendar.js` | The five endpoints |
| `tests/integration/calendarDaysRepo.test.js` | Repository behaviour, position density |
| `tests/integration/calendarRoutes.test.js` | The five endpoints, guards, validation failures |
| `tests/unit/calendarPlacement.test.js` | The pure validator |

### Server — modified

| File | Change |
|---|---|
| `src/db/schema.sql` | Two `CREATE TABLE`s, two teardown lines, migration note |
| `src/db/repositories/sql.js` | `POSITIONED_TABLES` gains `calendar_days` |
| `src/lib/serializers.js` | `toCalendarDay`, `toCalendarItem` |
| `src/middleware/assertOwnership.js` | `calendarDay` resource type |
| `src/server.js` | Mount `/api/calendar` |
| `tests/unit/serializers.test.js` | Cover the two new serializers |

### Client — created

| File | Responsibility |
|---|---|
| `src/client/src/lib/tempIds.js` | Shared negative-id generator (extracted, see Task 10) |
| `src/client/src/lib/schedule.js` | The cascade: settle, spill, and the four placement operations |
| `src/client/src/lib/scheduleGeometry.js` | Minutes ↔ pixels, snapping, clamping, time formatting |
| `src/client/src/lib/calendarRequest.js` | Turns a settled state into the bulk request body |
| `src/client/src/state/calendarReducer.js` | Normalised calendar state |
| `src/client/src/state/calendarActions.js` | Action creators |
| `src/client/src/state/CalendarContext.js` | Provider + `useCalendarContext` |
| `src/client/src/hooks/useCalendar.js` | Load + optimistic mutations |
| `src/client/src/hooks/usePool.js` | Loads `/projects` and derives the pool |
| `src/client/src/hooks/useCalendarDrag.js` | `usePoolDrag` / `useBookingDrag`; kept out of the component tree to avoid a cycle |
| `src/client/src/hooks/useResizeEdge.js` | Raw pointer gesture on a card's edges |
| `src/client/src/hooks/useSequenceSpotlight.js` | Reads `?sequence=` and flashes the card |
| `src/client/src/components/Calendar/CalendarPage.js` | Page shell: load, error, ready |
| `src/client/src/components/Calendar/CalendarDragArea.js` | One `DndContext`; drop → cascade → save |
| `src/client/src/components/Calendar/DayStrip.js` | Horizontal strip of columns + add-day |
| `src/client/src/components/Calendar/DayColumn.js` | One day: header, delete, inner 24h scroll |
| `src/client/src/components/Calendar/DayGrid.js` | 48 droppable half-hour slots + hour labels |
| `src/client/src/components/Calendar/DayItemCard.js` | Bubble · handle · name, plus two resize edges |
| `src/client/src/components/Calendar/ProjectPanel.js` | The pool; hosts the remove overlay |
| `src/client/src/components/Calendar/ProjectAccordionCard.js` | Collapsed / expanded project card |
| `src/client/src/components/Calendar/PanelTodoRow.js` | Draggable row, or inert with a day badge |
| `src/client/src/components/Calendar/RemoveOverlay.js` | "Drag here to remove from day" |
| `src/client/src/components/Styling/Calendar.css` | All calendar styling, tokens only |

Tests live beside each client module as `<name>.test.js`, matching the existing layout.

### Client — modified

| File | Change |
|---|---|
| `src/client/src/state/projectActions.js` | Import temp-id helpers from `lib/tempIds` and re-export |
| `src/client/src/routes.js` | `/calendar` route |
| `src/client/src/components/Navbar.js` | Calendar link |
| `src/client/src/components/Project/ProjectPage.js` | Read `?sequence=` and pass a highlight down |
| `src/client/src/components/Project/Canvas.js` | Thread `highlightedSequenceId` to rows |
| `src/client/src/components/Project/LayerRow.js` | Thread it to cards |
| `src/client/src/components/Project/SequenceCard.js` | Render the flash class |
| `src/client/src/components/Styling/SequenceCard.css` | The flash animation |
| `tests/e2e/calendar.spec.js` | Critical flow (created) |

---

# Phase A — Server

## Task 1: Schema

**Files:**
- Modify: `src/db/schema.sql`

- [x] **Step 1: Add the two tables**

Append these after the `sequence_edges` block at the end of the file:

```sql
-- -- calendar_days ---------------------------------------------------------
-- A day is an ordered container spanning a full 24 hours, not a calendar date
-- (design 2026-09-09, decision 2). `position` is dense 0..n-1, left to right.
-- It hangs off the user rather than off a project: the calendar's whole purpose
-- is drawing work from every project at once.
CREATE TABLE `calendar_days` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`   int unsigned NOT NULL,
  `position`   int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_days_owner_position` (`owner_id`, `position`),
  CONSTRAINT `fk_calendar_days_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- calendar_items --------------------------------------------------------
-- One booking: a to-do placed in a day at a start time for a duration, both in
-- integer minutes from midnight rather than as clock strings.
--
-- `uq_calendar_items_todo` is load-bearing. It makes "a to-do is booked at most
-- once" a fact of the database rather than a convention the client is trusted to
-- keep, which is what lets a scheduled row in the pool be inert rather than
-- needing to reason about N bookings (design decision 4).
--
-- Both foreign keys cascade on delete, and each one buys a behaviour:
--   - day_id  — deleting a day releases its bookings and touches no to-do.
--   - todo_id — deleting a to-do on the project page unschedules it here, with
--               no cross-page bookkeeping.
CREATE TABLE `calendar_items` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `todo_id`          int unsigned NOT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_calendar_items_todo` (`todo_id`),
  KEY `idx_calendar_items_day_start` (`day_id`, `start_minutes`),
  CONSTRAINT `fk_calendar_items_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_calendar_items_todo`
    FOREIGN KEY (`todo_id`) REFERENCES `todos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
```

- [x] **Step 2: Extend the teardown block**

The teardown at the top of the file drops in reverse dependency order. Add the
two new tables as its first two lines, so they go before `todos` and `users`:

```sql
DROP TABLE IF EXISTS `calendar_items`;
DROP TABLE IF EXISTS `calendar_days`;
DROP TABLE IF EXISTS `sequence_edges`;
DROP TABLE IF EXISTS `todos`;
DROP TABLE IF EXISTS `sequences`;
DROP TABLE IF EXISTS `layers`;
DROP TABLE IF EXISTS `projects`;
DROP TABLE IF EXISTS `users`;
```

- [x] **Step 3: Add the in-place migration note**

The file's header comment already carries an "add these by hand" note for the
sequence-card redesign. Add a second one below it, so an existing install is
never asked to re-run this destructive file:

```sql
-- A database created before the calendar page is missing two tables. Add them in
-- place rather than re-running this file: copy the two CREATE TABLE statements
-- for `calendar_days` and `calendar_items` from the bottom of this file and run
-- those alone.
```

- [x] **Step 4: Load the schema into the test database**

Run:

```bash
mysql -u root -p planapp_test < src/db/schema.sql
mysql -u root -p planapp_test -e "SHOW TABLES LIKE 'calendar%'"
```

Expected: two rows, `calendar_days` and `calendar_items`.

- [x] **Step 5: Verify nothing else broke**

Run: `DB_NAME=planapp_test npm test`
Expected: the existing suite passes, unchanged.

- [x] **Step 6: Commit**

```bash
git add src/db/schema.sql
git commit -m "feat(calendar): add calendar_days and calendar_items tables"
```

---

## Task 2: Teach the position helper about calendar days

**Files:**
- Modify: `src/db/repositories/sql.js`
- Test: `tests/unit/applyPositions.test.js`

`applyPositions` refuses any table not in its allow-list, and that list is a
security boundary: the table name is the one thing interpolated into SQL rather
than bound. `calendar_days` has a dense `position`, so it belongs there.

- [x] **Step 1: Write the failing test**

Create `tests/unit/applyPositions.test.js`:

```js
'use strict';

const { applyPositions } = require('../../src/db/repositories/sql');

/**
 * The allow-list is the only thing standing between a table name and a SQL
 * string, so these tests pin both of its sides: the tables that are allowed
 * through, and the refusal for everything else.
 */
describe('applyPositions', () => {
    /** A connection stub that records the statements it was asked to run. */
    const recordingConn = () => {
        const calls = [];

        return {
            calls,
            execute: async (sql, values) => {
                calls.push({ sql, values });
                return [{}];
            },
        };
    };

    test('reindexes calendar_days to dense 0..n-1', async () => {
        // Arrange
        const conn = recordingConn();

        // Act
        await applyPositions(conn, 'calendar_days', [7, 3, 9]);

        // Assert
        expect(conn.calls.map((call) => call.values)).toEqual([
            [0, 7],
            [1, 3],
            [2, 9],
        ]);
    });

    test('refuses a table with no dense position column', async () => {
        // Arrange
        const conn = recordingConn();

        // Act + Assert
        await expect(applyPositions(conn, 'users', [1])).rejects.toThrow(
            'Table "users" has no dense position column'
        );
        expect(conn.calls).toHaveLength(0);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/unit/applyPositions.test.js`
Expected: FAIL — `Table "calendar_days" has no dense position column`.

- [x] **Step 3: Add the table to the allow-list**

In `src/db/repositories/sql.js`, extend `POSITIONED_TABLES`:

```js
const POSITIONED_TABLES = new Set(['layers', 'sequences', 'todos', 'calendar_days']);
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/unit/applyPositions.test.js`
Expected: PASS, 2 tests.

- [x] **Step 5: Commit**

```bash
git add src/db/repositories/sql.js tests/unit/applyPositions.test.js
git commit -m "feat(calendar): allow dense position reindexing on calendar_days"
```

---

## Task 3: `calendarDaysRepo`

**Files:**
- Create: `src/db/repositories/calendarDaysRepo.js`
- Test: `tests/integration/calendarDaysRepo.test.js`

- [x] **Step 1: Write the failing test**

Create `tests/integration/calendarDaysRepo.test.js`:

```js
'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * The property asserted throughout: `position` stays dense — 0..n-1, no gaps, no
 * duplicates — through appends and deletes alike, scoped to one owner. A second
 * user's days must never appear in the first user's ordering.
 */

/** The owner's days as `[id, position]` pairs, left to right. */
const dayOrder = async (conn, ownerId) => {
    const days = await calendarDaysRepo.listByOwner(conn, ownerId);

    return days.map((day) => [day.id, day.position]);
};

describe('calendarDaysRepo.create', () => {
    test('appends the first day at position 0', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const day = await calendarDaysRepo.create(conn, { ownerId });

        // Assert
        expect(day.position).toBe(0);
        expect(day.owner_id).toBe(ownerId);
        expect(day.created_at).toBeInstanceOf(Date);
    });

    test('appends each further day at the end', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const first = await calendarDaysRepo.create(conn, { ownerId });
        const second = await calendarDaysRepo.create(conn, { ownerId });
        const third = await calendarDaysRepo.create(conn, { ownerId });

        // Assert
        expect(await dayOrder(conn, ownerId)).toEqual([
            [first.id, 0],
            [second.id, 1],
            [third.id, 2],
        ]);
    });

    test('counts positions per owner, not globally', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createTestUser(conn);
        await calendarDaysRepo.create(conn, { ownerId: theirs });
        await calendarDaysRepo.create(conn, { ownerId: theirs });

        // Act
        const day = await calendarDaysRepo.create(conn, { ownerId: mine });

        // Assert
        expect(day.position).toBe(0);
        expect(await dayOrder(conn, mine)).toEqual([[day.id, 0]]);
    });
});

describe('calendarDaysRepo.remove', () => {
    test('closes the gap it leaves', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await calendarDaysRepo.create(conn, { ownerId });
        const second = await calendarDaysRepo.create(conn, { ownerId });
        const third = await calendarDaysRepo.create(conn, { ownerId });

        // Act
        const removed = await calendarDaysRepo.remove(conn, second.id);

        // Assert
        expect(removed).toBe(true);
        expect(await dayOrder(conn, ownerId)).toEqual([
            [first.id, 0],
            [third.id, 1],
        ]);
    });

    test('reports false for a day that is already gone', async () => {
        // Arrange
        const conn = getConn();

        // Act
        const removed = await calendarDaysRepo.remove(conn, 999999);

        // Assert
        expect(removed).toBe(false);
    });
});

describe('calendarDaysRepo.listByOwner', () => {
    test('returns an empty array for an owner with no days', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const days = await calendarDaysRepo.listByOwner(conn, ownerId);

        // Assert
        expect(days).toEqual([]);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarDaysRepo.test.js`
Expected: FAIL — `Cannot find module '../../src/db/repositories/calendarDaysRepo'`.

- [x] **Step 3: Write the repository**

Create `src/db/repositories/calendarDaysRepo.js`:

```js
'use strict';

const { firstRow, applyPositions } = require('./sql');
const { insertAt, removeItem } = require('./positions');

/**
 * Data access for `calendar_days` — the ordered 24-hour containers of the
 * calendar page, left to right by a dense `position`.
 *
 * Unlike every other positioned table here, the ordering is scoped to a *user*
 * rather than to a parent row: the calendar draws from all of an owner's
 * projects, so it hangs off `users` directly. Everything below therefore reads
 * and reindexes by `owner_id`.
 *
 * A day carries no title. It is identified by where it sits and when it was
 * made, which is what `position` and `created_at` are for; naming days is
 * deliberately out of scope for the first pass (design section 11).
 */

const TABLE = 'calendar_days';

const SELECT_COLUMNS = 'id, owner_id, position, created_at, updated_at';

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM calendar_days WHERE id = ?`,
        [id]
    );

    return firstRow(rows);
};

const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM calendar_days
         WHERE owner_id = ?
         ORDER BY position, id`,
        [ownerId]
    );

    return rows;
};

/** The owner's day ids in display order — the input to the position helpers. */
const listIds = async (conn, ownerId) => {
    const days = await listByOwner(conn, ownerId);

    return days.map((day) => day.id);
};

/**
 * Appends a day at the end of the owner's strip. There is no "insert before"
 * form: days are only ever added at the end, by the + at the right of the strip
 * or by an overflow that ran out of room (design section 6).
 */
const create = async (conn, { ownerId }) => {
    const ordering = await listIds(conn, ownerId);

    // Insert at the end first and let the reindex place it, so the new row can
    // never collide with an existing position.
    const [result] = await conn.execute(
        'INSERT INTO calendar_days (owner_id, position) VALUES (?, ?)',
        [ownerId, ordering.length]
    );

    await applyPositions(conn, TABLE, insertAt(ordering, result.insertId, ordering.length));

    return findById(conn, result.insertId);
};

/**
 * Deletes a day and closes the gap it leaves. Its bookings go with it through
 * the schema's `ON DELETE CASCADE`, and the to-dos behind them are untouched —
 * the container goes, the work does not (design decision 6).
 *
 * Rewrites more than one row, so callers run it inside a transaction.
 */
const remove = async (conn, id) => {
    const existing = await findById(conn, id);
    if (!existing) return false;

    const ordering = await listIds(conn, existing.owner_id);

    await conn.execute('DELETE FROM calendar_days WHERE id = ?', [id]);
    await applyPositions(conn, TABLE, removeItem(ordering, id));

    return true;
};

module.exports = { create, findById, listByOwner, listIds, remove };
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarDaysRepo.test.js`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add src/db/repositories/calendarDaysRepo.js tests/integration/calendarDaysRepo.test.js
git commit -m "feat(calendar): add calendarDaysRepo with per-owner dense positions"
```

---

## Task 4: Serializers

**Files:**
- Modify: `src/lib/serializers.js`
- Test: `tests/unit/serializers.test.js`

A booked item carries its own display data — text, status, project and sequence
— because the calendar must render an item that has left the frontier, which is
exactly what ticking its bubble does (design section 5).

- [x] **Step 1: Write the failing test**

Append to `tests/unit/serializers.test.js`:

```js
describe('toCalendarDay', () => {
    test('maps a row and keeps owner_id server-side', () => {
        // Arrange
        const row = {
            id: 4,
            owner_id: 12,
            position: 2,
            created_at: new Date('2026-09-09T08:00:00Z'),
            updated_at: new Date('2026-09-09T08:00:00Z'),
        };

        // Act
        const day = toCalendarDay(row);

        // Assert
        expect(day).toEqual({
            id: 4,
            position: 2,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
        expect(day).not.toHaveProperty('ownerId');
        expect(day).not.toHaveProperty('owner_id');
    });
});

describe('toCalendarItem', () => {
    test('carries the display data a day column needs', () => {
        // Arrange
        const row = {
            id: 7,
            day_id: 4,
            todo_id: 12,
            start_minutes: 540,
            duration_minutes: 60,
            text: 'Wire up the token refresh',
            status: 'incomplete',
            project_id: 2,
            project_title: 'Auth rewrite',
            sequence_id: 9,
            sequence_title: 'Session handling',
        };

        // Act + Assert
        expect(toCalendarItem(row)).toEqual({
            id: 7,
            dayId: 4,
            todoId: 12,
            text: 'Wire up the token refresh',
            status: 'incomplete',
            projectId: 2,
            projectTitle: 'Auth rewrite',
            sequenceId: 9,
            sequenceTitle: 'Session handling',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });

    test('nulls the sequence for a to-do returned to the unorganized panel', () => {
        // Arrange — the LEFT JOIN produces nulls rather than dropping the row
        const row = {
            id: 7,
            day_id: 4,
            todo_id: 12,
            start_minutes: 0,
            duration_minutes: 30,
            text: 'Unfiled but still booked',
            status: 'incomplete',
            project_id: 2,
            project_title: 'Auth rewrite',
            sequence_id: null,
            sequence_title: null,
        };

        // Act
        const item = toCalendarItem(row);

        // Assert
        expect(item.sequenceId).toBeNull();
        expect(item.sequenceTitle).toBeNull();
        expect(item.text).toBe('Unfiled but still booked');
    });
});
```

Add `toCalendarDay` and `toCalendarItem` to the `require` destructuring at the
top of that test file.

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/unit/serializers.test.js`
Expected: FAIL — `toCalendarDay is not a function`.

- [x] **Step 3: Add the serializers**

In `src/lib/serializers.js`, before `module.exports`:

```js
/**
 * A day carries no title: it is identified by where it sits and when it was
 * made. `owner_id` stays server-side like every other ownership column.
 */
const toCalendarDay = (row) => ({
    id: row.id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

/**
 * One booking, with the display data the day column needs folded in.
 *
 * Deliberately *not* narrow, unlike `toFrontierEntry`. A day column has to draw
 * a name, tick a bubble and link to a project and a sequence, and it cannot get
 * those from the right-hand pool: a to-do leaves the pool the moment it is
 * completed, which is precisely when its card is specified to stay on screen. An
 * item that could not name itself after being ticked would go blank as a result
 * of the user finishing it.
 *
 * `sequenceId` is null when the to-do has since been returned to the unorganized
 * panel — `todos.sequence_id` is nullable, and nothing stops a to-do being
 * unfiled on the project page after it was booked here. The row still comes
 * back; the query reaches `sequences` through a LEFT JOIN for that reason.
 *
 * Times are integer minutes from midnight, never clock strings. Formatting is
 * the client's business.
 */
const toCalendarItem = (row) => ({
    id: row.id,
    dayId: row.day_id,
    todoId: row.todo_id,
    text: row.text,
    status: row.status,
    projectId: row.project_id,
    projectTitle: row.project_title,
    sequenceId: row.sequence_id ?? null,
    sequenceTitle: row.sequence_title ?? null,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
});
```

Then extend the export:

```js
module.exports = {
    toCalendarDay,
    toCalendarItem,
    toEdge,
    toFrontierEntry,
    toLayer,
    toProject,
    toSequence,
    toTodo,
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/unit/serializers.test.js`
Expected: PASS, including the 3 new tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/serializers.js tests/unit/serializers.test.js
git commit -m "feat(calendar): serialize calendar days and items"
```

---

## Task 5: Ownership for calendar days

**Files:**
- Modify: `src/middleware/assertOwnership.js`
- Test: `tests/integration/assertOwnership.test.js`

Every existing resource type reduces to "does this resource's project belong to
this user?". A calendar day has no project — it hangs off `users` directly — so
this adds the first resource type that answers the question one join shorter.

- [x] **Step 1: Write the failing test**

Append to `tests/integration/assertOwnership.test.js`:

```js
describe('assertOwnership(calendarDay)', () => {
    test('returns the day row for its owner', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });

        // Act
        const owned = await assertOwnership(conn, 'calendarDay', day.id, ownerId);

        // Assert
        expect(owned.id).toBe(day.id);
        expect(owned.owner_id).toBe(ownerId);
    });

    test('forbids a day belonging to someone else', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId: theirs });

        // Act + Assert
        await expect(assertOwnership(conn, 'calendarDay', day.id, mine)).rejects.toMatchObject({
            status: 403,
        });
    });

    test('reports 404 for a day that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act + Assert
        await expect(
            assertOwnership(conn, 'calendarDay', 999999, ownerId)
        ).rejects.toMatchObject({ status: 404, message: 'Day not found' });
    });
});
```

Add `const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');`
to that file's requires.

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/assertOwnership.test.js`
Expected: FAIL — `Unknown resource type "calendarDay"`.

- [x] **Step 3: Add the resource type**

In `src/middleware/assertOwnership.js`, add to `OWNER_QUERIES`:

```js
    // The one resource that does not hang off a project. The calendar draws from
    // every project at once, so a day belongs to the user directly — which makes
    // this the only query here that needs no join, and the only one whose
    // returned row is the resource itself rather than its project. Callers must
    // not read a project id off it.
    calendarDay: {
        label: 'Day',
        sql: 'SELECT id, owner_id FROM calendar_days WHERE id = ?',
    },
```

Then amend the module's doc comment, which currently claims every question
reduces to a project:

```js
 * Projects have exactly one owner and almost every other resource cascades from
 * a project, so nearly every authorisation question reduces to "does this
 * resource's project belong to this user?". Each such resource below is one join
 * back up to `projects`.
 *
 * `calendarDay` is the exception: the calendar spans an owner's whole
 * collection, so a day hangs off `users` and is checked directly. It returns the
 * day row rather than a project row — callers needing a project id must not use
 * it.
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/assertOwnership.test.js`
Expected: PASS, including the 3 new tests.

- [x] **Step 5: Commit**

```bash
git add src/middleware/assertOwnership.js tests/integration/assertOwnership.test.js
git commit -m "feat(calendar): check ownership of calendar days"
```

---

## Task 6: `assertTodosOwned`

**Files:**
- Create: `src/lib/assertTodosOwned.js`
- Test: `tests/integration/assertTodosOwned.test.js`

The bulk endpoint names many to-dos at once. Calling `assertOwnership` once per
id would be one query per to-do; this is one query for the whole set, following
the shape of the existing `assertSequenceInProject` guard.

- [x] **Step 1: Write the failing test**

Create `tests/integration/assertTodosOwned.test.js`:

```js
'use strict';

const assertTodosOwned = require('../../src/lib/assertTodosOwned');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/** A project with `count` unorganized to-dos, owned by a fresh user. */
const createTodos = async (conn, count) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Auth rewrite' });

    const todos = [];
    for (let index = 0; index < count; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        todos.push(
            await todosRepo.create(conn, { projectId: project.id, text: `Step ${index}` })
        );
    }

    return { ownerId, todos };
};

describe('assertTodosOwned', () => {
    test('passes when every id belongs to the caller', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos } = await createTodos(conn, 3);

        // Act + Assert
        await expect(
            assertTodosOwned(conn, todos.map((todo) => todo.id), ownerId)
        ).resolves.toBeUndefined();
    });

    test('passes trivially for an empty set', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act + Assert
        await expect(assertTodosOwned(conn, [], ownerId)).resolves.toBeUndefined();
    });

    test('forbids a set containing someone else’s to-do', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTodos(conn, 1);
        const theirs = await createTodos(conn, 1);

        // Act + Assert
        await expect(
            assertTodosOwned(conn, [mine.todos[0].id, theirs.todos[0].id], mine.ownerId)
        ).rejects.toMatchObject({ status: 403 });
    });

    test('reports 404 when an id does not exist at all', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos } = await createTodos(conn, 1);

        // Act + Assert
        await expect(
            assertTodosOwned(conn, [todos[0].id, 999999], ownerId)
        ).rejects.toMatchObject({ status: 404 });
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/assertTodosOwned.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/assertTodosOwned'`.

- [x] **Step 3: Write the guard**

Create `src/lib/assertTodosOwned.js`:

```js
'use strict';

const { forbidden, notFound } = require('./httpError');

/**
 * Ownership for a *set* of to-dos, in one query.
 *
 * The calendar's bulk endpoint names every to-do a single gesture moved, which
 * can be a dozen of them. `assertOwnership` answers for one id at a time and
 * would turn that into a dozen round trips through the same join; this asks the
 * question once.
 *
 * A missing id and someone else's id are told apart deliberately: the first is a
 * stale client, the second is an attempt on another user's data, and answering
 * 403 to both would make an honest client's bug look like an attack. The
 * existence check runs first for the same reason `assertOwnership` orders them
 * that way.
 *
 * Resolves to undefined when every id checks out. Never returns rows: callers
 * that want the to-dos read them separately.
 */
const assertTodosOwned = async (conn, todoIds, userId) => {
    const unique = [...new Set(todoIds)];

    if (unique.length === 0) return;

    const placeholders = unique.map(() => '?').join(', ');

    // `query` rather than `execute`: the placeholder count varies per call, and
    // preparing a fresh statement for every distinct arity fills the driver's
    // statement cache for no benefit.
    const [rows] = await conn.query(
        `SELECT t.id, p.owner_id
         FROM todos t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id IN (${placeholders})`,
        unique
    );

    if (rows.length !== unique.length) throw notFound('To-do');

    if (rows.some((row) => row.owner_id !== userId)) throw forbidden();
};

module.exports = assertTodosOwned;
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/assertTodosOwned.test.js`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/assertTodosOwned.js tests/integration/assertTodosOwned.test.js
git commit -m "feat(calendar): add set-wise to-do ownership guard"
```

---

## Task 7: `calendarPlacement` — the pure validator

**Files:**
- Create: `src/lib/calendarPlacement.js`
- Test: `tests/unit/calendarPlacement.test.js`

This is the server's half of design decision 8. It does not recompute the
cascade; it decides whether a layout is *legal*.

- [x] **Step 1: Write the failing test**

Create `tests/unit/calendarPlacement.test.js`:

```js
'use strict';

const { findPlacementProblem, findOverlap } = require('../../src/lib/calendarPlacement');

/** A legal placement, with fields overridable per case. */
const placement = (overrides = {}) => ({
    todoId: 1,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

describe('findPlacementProblem', () => {
    test('accepts a legal set', () => {
        expect(
            findPlacementProblem([
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
                placement({ todoId: 2, startMinutes: 600, durationMinutes: 30 }),
            ])
        ).toBeNull();
    });

    test('accepts an empty set', () => {
        expect(findPlacementProblem([])).toBeNull();
    });

    test('accepts a booking that ends exactly at midnight', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 1380, durationMinutes: 60 })])
        ).toBeNull();
    });

    test('accepts a booking that fills the whole day', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 0, durationMinutes: 1440 })])
        ).toBeNull();
    });

    test('rejects a start off the 30-minute grid', () => {
        expect(findPlacementProblem([placement({ startMinutes: 545 })])).toMatch(
            /startMinutes must be a multiple of 30/
        );
    });

    test('rejects a duration off the 30-minute grid', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 45 })])).toMatch(
            /durationMinutes must be a multiple of 30/
        );
    });

    test('rejects a negative start', () => {
        expect(findPlacementProblem([placement({ startMinutes: -30 })])).toMatch(
            /startMinutes must be 0 or more/
        );
    });

    test('rejects a duration below one slot', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 0 })])).toMatch(
            /durationMinutes must be at least 30/
        );
    });

    test('rejects a duration longer than a day', () => {
        expect(findPlacementProblem([placement({ durationMinutes: 1470 })])).toMatch(
            /durationMinutes must be at most 1440/
        );
    });

    test('rejects a booking that runs past the end of its day', () => {
        expect(
            findPlacementProblem([placement({ startMinutes: 1410, durationMinutes: 60 })])
        ).toMatch(/may not run past the end of its day/);
    });

    test('rejects the same to-do appearing twice', () => {
        expect(
            findPlacementProblem([
                placement({ todoId: 1, dayId: 4, startMinutes: 0 }),
                placement({ todoId: 1, dayId: 5, startMinutes: 0 }),
            ])
        ).toMatch(/appears in more than one placement/);
    });
});

describe('findOverlap', () => {
    test('accepts two bookings that merely touch', () => {
        expect(
            findOverlap([
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
                placement({ todoId: 2, startMinutes: 600, durationMinutes: 30 }),
            ])
        ).toBeNull();
    });

    test('rejects two bookings that overlap in one day', () => {
        expect(
            findOverlap([
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
                placement({ todoId: 2, startMinutes: 570, durationMinutes: 30 }),
            ])
        ).toMatch(/overlap in day 4/);
    });

    test('does not confuse identical times in different days', () => {
        expect(
            findOverlap([
                placement({ todoId: 1, dayId: 4, startMinutes: 540 }),
                placement({ todoId: 2, dayId: 5, startMinutes: 540 }),
            ])
        ).toBeNull();
    });

    test('finds an overlap regardless of the order it is given in', () => {
        expect(
            findOverlap([
                placement({ todoId: 2, startMinutes: 570, durationMinutes: 30 }),
                placement({ todoId: 1, startMinutes: 540, durationMinutes: 60 }),
            ])
        ).toMatch(/overlap in day 4/);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/unit/calendarPlacement.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/calendarPlacement'`.

- [x] **Step 3: Write the validator**

Create `src/lib/calendarPlacement.js`:

```js
'use strict';

/**
 * Whether a set of bookings is a legal calendar (design section 5).
 *
 * The server does not recompute the cascade and does not check that the client's
 * arithmetic followed the push-down rules — that logic lives in the browser,
 * because it has to run on every pointer move to draw the drag ghost (design
 * decision 8). What the server owes the database is narrower and absolute: the
 * layout it stores must be one that could exist. A client that computes badly
 * can produce a schedule the user did not intend; it cannot produce a corrupt
 * one.
 *
 * Pure functions over plain data, so the whole rule set is testable without a
 * connection. Each returns a human-readable message, or null when there is no
 * problem — null meaning "nothing wrong" reads oddly for one call and very well
 * for a chain of them.
 */

const DAY_MINUTES = 1440;
const SLOT_MINUTES = 30;
const MIN_DURATION = 30;

const isSlotAligned = (value) => Number.isInteger(value) && value % SLOT_MINUTES === 0;

const endOf = (item) => item.startMinutes + item.durationMinutes;

/** The arithmetic of one booking, in isolation. */
const validatePlacement = ({ todoId, startMinutes, durationMinutes }) => {
    const at = `(to-do ${todoId})`;

    if (!isSlotAligned(startMinutes)) {
        return `startMinutes must be a multiple of ${SLOT_MINUTES} ${at}`;
    }
    if (!isSlotAligned(durationMinutes)) {
        return `durationMinutes must be a multiple of ${SLOT_MINUTES} ${at}`;
    }
    if (startMinutes < 0) return `startMinutes must be 0 or more ${at}`;
    if (durationMinutes < MIN_DURATION) {
        return `durationMinutes must be at least ${MIN_DURATION} ${at}`;
    }
    if (durationMinutes > DAY_MINUTES) {
        return `durationMinutes must be at most ${DAY_MINUTES} ${at}`;
    }
    if (endOf({ startMinutes, durationMinutes }) > DAY_MINUTES) {
        return `a booking may not run past the end of its day ${at}`;
    }

    return null;
};

/**
 * A to-do named twice.
 *
 * `uq_calendar_items_todo` would enforce this anyway, but silently: the second
 * upsert would overwrite the first and the request would answer 200 having
 * stored half of what it was sent. Catching it here turns that into a 400 that
 * says so.
 */
const findDuplicateTodo = (placements) => {
    const seen = new Set();

    for (const { todoId } of placements) {
        if (seen.has(todoId)) return `to-do ${todoId} appears in more than one placement`;
        seen.add(todoId);
    }

    return null;
};

const groupByDay = (placements) =>
    placements.reduce((byDay, placement) => {
        const bucket = byDay.get(placement.dayId) ?? [];
        byDay.set(placement.dayId, [...bucket, placement]);

        return byDay;
    }, new Map());

/**
 * Two bookings occupying the same minute of the same day.
 *
 * Touching is not overlapping: a booking ending at 10:00 and one starting at
 * 10:00 are exactly what the push-down cascade produces when it squeezes a gap
 * shut, so the comparison is strict.
 */
const findOverlap = (placements) => {
    for (const [dayId, items] of groupByDay(placements)) {
        const ordered = [...items].sort((a, b) => a.startMinutes - b.startMinutes);

        for (let index = 1; index < ordered.length; index += 1) {
            const previous = ordered[index - 1];
            const current = ordered[index];

            if (current.startMinutes < endOf(previous)) {
                return (
                    `to-dos ${previous.todoId} and ${current.todoId} ` +
                    `overlap in day ${dayId}`
                );
            }
        }
    }

    return null;
};

/** The first problem with a resolved placement set, or null. */
const findPlacementProblem = (placements) => {
    const duplicate = findDuplicateTodo(placements);
    if (duplicate) return duplicate;

    for (const placement of placements) {
        const problem = validatePlacement(placement);
        if (problem) return problem;
    }

    return findOverlap(placements);
};

module.exports = {
    DAY_MINUTES,
    MIN_DURATION,
    SLOT_MINUTES,
    findOverlap,
    findPlacementProblem,
    validatePlacement,
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/unit/calendarPlacement.test.js`
Expected: PASS, 15 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/calendarPlacement.js tests/unit/calendarPlacement.test.js
git commit -m "feat(calendar): validate that a placement set is a legal calendar"
```

---

## Task 8: `calendarItemsRepo`

**Files:**
- Create: `src/db/repositories/calendarItemsRepo.js`
- Test: `tests/integration/calendarItemsRepo.test.js`

- [x] **Step 1: Write the failing test**

Create `tests/integration/calendarItemsRepo.test.js`:

```js
'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * An owner with one project, one sequence, `count` to-dos filed in it, and one
 * empty day — the smallest world in which a booking means anything.
 */
const createWorld = async (conn, count = 2) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Auth rewrite' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Groundwork' });
    // `sequencesRepo.create` takes the layer, not the project — it reads the
    // project off the layer itself.
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Session handling',
    });

    const todos = [];
    for (let index = 0; index < count; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        todos.push(
            await todosRepo.create(conn, {
                projectId: project.id,
                text: `Step ${index}`,
                sequenceId: sequence.id,
            })
        );
    }

    const day = await calendarDaysRepo.create(conn, { ownerId });

    return { ownerId, project, sequence, todos, day };
};

describe('calendarItemsRepo.upsert', () => {
    test('books a to-do into a day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);

        // Act
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Assert
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            day_id: day.id,
            todo_id: todos[0].id,
            start_minutes: 540,
            duration_minutes: 60,
        });
    });

    test('moves an existing booking rather than creating a second one', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        const second = await calendarDaysRepo.create(conn, { ownerId });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        await calendarItemsRepo.upsert(conn, {
            dayId: second.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Assert — the unique key on todo_id is what makes this a move
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            day_id: second.id,
            start_minutes: 0,
            duration_minutes: 30,
        });
    });
});

describe('calendarItemsRepo.listByOwner', () => {
    test('carries the to-do, project and sequence a card has to draw', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, project, sequence, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const [item] = await calendarItemsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(item).toMatchObject({
            text: 'Step 0',
            status: 'incomplete',
            project_id: project.id,
            project_title: 'Auth rewrite',
            sequence_id: sequence.id,
            sequence_title: 'Session handling',
        });
    });

    test('keeps a completed to-do’s booking, with its text intact', async () => {
        // Arrange — the failure this guards is invisible until a user ticks
        // something: an item that read itself out of the frontier would go blank.
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        await todosRepo.update(conn, todos[0].id, { status: 'complete' });
        const [item] = await calendarItemsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(item.status).toBe('complete');
        expect(item.text).toBe('Step 0');
        expect(item.sequence_title).toBe('Session handling');
    });

    test('keeps the booking of a to-do returned to the unorganized panel', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act — the LEFT JOIN must not drop the row
        await todosRepo.move(conn, todos[0].id, { sequenceId: null, position: 0 });
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);

        // Assert
        expect(items).toHaveLength(1);
        expect(items[0].sequence_id).toBeNull();
        expect(items[0].sequence_title).toBeNull();
    });

    test('never returns another owner’s bookings', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createWorld(conn);
        const theirs = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: theirs.day.id,
            todoId: theirs.todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const items = await calendarItemsRepo.listByOwner(conn, mine.ownerId);

        // Assert
        expect(items).toEqual([]);
    });
});

describe('calendarItemsRepo.removeByTodoIds', () => {
    test('unschedules the named to-dos and leaves the rest', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[1].id,
            startMinutes: 30,
            durationMinutes: 30,
        });

        // Act
        const removed = await calendarItemsRepo.removeByTodoIds(conn, [todos[0].id]);

        // Assert
        expect(removed).toBe(1);
        const items = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(items.map((item) => item.todo_id)).toEqual([todos[1].id]);
    });

    test('does nothing for an empty list', async () => {
        // Arrange
        const conn = getConn();

        // Act + Assert
        await expect(calendarItemsRepo.removeByTodoIds(conn, [])).resolves.toBe(0);
    });
});

describe('deleting a day', () => {
    test('releases its bookings without deleting the to-dos', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, day } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        await calendarDaysRepo.remove(conn, day.id);

        // Assert
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await todosRepo.findById(conn, todos[0].id)).not.toBeNull();
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarItemsRepo.test.js`
Expected: FAIL — `Cannot find module '../../src/db/repositories/calendarItemsRepo'`.

- [x] **Step 3: Write the repository**

Create `src/db/repositories/calendarItemsRepo.js`:

```js
'use strict';

/**
 * Data access for `calendar_items` — the bookings themselves.
 *
 * Reads here are wider than the table. A day column has to draw a name, tick a
 * bubble and link to a project and a sequence, and it cannot get those from the
 * right-hand pool: a to-do leaves the pool the moment it is completed, which is
 * exactly when its card stays on screen. So every read joins out to `todos`,
 * `projects` and `sequences` and hands the caller a row that can draw itself
 * (design section 5).
 *
 * `sequences` is reached through a LEFT JOIN because `todos.sequence_id` is
 * nullable: a to-do can be booked here and afterwards returned to the
 * unorganized panel on the project page. An INNER JOIN would make that booking
 * vanish from the calendar rather than merely lose its link.
 *
 * There is no `position` on a booking and so no reindexing: a day is ordered by
 * `start_minutes`, which is a real quantity rather than an index.
 */

const SELECT_COLUMNS = `ci.id, ci.day_id, ci.todo_id, ci.start_minutes, ci.duration_minutes,
            ci.created_at, ci.updated_at,
            t.text, t.status, t.project_id, t.sequence_id,
            p.title AS project_title, s.title AS sequence_title`;

const FROM_JOINS = `FROM calendar_items ci
         JOIN calendar_days d  ON d.id = ci.day_id
         JOIN todos t          ON t.id = ci.todo_id
         JOIN projects p       ON p.id = t.project_id
         LEFT JOIN sequences s ON s.id = t.sequence_id`;

/** Every booking in the owner's calendar, days left to right, items top to bottom. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         ${FROM_JOINS}
         WHERE d.owner_id = ?
         ORDER BY d.position, ci.start_minutes, ci.id`,
        [ownerId]
    );

    return rows;
};

/**
 * The bookings in the named days. Used by the bulk endpoint to check the layout
 * it has just written, which must be read back rather than assumed: a day can
 * hold items the request never mentioned.
 */
const listByDayIds = async (conn, dayIds) => {
    if (dayIds.length === 0) return [];

    const placeholders = dayIds.map(() => '?').join(', ');

    // `query` rather than `execute`: the placeholder count varies per call.
    const [rows] = await conn.query(
        `SELECT ${SELECT_COLUMNS}
         ${FROM_JOINS}
         WHERE ci.day_id IN (${placeholders})
         ORDER BY ci.day_id, ci.start_minutes, ci.id`,
        dayIds
    );

    return rows;
};

/**
 * Books a to-do, or moves the booking it already has.
 *
 * One statement covers both because `uq_calendar_items_todo` makes them the same
 * operation: a to-do has at most one booking, so "book this" and "move this"
 * differ only in whether a row exists yet (design decision 4).
 */
const upsert = async (conn, { dayId, todoId, startMinutes, durationMinutes }) => {
    await conn.execute(
        `INSERT INTO calendar_items (day_id, todo_id, start_minutes, duration_minutes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
             day_id = VALUES(day_id),
             start_minutes = VALUES(start_minutes),
             duration_minutes = VALUES(duration_minutes)`,
        [dayId, todoId, startMinutes, durationMinutes]
    );
};

/** Unschedules the named to-dos. Returns how many bookings were released. */
const removeByTodoIds = async (conn, todoIds) => {
    const unique = [...new Set(todoIds)];

    if (unique.length === 0) return 0;

    const placeholders = unique.map(() => '?').join(', ');

    const [result] = await conn.query(
        `DELETE FROM calendar_items WHERE todo_id IN (${placeholders})`,
        unique
    );

    return result.affectedRows;
};

module.exports = { listByDayIds, listByOwner, removeByTodoIds, upsert };
```

- [x] **Step 4: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarItemsRepo.test.js`
Expected: PASS, 9 tests.

- [x] **Step 5: Commit**

```bash
git add src/db/repositories/calendarItemsRepo.js tests/integration/calendarItemsRepo.test.js
git commit -m "feat(calendar): add calendarItemsRepo with self-describing bookings"
```

---

## Task 9: The calendar routes

**Files:**
- Create: `src/routes/calendar.js`
- Modify: `src/server.js`
- Test: `tests/integration/calendarRoutes.test.js`

The largest server task. Build it in two commits: the three simple endpoints
first, then the bulk one.

- [x] **Step 1: Write the failing test for the three simple endpoints**

Create `tests/integration/calendarRoutes.test.js`:

```js
'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const layersRepo = require('../../src/db/repositories/layersRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The calendar half of design section 5. Every request runs on the connection
 * the test opened, so everything the routes write is rolled back afterwards
 * (tests/helpers/db.js).
 *
 * Two properties are asserted over and over: nothing crosses an ownership
 * boundary, and the bulk endpoint is all-or-nothing — a rejected call must leave
 * no day and no booking behind.
 */

/** An owner with a project, a sequence, `todoCount` to-dos, and `dayCount` days. */
const createWorld = async (conn, { todoCount = 3, dayCount = 2 } = {}) => {
    const ownerId = await createTestUser(conn);
    const project = await projectsRepo.create(conn, { ownerId, title: 'Auth rewrite' });
    const layer = await layersRepo.create(conn, { projectId: project.id, title: 'Groundwork' });
    const sequence = await sequencesRepo.create(conn, {
        layerId: layer.id,
        title: 'Session handling',
    });

    const todos = [];
    for (let index = 0; index < todoCount; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        todos.push(
            await todosRepo.create(conn, {
                projectId: project.id,
                text: `Step ${index}`,
                sequenceId: sequence.id,
            })
        );
    }

    const days = [];
    for (let index = 0; index < dayCount; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        days.push(await calendarDaysRepo.create(conn, { ownerId }));
    }

    return { ownerId, project, sequence, todos, days };
};

describe('GET /api/calendar', () => {
    test('returns an empty calendar for a new user', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ days: [], items: [] });
    });

    test('returns days left to right with their bookings', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[1].id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.body.data.days.map((day) => day.position)).toEqual([0, 1]);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0]).toMatchObject({
            dayId: days[1].id,
            todoId: todos[0].id,
            text: 'Step 0',
            projectTitle: 'Auth rewrite',
            sequenceTitle: 'Session handling',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });

    test('never leaks owner_id', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId } = await createWorld(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(JSON.stringify(response.body)).not.toContain('owner');
    });

    test('shows nothing of another owner’s calendar', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        await createWorld(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar')
            .set('Authorization', authHeaderFor(mine));

        // Assert
        expect(response.body.data).toEqual({ days: [], items: [] });
    });

    test('refuses an unauthenticated request', async () => {
        // Act
        const response = await request(app).get('/api/calendar');

        // Assert
        expect(response.status).toBe(401);
    });
});

describe('POST /api/calendar/days', () => {
    test('appends a day at the end and answers 201', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId } = await createWorld(conn, { dayCount: 2 });

        // Act
        const response = await request(app)
            .post('/api/calendar/days')
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data.position).toBe(2);
        expect(response.body.data).not.toHaveProperty('ownerId');
    });
});

describe('DELETE /api/calendar/days/:id', () => {
    test('deletes the day, releases its bookings, and closes the gap', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn, { dayCount: 3 });
        await calendarItemsRepo.upsert(conn, {
            dayId: days[1].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/days/${days[1].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: days[1].id });

        const remaining = await calendarDaysRepo.listByOwner(conn, ownerId);
        expect(remaining.map((day) => [day.id, day.position])).toEqual([
            [days[0].id, 0],
            [days[2].id, 1],
        ]);
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
    });

    test('leaves the to-dos of a deleted day alone', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        await request(app)
            .delete(`/api/calendar/days/${days[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(await todosRepo.findById(conn, todos[0].id)).not.toBeNull();
    });

    test('forbids deleting someone else’s day', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createWorld(conn);

        // Act
        const response = await request(app)
            .delete(`/api/calendar/days/${theirs.days[0].id}`)
            .set('Authorization', authHeaderFor(mine));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarDaysRepo.findById(conn, theirs.days[0].id)).not.toBeNull();
    });

    test('reports 404 for a day that does not exist', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .delete('/api/calendar/days/999999')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarRoutes.test.js`
Expected: FAIL — every request answers 404 with the React shell, because
`/api/calendar` is not mounted.

- [x] **Step 3: Write the router with the three simple endpoints**

Create `src/routes/calendar.js`:

```js
'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const assertTodosOwned = require('../lib/assertTodosOwned');
const calendarDaysRepo = require('../db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../db/repositories/calendarItemsRepo');
const { badRequest, notFound } = require('../lib/httpError');
const { findOverlap, findPlacementProblem } = require('../lib/calendarPlacement');
const { toCalendarDay, toCalendarItem } = require('../lib/serializers');
const { idSchema, parseId } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * The calendar (design section 5). Mounted at `/api/calendar` behind `isAuth`,
 * so `req.user.id` is the owner and every id the caller hands in is checked
 * against them before anything is touched.
 *
 * The calendar hangs off the user rather than off a project, so unlike every
 * other resource router here nothing is addressed by a parent: days are appended
 * to the owner's own strip.
 *
 * The cascade — what a resize pushes down, what spills into tomorrow — is not
 * here. It runs in the browser, because it has to be recomputed on every pointer
 * move to draw the drag ghost (design decision 8). What this file owes the
 * database is that whatever it stores is a *legal* calendar, which is a much
 * narrower promise and the one `lib/calendarPlacement` keeps.
 */

const router = express.Router();

const minutesSchema = z
    .number({ error: 'must be an integer number of minutes' })
    .int('must be an integer number of minutes');

/**
 * A placement names its day one of two ways, never both: `dayId` for a day that
 * exists, `dayIndex` for one this same request is about to create. The index is
 * into the day list *after* the appends, which is what lets a spill that ran out
 * of days be a single atomic request rather than a create followed by a write
 * that might not happen.
 */
const placementSchema = z
    .object({
        todoId: idSchema,
        dayId: idSchema.optional(),
        dayIndex: z
            .number({ error: 'dayIndex must be an integer of 0 or more' })
            .int('dayIndex must be an integer of 0 or more')
            .min(0, 'dayIndex must be an integer of 0 or more')
            .optional(),
        startMinutes: minutesSchema,
        durationMinutes: minutesSchema,
    })
    .refine(
        (placement) => (placement.dayId === undefined) !== (placement.dayIndex === undefined),
        { message: 'a placement must name exactly one of dayId or dayIndex' }
    );

/**
 * `appendDays` is capped at the number of placements because a day is only ever
 * created to receive something. Without the cap a single request could append
 * arbitrarily many empty columns.
 */
const bulkSchema = z
    .object({
        appendDays: z
            .number({ error: 'appendDays must be an integer of 0 or more' })
            .int('appendDays must be an integer of 0 or more')
            .min(0, 'appendDays must be an integer of 0 or more')
            .default(0),
        placements: z.array(placementSchema).default([]),
        unschedule: z.array(idSchema).default([]),
    })
    .refine((body) => body.appendDays <= body.placements.length, {
        message: 'appendDays may not exceed the number of placements',
    });

// The endpoint takes no input — a new day is untitled and goes at the end.
// Parsing an empty shape drops anything else the caller sent rather than letting
// it through unexamined.
const createDaySchema = z.object({});

/** The whole calendar in the shape the page loads: one request, one failure state. */
const readCalendar = async (conn, ownerId) => {
    const days = await calendarDaysRepo.listByOwner(conn, ownerId);
    const items = await calendarItemsRepo.listByOwner(conn, ownerId);

    return { days: days.map(toCalendarDay), items: items.map(toCalendarItem) };
};

// GET /api/calendar — days and bookings together, the way the project graph
// arrives in one piece. Read-only, so it takes a connection rather than a
// transaction.
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const calendar = await withConnection((conn) => readCalendar(conn, req.user.id));

        res.sendData(calendar);
    })
);

// POST /api/calendar/days — appends a day to the end of the owner's strip.
router.post(
    '/days',
    asyncRoute(async (req, res) => {
        createDaySchema.parse(req.body ?? {});

        const day = await withTransaction((conn) =>
            calendarDaysRepo.create(conn, { ownerId: req.user.id })
        );

        res.sendData(toCalendarDay(day), 201);
    })
);

// DELETE /api/calendar/days/:id — the day goes and its bookings are released.
// The to-dos behind them are untouched: the container goes, the work does not
// (design decision 6). That release is the schema's ON DELETE CASCADE, not code
// here.
router.delete(
    '/days/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'calendarDay', id, req.user.id);

            return calendarDaysRepo.remove(conn, id);
        });

        if (!deleted) throw notFound('Day');

        res.sendData({ id });
    })
);

module.exports = router;
```

- [x] **Step 4: Mount the router**

In `src/server.js`, add the require beside the others:

```js
const calendarRoutes = require('./routes/calendar');
```

and the mount with the other resource routes — it must stay **above** the
`app.get('*')` catch-all, which answers every unmatched GET with the React
shell and would otherwise swallow it:

```js
app.use('/api/calendar', isAuth, respond, calendarRoutes);
```

- [x] **Step 5: Run it and watch it pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarRoutes.test.js`
Expected: PASS, 11 tests.

- [x] **Step 6: Commit**

```bash
git add src/routes/calendar.js src/server.js tests/integration/calendarRoutes.test.js
git commit -m "feat(calendar): add read, append-day and delete-day endpoints"
```

- [x] **Step 7: Write the failing tests for the bulk endpoint**

Append to `tests/integration/calendarRoutes.test.js`:

```js
describe('PUT /api/calendar/items', () => {
    test('books to-dos into an existing day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                placements: [
                    { todoId: todos[0].id, dayId: days[0].id, startMinutes: 540, durationMinutes: 60 },
                    { todoId: todos[1].id, dayId: days[0].id, startMinutes: 600, durationMinutes: 30 },
                ],
            });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(2);
        expect(response.body.data.items.map((item) => item.startMinutes)).toEqual([540, 600]);
    });

    test('creates the days a spill needed and resolves dayIndex against them', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn, { dayCount: 1 });

        // Act — one item stays in day 0, one lands in the day this call creates
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                appendDays: 1,
                placements: [
                    { todoId: todos[0].id, dayId: days[0].id, startMinutes: 1380, durationMinutes: 60 },
                    { todoId: todos[1].id, dayIndex: 1, startMinutes: 0, durationMinutes: 60 },
                ],
            });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.days).toHaveLength(2);

        const created = response.body.data.days[1];
        const spilled = response.body.data.items.find((item) => item.todoId === todos[1].id);
        expect(spilled.dayId).toBe(created.id);
        expect(spilled.startMinutes).toBe(0);
    });

    test('moves an existing booking rather than duplicating it', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                placements: [
                    { todoId: todos[0].id, dayId: days[1].id, startMinutes: 0, durationMinutes: 30 },
                ],
            });

        // Assert
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0]).toMatchObject({
            dayId: days[1].id,
            startMinutes: 0,
            durationMinutes: 30,
        });
    });

    test('unschedules in the same call that places', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({
                unschedule: [todos[0].id],
                placements: [
                    { todoId: todos[1].id, dayId: days[0].id, startMinutes: 0, durationMinutes: 60 },
                ],
            });

        // Assert
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0].todoId).toBe(todos[1].id);
    });

    test('accepts an empty request as a no-op', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId } = await createWorld(conn);

        // Act
        const response = await request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });
});

describe('PUT /api/calendar/items — refusals', () => {
    /** Sends one bulk body and returns the response. */
    const put = (ownerId, body) =>
        request(app)
            .put('/api/calendar/items')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body);

    test('refuses a start off the 30-minute grid', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 545, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/multiple of 30/);
    });

    test('refuses a duration below one slot', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 0, durationMinutes: 0 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/at least 30/);
    });

    test('refuses a booking running past the end of its day', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 1410, durationMinutes: 60 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/past the end of its day/);
    });

    test('refuses two placements that overlap', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 540, durationMinutes: 60 },
                { todoId: todos[1].id, dayId: days[0].id, startMinutes: 570, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/overlap/);
    });

    test('refuses a placement landing on a booking the request never mentioned', async () => {
        // Arrange — the payload alone looks legal; only the stored day is wrong
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[2].id,
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 570, durationMinutes: 30 },
            ],
        });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/overlap/);
        const stored = await calendarItemsRepo.listByOwner(conn, ownerId);
        expect(stored.map((item) => item.todo_id)).toEqual([todos[2].id]);
    });

    test('refuses a placement naming both dayId and dayIndex', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                {
                    todoId: todos[0].id,
                    dayId: days[0].id,
                    dayIndex: 0,
                    startMinutes: 0,
                    durationMinutes: 30,
                },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/exactly one of dayId or dayIndex/);
    });

    test('refuses more appended days than there are placements', async () => {
        const conn = getConn();
        const { ownerId } = await createWorld(conn);

        const response = await put(ownerId, { appendDays: 3, placements: [] });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/appendDays may not exceed/);
    });

    test('refuses a dayIndex beyond the end of the calendar', async () => {
        const conn = getConn();
        const { ownerId, todos } = await createWorld(conn, { dayCount: 1 });

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayIndex: 9, startMinutes: 0, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/beyond the end of the calendar/);
    });

    test('refuses the same to-do placed twice', async () => {
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);

        const response = await put(ownerId, {
            placements: [
                { todoId: todos[0].id, dayId: days[0].id, startMinutes: 0, durationMinutes: 30 },
                { todoId: todos[0].id, dayId: days[1].id, startMinutes: 0, durationMinutes: 30 },
            ],
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/more than one placement/);
    });

    test('forbids booking someone else’s to-do', async () => {
        const conn = getConn();
        const mine = await createWorld(conn);
        const theirs = await createWorld(conn);

        const response = await put(mine.ownerId, {
            placements: [
                {
                    todoId: theirs.todos[0].id,
                    dayId: mine.days[0].id,
                    startMinutes: 0,
                    durationMinutes: 30,
                },
            ],
        });

        expect(response.status).toBe(403);
    });

    test('forbids booking into someone else’s day', async () => {
        const conn = getConn();
        const mine = await createWorld(conn);
        const theirs = await createWorld(conn);

        const response = await put(mine.ownerId, {
            placements: [
                {
                    todoId: mine.todos[0].id,
                    dayId: theirs.days[0].id,
                    startMinutes: 0,
                    durationMinutes: 30,
                },
            ],
        });

        expect(response.status).toBe(403);
    });

    test('leaves no day behind when the call is rejected', async () => {
        // Arrange — this is the atomicity guarantee the whole endpoint exists for
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn, { dayCount: 1 });

        // Act — the append is legal, the placement is not
        const response = await put(ownerId, {
            appendDays: 1,
            placements: [
                { todoId: todos[0].id, dayIndex: 1, startMinutes: 545, durationMinutes: 60 },
            ],
        });

        // Assert
        expect(response.status).toBe(400);
        const remaining = await calendarDaysRepo.listByOwner(conn, ownerId);
        expect(remaining.map((day) => day.id)).toEqual([days[0].id]);
    });
});

describe('DELETE /api/calendar/items/:todoId', () => {
    test('unschedules the booking and leaves the to-do', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos, days } = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: days[0].id,
            todoId: todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/items/${todos[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ todoId: todos[0].id });
        expect(await calendarItemsRepo.listByOwner(conn, ownerId)).toEqual([]);
        expect(await todosRepo.findById(conn, todos[0].id)).not.toBeNull();
    });

    test('reports 404 when the to-do is not booked', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, todos } = await createWorld(conn);

        // Act
        const response = await request(app)
            .delete(`/api/calendar/items/${todos[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(404);
    });

    test('forbids unscheduling someone else’s booking', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createTestUser(conn);
        const theirs = await createWorld(conn);
        await calendarItemsRepo.upsert(conn, {
            dayId: theirs.days[0].id,
            todoId: theirs.todos[0].id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/items/${theirs.todos[0].id}`)
            .set('Authorization', authHeaderFor(mine));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarItemsRepo.listByOwner(conn, theirs.ownerId)).toHaveLength(1);
    });
});
```

- [x] **Step 8: Run them and watch them fail**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarRoutes.test.js`
Expected: FAIL — the `PUT /items` and `DELETE /items/:todoId` requests answer
404, the other 11 still pass.

- [x] **Step 9: Add the bulk and unschedule endpoints**

In `src/routes/calendar.js`, add these above `module.exports`:

```js
/**
 * A stored row in the shape the validator reads. The overlap check runs on what
 * the database now holds rather than on what the request carried, so the two
 * shapes have to meet somewhere.
 */
const toPlacement = (row) => ({
    todoId: row.todo_id,
    dayId: row.day_id,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
});

/** Turns a `dayIndex` into a real day id, now that the appends have happened. */
const resolveDay = ({ todoId, dayId, dayIndex, startMinutes, durationMinutes }, days) => {
    if (dayId !== undefined) return { todoId, dayId, startMinutes, durationMinutes };

    const day = days[dayIndex];

    if (!day) throw badRequest(`dayIndex ${dayIndex} is beyond the end of the calendar`);

    return { todoId, dayId: day.id, startMinutes, durationMinutes };
};

// PUT /api/calendar/items — the settled result of one gesture, applied at once.
//
// A single drag can move a dozen bookings across three days and create a day
// that did not exist. Sent as separate requests that could half-apply, leaving a
// stray empty column or a schedule the user never asked for; one transaction
// cannot.
router.put(
    '/items',
    asyncRoute(async (req, res) => {
        const { appendDays, placements, unschedule } = bulkSchema.parse(req.body ?? {});
        const ownerId = req.user.id;

        const calendar = await withTransaction(async (conn) => {
            await assertTodosOwned(
                conn,
                [...placements.map((placement) => placement.todoId), ...unschedule],
                ownerId
            );

            for (const placement of placements) {
                if (placement.dayId === undefined) continue;

                // Sequential: one mysql2 connection runs one statement at a time.
                // eslint-disable-next-line no-await-in-loop
                await assertOwnership(conn, 'calendarDay', placement.dayId, ownerId);
            }

            for (let index = 0; index < appendDays; index += 1) {
                // eslint-disable-next-line no-await-in-loop
                await calendarDaysRepo.create(conn, { ownerId });
            }

            const days = await calendarDaysRepo.listByOwner(conn, ownerId);
            const resolved = placements.map((placement) => resolveDay(placement, days));

            const problem = findPlacementProblem(resolved);
            if (problem) throw badRequest(problem);

            await calendarItemsRepo.removeByTodoIds(conn, unschedule);

            for (const placement of resolved) {
                // eslint-disable-next-line no-await-in-loop
                await calendarItemsRepo.upsert(conn, placement);
            }

            // The overlap check that counts runs on what is now stored, not on
            // what was sent. A day can hold bookings this request never mentioned
            // — everything the gesture did not move — and an item dropped on top
            // of one of those would sail through a check that only read the
            // payload. Throwing here rolls the whole call back, appended days
            // included.
            const affectedDayIds = [...new Set(resolved.map((placement) => placement.dayId))];
            const stored = await calendarItemsRepo.listByDayIds(conn, affectedDayIds);

            const overlap = findOverlap(stored.map(toPlacement));
            if (overlap) throw badRequest(overlap);

            return readCalendar(conn, ownerId);
        });

        res.sendData(calendar);
    })
);

// DELETE /api/calendar/items/:todoId — dragging a booking back to the pool.
// Addressed by to-do rather than by booking id because that is what the client
// holds: a to-do has at most one booking, so the two are interchangeable, and
// the to-do id is the one the pool already knows.
router.delete(
    '/items/:todoId',
    asyncRoute(async (req, res) => {
        const todoId = parseId(req.params.todoId);

        const released = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'todo', todoId, req.user.id);

            return calendarItemsRepo.removeByTodoIds(conn, [todoId]);
        });

        if (released === 0) throw notFound('Booking');

        res.sendData({ todoId });
    })
);
```

- [x] **Step 10: Run them and watch them pass**

Run: `DB_NAME=planapp_test npx jest tests/integration/calendarRoutes.test.js`
Expected: PASS, 29 tests.

- [x] **Step 11: Run the whole server suite**

Run: `DB_NAME=planapp_test npm test`
Expected: PASS. Nothing in the existing suite should have moved.

- [x] **Step 12: Commit**

```bash
git add src/routes/calendar.js tests/integration/calendarRoutes.test.js
git commit -m "feat(calendar): add atomic bulk placement and unschedule endpoints"
```

**Phase A is complete.** The API is usable end to end with `curl`; nothing in the
browser has changed yet.

---

# Phase B — The cascade

This phase is pure functions and their tests. Nothing renders. It is where the
feature's difficulty lives, so it is built before any of the UI that depends on
it, and it can be built in parallel with Phase A.

## Task 10: Extract the temp-id generator

**Files:**
- Create: `src/client/src/lib/tempIds.js`
- Modify: `src/client/src/state/projectActions.js`
- Test: `src/client/src/lib/tempIds.test.js`

The calendar needs optimistic negative ids for the same reason the project graph
does — a day created by a spill exists on screen before the server has one — and
`projectActions.js` already has the generator. Move it somewhere both can reach
rather than writing a second counter.

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/tempIds.test.js`:

```js
import { createTempId, isTempId } from './tempIds';

describe('tempIds', () => {
    test('hands out a fresh negative id each time', () => {
        // Arrange + Act
        const first = createTempId();
        const second = createTempId();

        // Assert
        expect(first).toBeLessThan(0);
        expect(second).toBeLessThan(first);
    });

    test('recognises its own ids and rejects server ids', () => {
        // Arrange + Act + Assert
        expect(isTempId(createTempId())).toBe(true);
        expect(isTempId(1)).toBe(false);
        expect(isTempId(999999)).toBe(false);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=tempIds`
Expected: FAIL — `Cannot find module './tempIds'`.

- [x] **Step 3: Create the module**

Create `src/client/src/lib/tempIds.js`:

```js
// Ids for entities that exist optimistically but not yet on the server.
//
// They are negative because MySQL auto-increment ids never are, so an
// unreconciled entity can never be confused with a stored one — and a stale
// reference to one is a lookup miss rather than a wrong row.
//
// One counter for the whole app rather than one per page. Two pages never share
// a state tree, so a per-page counter would be correct too; a single source is
// simply the one that makes "is this id real?" answerable without knowing which
// page is asking. The calendar needs exactly that: a day created by an overflow
// is drawn immediately and only afterwards told apart from a stored one, when
// the request that saves it has to name it by index rather than by id.

let lastTempId = 0;

export const createTempId = () => {
    lastTempId -= 1;

    return lastTempId;
};

export const isTempId = (id) => id < 0;
```

- [x] **Step 4: Point `projectActions` at it**

In `src/client/src/state/projectActions.js`, delete the `lastTempId` variable and
both function definitions, and replace them with an import and a re-export so
every existing caller keeps working unchanged:

```js
import { PROJECT_ACTIONS } from './projectReducer';
import { createTempId, isTempId } from '../lib/tempIds';

// Re-exported rather than redefined: these moved to `lib/tempIds` when the
// calendar needed them too, and every existing caller imports them from here.
export { createTempId, isTempId };
```

- [x] **Step 5: Run the client suite**

Run: `npm run test:client`
Expected: PASS. Nothing should have moved — this is a pure relocation, and the
existing `projectActions` consumers prove it.

- [x] **Step 6: Commit**

```bash
git add src/client/src/lib/tempIds.js src/client/src/lib/tempIds.test.js src/client/src/state/projectActions.js
git commit -m "refactor: extract temp-id generator for reuse by the calendar"
```

---

## Task 11: `schedule.js` — constants and `settleDay`

**Files:**
- Create: `src/client/src/lib/schedule.js`
- Test: `src/client/src/lib/schedule.settle.test.js`

The single fold that implements the whole push-down rule.

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/schedule.settle.test.js`:

```js
import { DAY_MINUTES, DEFAULT_DURATION, MIN_DURATION, SLOT_MINUTES, settleDay } from './schedule';

/** A booking. Times in minutes from midnight. */
const item = (todoId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId: 1,
    startMinutes,
    durationMinutes,
});

/** The settled day as `[todoId, start, duration]` triples, top to bottom. */
const layout = (items) =>
    items.map((entry) => [entry.todoId, entry.startMinutes, entry.durationMinutes]);

describe('schedule constants', () => {
    test('a day is 24 hours on a 30-minute grid', () => {
        expect(DAY_MINUTES).toBe(1440);
        expect(SLOT_MINUTES).toBe(30);
        expect(MIN_DURATION).toBe(30);
        expect(DEFAULT_DURATION).toBe(60);
    });
});

describe('settleDay', () => {
    test('leaves a day whose items already fit exactly as it found it', () => {
        // Arrange
        const items = [item(1, 540), item(2, 600), item(3, 720)];

        // Act
        const settled = settleDay(items);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 60],
            [2, 600, 60],
            [3, 720, 60],
        ]);
    });

    test('never mutates the items it is given', () => {
        // Arrange
        const items = [item(1, 540, 120), item(2, 570)];
        const before = JSON.parse(JSON.stringify(items));

        // Act
        settleDay(items, [1]);

        // Assert
        expect(items).toEqual(before);
    });

    test('sorts a day given out of order', () => {
        // Arrange
        const items = [item(3, 720), item(1, 540), item(2, 600)];

        // Act + Assert
        expect(layout(settleDay(items)).map((entry) => entry[0])).toEqual([1, 2, 3]);
    });

    test('squeezes the gap below a grown item before pushing anything', () => {
        // Arrange — 09:00 grows to 2h; the next item sits at 11:00 with an hour
        // of slack above it, so it should not move at all.
        const items = [item(1, 540, 120), item(2, 660)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('pushes the item below once the gap is used up', () => {
        // Arrange — 09:00 grows to 2h and 09:30 is only half an hour below it
        const items = [item(1, 540, 120), item(2, 570)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('pushes a whole touching stack, all of it', () => {
        // Arrange
        const items = [item(1, 540, 120), item(2, 600), item(3, 660), item(4, 720)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
            [3, 720, 60],
            [4, 780, 60],
        ]);
    });

    test('absorbs a gap partway down the stack instead of pushing past it', () => {
        // Arrange — the push runs out of force at the gap before item 3
        const items = [item(1, 540, 90), item(2, 600), item(3, 720)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 90],
            [2, 630, 60],
            [3, 720, 60],
        ]);
    });

    test('leaves a gap when an item shrinks and pulls nothing up', () => {
        // Arrange — decision 7: the push is destructive and downward only
        const items = [item(1, 540, 30), item(2, 660), item(3, 720)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 30],
            [2, 660, 60],
            [3, 720, 60],
        ]);
    });

    test('never moves an item above the anchor', () => {
        // Arrange
        const items = [item(1, 0), item(2, 540, 120), item(3, 600)];

        // Act
        const settled = settleDay(items, [2]);

        // Assert — item 1 is untouched; only what is below the anchor moves
        expect(layout(settled)).toEqual([
            [1, 0, 60],
            [2, 540, 120],
            [3, 660, 60],
        ]);
    });

    test('puts the anchor above an item it was dropped exactly on top of', () => {
        // Arrange — this is what makes "drop between two items" work
        const items = [item(2, 600), item(1, 600)];

        // Act
        const settled = settleDay(items, [1]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 600, 60],
            [2, 660, 60],
        ]);
    });

    test('slides the anchor down when the item above overlaps it', () => {
        // Arrange — dropped at 09:30 under a two-hour 09:00 booking
        const items = [item(1, 540, 120), item(2, 570)];

        // Act
        const settled = settleDay(items, [2]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('treats multiple anchors as one group at the top', () => {
        // Arrange — the shape a spill hands the next day
        const items = [item(9, 0), item(1, 0), item(2, 60)];

        // Act
        const settled = settleDay(items, [1, 2]);

        // Assert
        expect(layout(settled)).toEqual([
            [1, 0, 60],
            [2, 60, 60],
            [9, 120, 60],
        ]);
    });

    test('handles an empty day', () => {
        expect(settleDay([])).toEqual([]);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=schedule.settle`
Expected: FAIL — `Cannot find module './schedule'`.

- [x] **Step 3: Write the constants and `settleDay`**

Create `src/client/src/lib/schedule.js`:

```js
// What a day looks like after a gesture (design section 6).
//
// Pure functions over plain data: no React, no DOM, no measurement. That is not
// tidiness, it is what makes the hardest logic in the feature testable at all —
// jsdom cannot provide the layout a rendered calendar would need, and this has
// to be exercised across dozens of cases.
//
// The same division `lib/dragDrop.js` already makes on the project page: the
// drag library answers "where did the pointer land", and everything after that
// is arithmetic that lives here.
//
// The cascade runs on the client rather than the server because it has to be
// recomputed on every pointer move to draw the drag ghost (design decision 8).
// The server does not repeat it; it checks that the layout it is handed is legal.
//
// State is `{ days: [{ id, position, ... }], items: [{ todoId, dayId,
// startMinutes, durationMinutes, ... }] }`. Days are ordered left to right.
// Items carry whatever display fields the caller put on them — this file only
// ever reads the four scheduling fields and copies the rest across untouched.

import { createTempId } from './tempIds';

/** A day is 00:00 to 24:00. Not a date: an ordered container (design decision 2). */
export const DAY_MINUTES = 1440;

/** The grid, and therefore the snap. */
export const SLOT_MINUTES = 30;

/** One slot. Nothing can be shorter and still carry a readable label. */
export const MIN_DURATION = 30;

/**
 * A full day. This is what guarantees the spill terminates: an item that has
 * been rebased to 00:00 always fits in an empty day, so every pass places at
 * least one item for good.
 */
export const MAX_DURATION = DAY_MINUTES;

/** What a drop from the pool books, before any resizing. */
export const DEFAULT_DURATION = 60;

const endOf = (item) => item.startMinutes + item.durationMinutes;

/**
 * Display order within a day: by start time, with two rules for the anchors.
 *
 * *Anchors win a tie.* Releasing exactly on an existing item's start puts the
 * anchor above it, and the fold below then pushes that item down. Without this
 * the drop would land *under* the item the pointer was over, which is the
 * opposite of what the gesture looked like.
 *
 * *Anchors sort as one block.* Every anchor is keyed by the group's earliest
 * start rather than its own, so a group stays together instead of the day's own
 * items interleaving with it. This is what a spill needs: the overflow arrives
 * rebased to 00:00 and must land on top of the receiving day as a unit. Keying
 * each anchor by its own start would let an existing item at 00:00 slot into the
 * middle of the arriving group — see the multi-anchor case in the tests.
 *
 * Ordering only. Neither rule moves anything; the fold below does that.
 */
const orderFor = (items, anchors) => {
    const anchorStarts = items
        .filter((item) => anchors.has(item.todoId))
        .map((item) => item.startMinutes);

    const groupStart = anchorStarts.length > 0 ? Math.min(...anchorStarts) : 0;

    const keyOf = (item) => (anchors.has(item.todoId) ? groupStart : item.startMinutes);

    return [...items].sort((a, b) => {
        if (keyOf(a) !== keyOf(b)) return keyOf(a) - keyOf(b);

        const aIsAnchor = anchors.has(a.todoId);
        const bIsAnchor = anchors.has(b.todoId);

        if (aIsAnchor !== bIsAnchor) return aIsAnchor ? -1 : 1;

        return a.startMinutes - b.startMinutes;
    });
};

/**
 * One day, resolved so nothing overlaps — the whole push-down rule, in a fold.
 *
 * `start = max(start, cursor)` is the entire behaviour. Because a start is only
 * ever raised and never lowered, a gap survives when the item above still fits
 * above it, and is squeezed exactly when the item above grows into it — after
 * which the stack pushes. Nothing above the anchor can move, because nothing
 * above it is ever raised past its own start.
 *
 * `anchorTodoIds` is what the gesture is acting on: one id for a drag or a
 * resize, a whole group for the items a spill has just carried in from the day
 * above. It affects ordering only, never position.
 *
 * Returns a new array, ordered top to bottom. Items whose start did not change
 * are passed through by reference, so a settle that moves nothing allocates
 * nothing.
 */
export const settleDay = (items, anchorTodoIds = []) => {
    const anchors = new Set([].concat(anchorTodoIds));

    let cursor = 0;

    return orderFor(items, anchors).map((item) => {
        const startMinutes = Math.max(item.startMinutes, cursor);
        cursor = startMinutes + item.durationMinutes;

        return startMinutes === item.startMinutes ? item : { ...item, startMinutes };
    });
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=schedule.settle`
Expected: PASS, 14 tests.

- [x] **Step 5: Commit**

```bash
git add src/client/src/lib/schedule.js src/client/src/lib/schedule.settle.test.js
git commit -m "feat(calendar): add the downward-only push-down fold"
```

---

## Task 12: `schedule.js` — the spill

**Files:**
- Modify: `src/client/src/lib/schedule.js`
- Test: `src/client/src/lib/schedule.spill.test.js`

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/schedule.spill.test.js`:

```js
import { isTempId } from './tempIds';
import { spillFrom } from './schedule';

/** A calendar of `count` empty days, ids 1..count. */
const days = (count) =>
    Array.from({ length: count }, (unused, index) => ({
        id: index + 1,
        position: index,
        createdAt: '2026-09-09T08:00:00.000Z',
    }));

const item = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

/** One day's layout as `[todoId, start, duration]` triples, top to bottom. */
const dayLayout = (state, dayId) =>
    state.items
        .filter((entry) => entry.dayId === dayId)
        .sort((a, b) => a.startMinutes - b.startMinutes)
        .map((entry) => [entry.todoId, entry.startMinutes, entry.durationMinutes]);

describe('spillFrom', () => {
    test('leaves a day that fits alone', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 60],
            [2, 600, 60],
        ]);
        expect(dayLayout(next, 2)).toEqual([]);
        expect(next.days).toHaveLength(2);
    });

    test('does not spill an item ending exactly at midnight', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 1380, 60)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 1380, 60]]);
        expect(dayLayout(next, 2)).toEqual([]);
    });

    test('spills an item one slot past midnight whole, not split', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 1410, 60)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert — the item leaves day 1 entirely and starts day 2 at 00:00
        expect(dayLayout(next, 1)).toEqual([]);
        expect(dayLayout(next, 2)).toEqual([[1, 0, 60]]);
    });

    test('spills only the tail that does not fit', () => {
        // Arrange
        const state = {
            days: days(2),
            items: [item(1, 1, 1260), item(2, 1, 1320), item(3, 1, 1380, 120)],
        };

        // Act
        const next = spillFrom(state, 1, [3]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 1260, 60],
            [2, 1320, 60],
        ]);
        expect(dayLayout(next, 2)).toEqual([[3, 0, 120]]);
    });

    test('spills a whole group to the top of the next day', () => {
        // Arrange — item 1 grows to fill the end of the day, so 2 and 3 are both
        // pushed past midnight and must travel together.
        //
        // They arrive touching, and that is not an accident of this fixture: the
        // push makes each spilled item start exactly where the one above it ends,
        // so a spilled tail is always contiguous below its first member.
        const state = {
            days: days(2),
            items: [item(1, 1, 1320, 120), item(2, 1, 1380), item(3, 1, 1410)],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 1320, 120]]);
        expect(dayLayout(next, 2)).toEqual([
            [2, 0, 60],
            [3, 60, 60],
        ]);
    });

    test('pushes the receiving day’s own items down', () => {
        // Arrange
        const state = {
            days: days(2),
            items: [item(1, 1, 1410, 60), item(2, 2, 0), item(3, 2, 60)],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert — the arrival takes 00:00 and everything already there moves
        expect(dayLayout(next, 2)).toEqual([
            [1, 0, 60],
            [2, 60, 60],
            [3, 120, 60],
        ]);
    });

    test('appends a day when there is nowhere left to spill', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 1410, 60)] };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(next.days).toHaveLength(2);
        expect(isTempId(next.days[1].id)).toBe(true);
        expect(next.days[1].position).toBe(1);
        expect(dayLayout(next, next.days[1].id)).toEqual([[1, 0, 60]]);
    });

    test('cascades across three days, creating what it needs', () => {
        // Arrange — day 1 is filled edge to edge, and the two items below it are
        // long enough that day 2 cannot hold both either. Two *full-day* items
        // are what genuinely forces a third day; a pair of one-hour ones would
        // both fit in day 2 and only two days would be created.
        const state = {
            days: days(1),
            items: [item(1, 1, 0, 1440), item(2, 1, 60, 1440), item(3, 1, 120, 60)],
        };

        // Act
        const next = spillFrom(state, 1, [1]);

        // Assert
        expect(next.days).toHaveLength(3);
        expect(dayLayout(next, next.days[0].id)).toEqual([[1, 0, 1440]]);
        expect(dayLayout(next, next.days[1].id)).toEqual([[2, 0, 1440]]);
        expect(dayLayout(next, next.days[2].id)).toEqual([[3, 0, 60]]);
    });

    test('never mutates the state it is given', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 1410, 60)] };
        const before = JSON.parse(JSON.stringify(state));

        // Act
        spillFrom(state, 1, [1]);

        // Assert
        expect(state).toEqual(before);
    });

    test('throws for a day that is not in the calendar', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => spillFrom(state, 99, [])).toThrow('No day with id 99 to settle');
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=schedule.spill`
Expected: FAIL — `spillFrom is not a function`.

- [x] **Step 3: Write the spill**

Append to `src/client/src/lib/schedule.js`, after `settleDay`:

```js
/**
 * Splits a settled day into what stays and what has been pushed past midnight.
 *
 * The overflow is always a contiguous tail, which is why a single index is
 * enough: the list is ordered and non-overlapping, so if one item ends past
 * 24:00 then every item after it starts past 24:00 too.
 */
const partitionOverflow = (settled) => {
    const index = settled.findIndex((item) => endOf(item) > DAY_MINUTES);

    if (index === -1) return { keep: settled, overflow: [] };

    return { keep: settled.slice(0, index), overflow: settled.slice(index) };
};

/**
 * Slides a group so its first item starts at 00:00, preserving the spacing
 * between its members.
 *
 * In practice a spilled group is always contiguous — the push sets each item's
 * start to the previous item's end — so the offset arithmetic is uniform rather
 * than gap-preserving in any interesting way. It is written as a shift of the
 * whole group anyway, because that is the honest description of the operation
 * and it does not depend on the caller having settled first.
 */
const rebaseToTop = (group) => {
    const offset = group[0].startMinutes;

    return group.map((item) => ({ ...item, startMinutes: item.startMinutes - offset }));
};

/**
 * A day that does not exist on the server yet. Negative id, like every other
 * optimistic row in this app; `createdAt` is stamped now so the column header
 * has something to show before the save lands.
 */
const newDay = (position) => ({
    id: createTempId(),
    position,
    createdAt: new Date().toISOString(),
});

/**
 * Settles one day and carries whatever no longer fits into the next, over and
 * over until everything has a home — appending days when it runs out.
 *
 * An item is never split across a midnight boundary. It moves whole, which is
 * why the overflow group arrives at the top of the next day and pushes that
 * day's contents down rather than weaving into them.
 *
 * This terminates. Each pass places at least one item for good: the first
 * overflowing item is rebased to 00:00, and `MAX_DURATION` is a full day, so it
 * always fits wherever it lands. With a finite number of items there is a finite
 * number of passes, and the days appended are bounded by the items moved.
 *
 * Returns a new `{ days, items }`; the input is untouched.
 */
export const spillFrom = (state, dayId, anchorTodoIds = []) => {
    let days = state.days;
    let items = state.items;
    let index = days.findIndex((day) => day.id === dayId);
    let anchors = [].concat(anchorTodoIds);

    if (index === -1) throw new Error(`No day with id ${dayId} to settle`);

    for (;;) {
        const day = days[index];
        const settled = settleDay(
            items.filter((item) => item.dayId === day.id),
            anchors
        );
        const { keep, overflow } = partitionOverflow(settled);

        items = [...items.filter((item) => item.dayId !== day.id), ...keep];

        if (overflow.length === 0) return { ...state, days, items };

        if (index === days.length - 1) days = [...days, newDay(days.length)];

        const next = days[index + 1];
        const moved = rebaseToTop(overflow).map((item) => ({ ...item, dayId: next.id }));

        items = [...items, ...moved];
        anchors = moved.map((item) => item.todoId);
        index += 1;
    }
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=schedule.spill`
Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add src/client/src/lib/schedule.js src/client/src/lib/schedule.spill.test.js
git commit -m "feat(calendar): spill overflowing bookings into the next day"
```

---

## Task 13: `schedule.js` — the four gestures

**Files:**
- Modify: `src/client/src/lib/schedule.js`
- Test: `src/client/src/lib/schedule.gestures.test.js`

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/schedule.gestures.test.js`:

```js
import {
    DEFAULT_DURATION,
    moveItem,
    placeFromPool,
    resizeItem,
    topEdgeFloor,
    unscheduleItem,
} from './schedule';

const days = (count) =>
    Array.from({ length: count }, (unused, index) => ({
        id: index + 1,
        position: index,
        createdAt: '2026-09-09T08:00:00.000Z',
    }));

const item = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

const dayLayout = (state, dayId) =>
    state.items
        .filter((entry) => entry.dayId === dayId)
        .sort((a, b) => a.startMinutes - b.startMinutes)
        .map((entry) => [entry.todoId, entry.startMinutes, entry.durationMinutes]);

describe('placeFromPool', () => {
    test('books an hour by default and carries the display fields across', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, {
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            text: 'Wire up the token refresh',
            projectId: 2,
            sequenceId: 9,
        });

        // Assert
        expect(next.items).toHaveLength(1);
        expect(next.items[0]).toMatchObject({
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            durationMinutes: DEFAULT_DURATION,
            text: 'Wire up the token refresh',
            projectId: 2,
            sequenceId: 9,
        });
    });

    test('pushes what it lands on down', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540)] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 540 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [7, 540, 60],
            [1, 600, 60],
        ]);
    });

    test('spills straight into a new day when dropped at the very bottom', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act
        const next = placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 1410 });

        // Assert
        expect(next.days).toHaveLength(2);
        expect(dayLayout(next, 1)).toEqual([]);
        expect(dayLayout(next, next.days[1].id)).toEqual([[7, 0, 60]]);
    });

    test('refuses to book a to-do that already has a booking', () => {
        // Arrange
        const state = { days: days(1), items: [item(7, 1, 540)] };

        // Act + Assert
        expect(() => placeFromPool(state, { todoId: 7, dayId: 1, startMinutes: 0 })).toThrow(
            'To-do 7 is already booked'
        );
    });
});

describe('moveItem', () => {
    test('reorders within a day, pushing what it lands on', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = moveItem(state, { todoId: 2, dayId: 1, startMinutes: 540 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [2, 540, 60],
            [1, 600, 60],
        ]);
    });

    test('moves to another day and leaves the source day’s gap alone', () => {
        // Arrange — decision 7, seen from the other side
        const state = {
            days: days(2),
            items: [item(1, 1, 540), item(2, 1, 600), item(3, 1, 660)],
        };

        // Act
        const next = moveItem(state, { todoId: 2, dayId: 2, startMinutes: 0 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 60],
            [3, 660, 60],
        ]);
        expect(dayLayout(next, 2)).toEqual([[2, 0, 60]]);
    });

    test('throws for a to-do that is not booked', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => moveItem(state, { todoId: 9, dayId: 1, startMinutes: 0 })).toThrow(
            'To-do 9 is not booked'
        );
    });
});

describe('resizeItem', () => {
    test('growing the bottom edge pushes the stack below', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 600)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 540, durationMinutes: 120 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 120],
            [2, 660, 60],
        ]);
    });

    test('shrinking leaves a gap', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540, 120), item(2, 1, 660)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 540, durationMinutes: 30 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([
            [1, 540, 30],
            [2, 660, 60],
        ]);
    });

    test('growing at the bottom of a day spills the stack onward', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 1320), item(2, 1, 1380)] };

        // Act
        const next = resizeItem(state, { todoId: 1, startMinutes: 1320, durationMinutes: 120 });

        // Assert
        expect(dayLayout(next, 1)).toEqual([[1, 1320, 120]]);
        expect(dayLayout(next, 2)).toEqual([[2, 0, 60]]);
    });
});

describe('topEdgeFloor', () => {
    test('is midnight for the first item in a day', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540)] };

        // Act + Assert
        expect(topEdgeFloor(state, 1)).toBe(0);
    });

    test('is the end of the item above', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 660)] };

        // Act + Assert — dragging 2’s top edge upward stops at 10:00
        expect(topEdgeFloor(state, 2)).toBe(600);
    });

    test('ignores items in other days', () => {
        // Arrange
        const state = { days: days(2), items: [item(1, 1, 540, 600), item(2, 2, 660)] };

        // Act + Assert
        expect(topEdgeFloor(state, 2)).toBe(0);
    });
});

describe('unscheduleItem', () => {
    test('drops the booking and leaves the rest of the day where it is', () => {
        // Arrange
        const state = { days: days(1), items: [item(1, 1, 540), item(2, 1, 660)] };

        // Act
        const next = unscheduleItem(state, 1);

        // Assert
        expect(dayLayout(next, 1)).toEqual([[2, 660, 60]]);
    });

    test('throws for a to-do that is not booked', () => {
        // Arrange
        const state = { days: days(1), items: [] };

        // Act + Assert
        expect(() => unscheduleItem(state, 9)).toThrow('To-do 9 is not booked');
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=schedule.gestures`
Expected: FAIL — `placeFromPool is not a function`.

- [x] **Step 3: Write the gestures**

Append to `src/client/src/lib/schedule.js`:

```js
/**
 * The booking for a to-do. Throws when there is none — a gesture aimed at
 * something unbooked is a wiring mistake in the caller, not a state to quietly
 * produce no change for, which would look like a drag that silently did nothing.
 */
const bookingOf = (state, todoId) => {
    const booking = state.items.find((item) => item.todoId === todoId);

    if (!booking) throw new Error(`To-do ${todoId} is not booked`);

    return booking;
};

/**
 * Books a to-do dragged out of the pool. Everything beyond the four scheduling
 * fields — text, status, project and sequence — is carried through untouched, so
 * the new card can draw itself before the save lands.
 *
 * A to-do already booked is refused rather than moved. Moving is `moveItem`, and
 * a second booking is impossible by design (decision 4) — the pool makes a
 * scheduled row inert precisely so this cannot be reached.
 */
export const placeFromPool = (
    state,
    { todoId, dayId, startMinutes, durationMinutes = DEFAULT_DURATION, ...display }
) => {
    if (state.items.some((item) => item.todoId === todoId)) {
        throw new Error(`To-do ${todoId} is already booked`);
    }

    const booking = { ...display, todoId, dayId, startMinutes, durationMinutes };

    return spillFrom({ ...state, items: [...state.items, booking] }, dayId, [todoId]);
};

/**
 * Moves a booking, within its day or to another one.
 *
 * Only the destination day is settled. The source keeps the gap the departure
 * leaves, which is the same asymmetry a shrink has: positions are what they are
 * drawn as, and nothing rearranges itself behind the user's back (decision 7).
 */
export const moveItem = (state, { todoId, dayId, startMinutes }) => {
    bookingOf(state, todoId);

    const items = state.items.map((item) =>
        item.todoId === todoId ? { ...item, dayId, startMinutes } : item
    );

    return spillFrom({ ...state, items }, dayId, [todoId]);
};

/**
 * Resizes a booking. Both edges arrive here as an already-clamped start and
 * duration — the geometry of which edge was dragged is the caller's business
 * (`lib/scheduleGeometry`), and by this point it is one rectangle.
 */
export const resizeItem = (state, { todoId, startMinutes, durationMinutes }) => {
    const existing = bookingOf(state, todoId);

    const items = state.items.map((item) =>
        item.todoId === todoId ? { ...item, startMinutes, durationMinutes } : item
    );

    return spillFrom({ ...state, items }, existing.dayId, [todoId]);
};

/**
 * Releases a booking — the drop on the pool's remove overlay. Nothing is
 * settled: the day keeps the gap, for the same reason a move does.
 */
export const unscheduleItem = (state, todoId) => {
    bookingOf(state, todoId);

    return { ...state, items: state.items.filter((item) => item.todoId !== todoId) };
};

/**
 * The earliest a top-edge drag may pull a booking's start: the end of the item
 * above it, or midnight when it is the first of its day.
 *
 * The top edge clamps rather than pushes, because the cascade only ever runs
 * downward. Letting it push upward would be a second, opposite rule for one
 * gesture, and would make the item above move when the user was dragging the one
 * below.
 */
export const topEdgeFloor = (state, todoId) => {
    const booking = bookingOf(state, todoId);

    const above = state.items
        .filter(
            (other) =>
                other.dayId === booking.dayId &&
                other.todoId !== todoId &&
                other.startMinutes < booking.startMinutes
        )
        .sort((a, b) => a.startMinutes - b.startMinutes);

    return above.length === 0 ? 0 : endOf(above[above.length - 1]);
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=schedule.gestures`
Expected: PASS, 15 tests.

- [x] **Step 5: Check the file size**

Run: `wc -l src/client/src/lib/schedule.js`
Expected: roughly 230–260 lines — comfortably inside the 400-line target. If it
has grown past 400, split the gestures into `lib/scheduleGestures.js`.

- [x] **Step 6: Commit**

```bash
git add src/client/src/lib/schedule.js src/client/src/lib/schedule.gestures.test.js
git commit -m "feat(calendar): add place, move, resize and unschedule gestures"
```

---

## Task 14: `scheduleGeometry.js`

**Files:**
- Create: `src/client/src/lib/scheduleGeometry.js`
- Test: `src/client/src/lib/scheduleGeometry.test.js`

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/scheduleGeometry.test.js`:

```js
import {
    DAY_HEIGHT_PX,
    INITIAL_SCROLL_MINUTES,
    PX_PER_SLOT,
    SLOTS_PER_DAY,
    clampDuration,
    clampStart,
    formatTime,
    hourLabels,
    minutesToPx,
    pxToMinutes,
    snapToSlot,
} from './scheduleGeometry';

describe('scheduleGeometry constants', () => {
    test('a day is 48 slots tall and opens at 06:00', () => {
        expect(SLOTS_PER_DAY).toBe(48);
        expect(DAY_HEIGHT_PX).toBe(SLOTS_PER_DAY * PX_PER_SLOT);
        expect(INITIAL_SCROLL_MINUTES).toBe(360);
    });
});

describe('minutesToPx / pxToMinutes', () => {
    test('round-trips a slot', () => {
        expect(minutesToPx(30)).toBe(PX_PER_SLOT);
        expect(pxToMinutes(PX_PER_SLOT)).toBe(30);
    });

    test('round-trips a whole day', () => {
        expect(minutesToPx(1440)).toBe(DAY_HEIGHT_PX);
        expect(pxToMinutes(DAY_HEIGHT_PX)).toBe(1440);
    });
});

describe('snapToSlot', () => {
    test('snaps to the nearest half hour', () => {
        expect(snapToSlot(0)).toBe(0);
        expect(snapToSlot(14)).toBe(0);
        expect(snapToSlot(15)).toBe(30);
        expect(snapToSlot(44)).toBe(30);
        expect(snapToSlot(545)).toBe(540);
        expect(snapToSlot(555)).toBe(570);
    });
});

describe('clampStart', () => {
    test('keeps a start on the grid and inside the day', () => {
        expect(clampStart(-90)).toBe(0);
        expect(clampStart(545)).toBe(540);
        expect(clampStart(99999)).toBe(1410);
    });
});

describe('clampDuration', () => {
    test('never goes below one slot', () => {
        expect(clampDuration(0)).toBe(30);
        expect(clampDuration(-60)).toBe(30);
    });

    test('never exceeds a whole day', () => {
        expect(clampDuration(99999)).toBe(1440);
    });

    test('allows a duration that will spill past midnight', () => {
        // The clamp is about what an item may *be*, not where it may sit —
        // running past 24:00 is what the spill exists to resolve.
        expect(clampDuration(720)).toBe(720);
    });
});

describe('formatTime', () => {
    test('renders a zero-padded 24-hour clock', () => {
        expect(formatTime(0)).toBe('00:00');
        expect(formatTime(540)).toBe('09:00');
        expect(formatTime(570)).toBe('09:30');
        expect(formatTime(1410)).toBe('23:30');
    });

    test('renders the end of a day as 24:00, not 00:00', () => {
        expect(formatTime(1440)).toBe('24:00');
    });
});

describe('hourLabels', () => {
    test('gives 24 labels, one per hour', () => {
        const labels = hourLabels();

        expect(labels).toHaveLength(24);
        expect(labels[0]).toEqual({ minutes: 0, label: '00:00' });
        expect(labels[23]).toEqual({ minutes: 1380, label: '23:00' });
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=scheduleGeometry`
Expected: FAIL — `Cannot find module './scheduleGeometry'`.

- [x] **Step 3: Write the module**

Create `src/client/src/lib/scheduleGeometry.js`:

```js
// Minutes on one side, pixels on the other (design section 9).
//
// Everything the calendar draws is positioned from a time, and every gesture
// arrives as a pixel offset. This is the only place that converts between them,
// so the scale is one number rather than a factor scattered through five
// components — and every magic number in the layout has a name here instead.
//
// The scheduling constants are imported from `lib/schedule` rather than restated,
// so there is one definition of what a day and a slot are.

import { DAY_MINUTES, MAX_DURATION, MIN_DURATION, SLOT_MINUTES } from './schedule';

/** How tall one half-hour slot is drawn. 48px an hour reads comfortably. */
export const PX_PER_SLOT = 24;

export const PX_PER_MINUTE = PX_PER_SLOT / SLOT_MINUTES;

export const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES;

export const DAY_HEIGHT_PX = SLOTS_PER_DAY * PX_PER_SLOT;

/**
 * Where a column is scrolled to when it first appears: 06:00 at the top.
 *
 * A 24-hour column is 1152px tall and most of the top of it is empty. Opening at
 * midnight would mean every user scrolls before they can do anything.
 */
export const INITIAL_SCROLL_MINUTES = 360;

const MINUTES_PER_HOUR = 60;

export const minutesToPx = (minutes) => minutes * PX_PER_MINUTE;

export const pxToMinutes = (px) => px / PX_PER_MINUTE;

/** The nearest half hour. Everything the user drags lands on the grid. */
export const snapToSlot = (minutes) => Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;

/**
 * A start time that is on the grid and inside the day.
 *
 * The ceiling is one slot short of midnight, because a booking has to be able to
 * begin somewhere — an item dropped at 23:30 is legal and simply spills.
 */
export const clampStart = (minutes) =>
    Math.min(Math.max(snapToSlot(minutes), 0), DAY_MINUTES - MIN_DURATION);

/**
 * A duration that is on the grid and between one slot and one day.
 *
 * Deliberately *not* clamped to what is left of the day below the item. How long
 * a booking is and where it fits are different questions: an item resized past
 * 24:00 is not an error to be prevented, it is the input to the spill.
 */
export const clampDuration = (minutes) =>
    Math.min(Math.max(snapToSlot(minutes), MIN_DURATION), MAX_DURATION);

/**
 * A zero-padded 24-hour clock. 1440 reads as "24:00" rather than "00:00" so the
 * end of a booking that finishes the day says so.
 */
export const formatTime = (minutes) => {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;

    return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

/** The gutter labels down the side of a column, one an hour. */
export const hourLabels = () =>
    Array.from({ length: DAY_MINUTES / MINUTES_PER_HOUR }, (unused, hour) => {
        const minutes = hour * MINUTES_PER_HOUR;

        return { minutes, label: formatTime(minutes) };
    });
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=scheduleGeometry`
Expected: PASS, 11 tests.

- [x] **Step 5: Commit**

```bash
git add src/client/src/lib/scheduleGeometry.js src/client/src/lib/scheduleGeometry.test.js
git commit -m "feat(calendar): add the minutes-to-pixels geometry"
```

---

## Task 15: `calendarRequest.js`

**Files:**
- Create: `src/client/src/lib/calendarRequest.js`
- Test: `src/client/src/lib/calendarRequest.test.js`

The bridge between a settled state and the bulk endpoint: what changed, and how
to name a day that does not exist yet.

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/calendarRequest.test.js`:

```js
import { toBulkRequest } from './calendarRequest';

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const item = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

describe('toBulkRequest', () => {
    test('sends nothing when nothing changed', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [item(7, 1, 540)] };

        // Act + Assert
        expect(toBulkRequest(state, state)).toEqual({
            appendDays: 0,
            placements: [],
            unschedule: [],
        });
    });

    test('sends only the bookings a gesture actually moved', () => {
        // Arrange
        const before = { days: [day(1, 0)], items: [item(7, 1, 540), item(8, 1, 660)] };
        const after = { days: [day(1, 0)], items: [item(7, 1, 540, 120), item(8, 1, 660)] };

        // Act
        const request = toBulkRequest(before, after);

        // Assert — item 8 did not move, so it is not in the payload
        expect(request.placements).toEqual([
            { todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 120 },
        ]);
    });

    test('sends a new booking', () => {
        // Arrange
        const before = { days: [day(1, 0)], items: [] };
        const after = { days: [day(1, 0)], items: [item(7, 1, 540)] };

        // Act + Assert
        expect(toBulkRequest(before, after).placements).toEqual([
            { todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 },
        ]);
    });

    test('names an unsaved day by its index and counts the appends', () => {
        // Arrange — a spill created day -1 at position 1
        const before = { days: [day(1, 0)], items: [item(7, 1, 1410)] };
        const after = { days: [day(1, 0), day(-1, 1)], items: [item(7, -1, 0)] };

        // Act
        const request = toBulkRequest(before, after);

        // Assert
        expect(request).toEqual({
            appendDays: 1,
            placements: [{ todoId: 7, dayIndex: 1, startMinutes: 0, durationMinutes: 60 }],
            unschedule: [],
        });
    });

    test('reports a booking that disappeared as an unschedule', () => {
        // Arrange
        const before = { days: [day(1, 0)], items: [item(7, 1, 540), item(8, 1, 660)] };
        const after = { days: [day(1, 0)], items: [item(8, 1, 660)] };

        // Act + Assert
        expect(toBulkRequest(before, after)).toEqual({
            appendDays: 0,
            placements: [],
            unschedule: [7],
        });
    });

    test('never asks for more days than it has placements for', () => {
        // Arrange — the server refuses appendDays > placements.length, and an
        // appended day always receives at least the item that caused it
        const before = { days: [day(1, 0)], items: [item(7, 1, 1410)] };
        const after = { days: [day(1, 0), day(-1, 1)], items: [item(7, -1, 0)] };

        // Act
        const request = toBulkRequest(before, after);

        // Assert
        expect(request.appendDays).toBeLessThanOrEqual(request.placements.length);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=calendarRequest`
Expected: FAIL — `Cannot find module './calendarRequest'`.

- [x] **Step 3: Write the module**

Create `src/client/src/lib/calendarRequest.js`:

```js
// The settled result of a gesture, as the body `PUT /api/calendar/items` takes.
//
// A gesture is computed locally and in full, but only the difference is worth
// sending: a resize near the top of a busy day moves half a dozen bookings and
// leaves twenty alone, and the twenty do not need a round trip. The server's own
// overlap check reads what is stored rather than what was sent, so leaving the
// unchanged ones out costs nothing in safety.
//
// The other half of the job is naming days. A spill can create a day that has no
// server id yet — it is drawn immediately under a negative one — and a placement
// into it is named by its index in the day list instead, which the server
// resolves after making the appends. That is what lets a spill be one atomic
// request rather than a create followed by a write that might not happen.

import { isTempId } from './tempIds';

const SCHEDULING_FIELDS = ['dayId', 'startMinutes', 'durationMinutes'];

const hasMoved = (before, after) =>
    !before || SCHEDULING_FIELDS.some((field) => before[field] !== after[field]);

const bookingOf = (state, todoId) =>
    state.items.find((item) => item.todoId === todoId);

/**
 * `previous` is the state before the gesture and `next` the settled state after
 * it. Returns `{ appendDays, placements, unschedule }`.
 *
 * `appendDays` can never exceed `placements.length`, which the server enforces:
 * a day is only ever appended to receive something, and whatever it receives has
 * a new `dayId` and so is always among the placements.
 */
export const toBulkRequest = (previous, next) => {
    const appendDays = next.days.filter((day) => isTempId(day.id)).length;

    const placements = next.items
        .filter((item) => hasMoved(bookingOf(previous, item.todoId), item))
        .map(({ todoId, dayId, startMinutes, durationMinutes }) => {
            const where = isTempId(dayId)
                ? { dayIndex: next.days.findIndex((day) => day.id === dayId) }
                : { dayId };

            return { todoId, ...where, startMinutes, durationMinutes };
        });

    const unschedule = previous.items
        .filter((item) => !bookingOf(next, item.todoId))
        .map((item) => item.todoId);

    return { appendDays, placements, unschedule };
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=calendarRequest`
Expected: PASS, 6 tests.

- [x] **Step 5: Run the whole client suite**

Run: `npm run test:client`
Expected: PASS, including everything that already existed.

- [x] **Step 6: Commit**

```bash
git add src/client/src/lib/calendarRequest.js src/client/src/lib/calendarRequest.test.js
git commit -m "feat(calendar): shape a settled gesture into the bulk request"
```

**Phase B is complete.** The cascade is fully specified and tested with no UI at
all. Every remaining task is wiring this to a screen.

---

# Phase C — Client state

## Task 16: `schedule.js` — adding and removing days

**Files:**
- Modify: `src/client/src/lib/schedule.js`
- Test: `src/client/src/lib/schedule.days.test.js`

The strip's + and its × are structural changes to the same state the gestures
operate on, so they belong beside them rather than inside a component.

- [x] **Step 1: Write the failing test**

Create `src/client/src/lib/schedule.days.test.js`:

```js
import { appendDay, removeDay } from './schedule';
import { isTempId } from './tempIds';

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const item = (todoId, dayId, startMinutes) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes: 60,
});

describe('appendDay', () => {
    test('adds an unsaved day at the end', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [] };

        // Act
        const next = appendDay(state);

        // Assert
        expect(next.days).toHaveLength(2);
        expect(isTempId(next.days[1].id)).toBe(true);
        expect(next.days[1].position).toBe(1);
    });

    test('starts an empty calendar at position 0', () => {
        expect(appendDay({ days: [], items: [] }).days[0].position).toBe(0);
    });

    test('does not mutate the state it is given', () => {
        // Arrange
        const state = { days: [day(1, 0)], items: [] };

        // Act
        appendDay(state);

        // Assert
        expect(state.days).toHaveLength(1);
    });
});

describe('removeDay', () => {
    test('drops the day and closes the gap in positions', () => {
        // Arrange
        const state = { days: [day(1, 0), day(2, 1), day(3, 2)], items: [] };

        // Act
        const next = removeDay(state, 2);

        // Assert
        expect(next.days).toEqual([
            { ...day(1, 0), position: 0 },
            { ...day(3, 2), position: 1 },
        ]);
    });

    test('releases the bookings in it and leaves the others', () => {
        // Arrange — decision 6: the container goes, the work does not
        const state = {
            days: [day(1, 0), day(2, 1)],
            items: [item(7, 1, 540), item(8, 2, 0)],
        };

        // Act
        const next = removeDay(state, 1);

        // Assert
        expect(next.items).toEqual([item(8, 2, 0)]);
    });

    test('throws for a day that is not in the calendar', () => {
        expect(() => removeDay({ days: [], items: [] }, 9)).toThrow(
            'No day with id 9 to remove'
        );
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=schedule.days`
Expected: FAIL — `appendDay is not a function`.

- [x] **Step 3: Write the two functions**

Append to `src/client/src/lib/schedule.js`:

```js
/**
 * Adds a day to the end of the strip — the + at its right-hand edge.
 *
 * The day is unsaved, like one the spill creates: it is drawn under a negative
 * id and re-keyed when the server answers. The two paths produce the same shape
 * on purpose, so nothing downstream has to know which made it.
 */
export const appendDay = (state) => ({
    ...state,
    days: [...state.days, newDay(state.days.length)],
});

/**
 * Deletes a day and releases the bookings in it.
 *
 * The to-dos themselves are untouched — this returns them to the pool, the way
 * deleting a sequence returns its to-dos to the unorganized panel (decision 6).
 * Positions close up behind it so they stay dense, matching what the server does
 * to the same ordering.
 */
export const removeDay = (state, dayId) => {
    if (!state.days.some((day) => day.id === dayId)) {
        throw new Error(`No day with id ${dayId} to remove`);
    }

    return {
        ...state,
        days: state.days
            .filter((day) => day.id !== dayId)
            .map((day, position) => ({ ...day, position })),
        items: state.items.filter((item) => item.dayId !== dayId),
    };
};
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=schedule.days`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add src/client/src/lib/schedule.js src/client/src/lib/schedule.days.test.js
git commit -m "feat(calendar): add and remove days in the schedule state"
```

---

## Task 17: The reducer, actions and context

**Files:**
- Create: `src/client/src/state/calendarReducer.js`
- Create: `src/client/src/state/calendarActions.js`
- Create: `src/client/src/state/CalendarContext.js`
- Test: `src/client/src/state/calendarReducer.test.js`

Unlike `projectReducer`, this keeps `days` and `items` as **arrays**, not objects
keyed by id. Two reasons: the day strip is an ordering, which is the thing a
keyed object throws away; and every gesture is computed by `lib/schedule`, which
speaks arrays — normalising here would mean converting both ways on every pointer
move for a collection that is at most a few hundred rows.

- [x] **Step 1: Write the failing test**

Create `src/client/src/state/calendarReducer.test.js`:

```js
import {
    CALENDAR_STATUS,
    calendarReducer,
    initialCalendarState,
    scheduleOf,
} from './calendarReducer';
import {
    actionErrorCleared,
    loadFailed,
    loadStarted,
    loadSucceeded,
    rolledBack,
    scheduleReplaced,
} from './calendarActions';

const calendar = {
    days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }],
    items: [{ todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 }],
};

describe('calendarReducer', () => {
    test('starts idle and empty', () => {
        expect(initialCalendarState.status).toBe(CALENDAR_STATUS.idle);
        expect(initialCalendarState.days).toEqual([]);
        expect(initialCalendarState.items).toEqual([]);
    });

    test('a load in flight clears any earlier load error', () => {
        // Arrange
        const failed = calendarReducer(initialCalendarState, loadFailed('Offline'));

        // Act
        const next = calendarReducer(failed, loadStarted());

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.loading);
        expect(next.loadError).toBeNull();
    });

    test('a successful load installs the calendar', () => {
        // Act
        const next = calendarReducer(initialCalendarState, loadSucceeded(calendar));

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.ready);
        expect(next.days).toEqual(calendar.days);
        expect(next.items).toEqual(calendar.items);
    });

    test('a failed load keeps the message for the retry screen', () => {
        // Act
        const next = calendarReducer(initialCalendarState, loadFailed('Offline'));

        // Assert
        expect(next.status).toBe(CALENDAR_STATUS.error);
        expect(next.loadError).toBe('Offline');
    });

    test('replacing the schedule swaps both collections at once', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const moved = { days: calendar.days, items: [{ ...calendar.items[0], startMinutes: 600 }] };

        // Act
        const next = calendarReducer(ready, scheduleReplaced(moved));

        // Assert
        expect(next.items[0].startMinutes).toBe(600);
        expect(next.status).toBe(CALENDAR_STATUS.ready);
    });

    test('a rollback restores the snapshot and raises the message', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const snapshot = scheduleOf(ready);
        const moved = calendarReducer(
            ready,
            scheduleReplaced({ days: calendar.days, items: [] })
        );

        // Act
        const next = calendarReducer(moved, rolledBack(snapshot, 'Could not save'));

        // Assert
        expect(next.items).toEqual(calendar.items);
        expect(next.actionError).toBe('Could not save');
    });

    test('dismissing the action error leaves the schedule alone', () => {
        // Arrange
        const ready = calendarReducer(initialCalendarState, loadSucceeded(calendar));
        const failed = calendarReducer(ready, rolledBack(scheduleOf(ready), 'Nope'));

        // Act
        const next = calendarReducer(failed, actionErrorCleared());

        // Assert
        expect(next.actionError).toBeNull();
        expect(next.items).toEqual(calendar.items);
    });

    test('refuses an action it does not know', () => {
        expect(() => calendarReducer(initialCalendarState, { type: 'nonsense' })).toThrow(
            'Unknown calendar action "nonsense"'
        );
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=calendarReducer`
Expected: FAIL — `Cannot find module './calendarReducer'`.

- [x] **Step 3: Write the reducer**

Create `src/client/src/state/calendarReducer.js`:

```js
// The calendar, as state.
//
// Deliberately *not* normalised into objects keyed by id, unlike
// `projectReducer`. Two reasons, and both are about what the data is:
//
//   - The day strip is an ordering. Keying days by id throws that away and then
//     rebuilds it from `position` on every render, for a collection that is
//     already a list.
//   - Every gesture is computed by `lib/schedule`, which works on arrays. A
//     keyed store would mean converting both ways on every pointer move of a
//     drag, for at most a few hundred rows.
//
// The whole schedule is replaced in one action rather than patched row by row,
// for the same reason: a gesture is a single arithmetic result over both
// collections, not a set of independent edits. That also makes the rollback a
// plain assignment of a snapshot taken beforehand.

export const CALENDAR_STATUS = {
    idle: 'idle',
    loading: 'loading',
    ready: 'ready',
    error: 'error',
};

export const CALENDAR_ACTIONS = {
    loadStarted: 'loadStarted',
    loadSucceeded: 'loadSucceeded',
    loadFailed: 'loadFailed',
    scheduleReplaced: 'scheduleReplaced',
    rolledBack: 'rolledBack',
    actionErrorCleared: 'actionErrorCleared',
};

export const initialCalendarState = {
    status: CALENDAR_STATUS.idle,
    // The load failed and there is no calendar to show — the page offers a retry.
    loadError: null,
    // A mutation failed and was rolled back — the page raises a toast.
    actionError: null,
    days: [],
    items: [],
};

/** The part of the state a gesture changes, and a rollback restores. */
export const scheduleOf = (state) => ({ days: state.days, items: state.items });

const handlers = {
    [CALENDAR_ACTIONS.loadStarted]: (state) => ({
        ...state,
        status: CALENDAR_STATUS.loading,
        loadError: null,
    }),

    [CALENDAR_ACTIONS.loadSucceeded]: (state, { calendar }) => ({
        ...state,
        status: CALENDAR_STATUS.ready,
        loadError: null,
        days: calendar.days,
        items: calendar.items,
    }),

    [CALENDAR_ACTIONS.loadFailed]: (state, { error }) => ({
        ...state,
        status: CALENDAR_STATUS.error,
        loadError: error,
    }),

    [CALENDAR_ACTIONS.scheduleReplaced]: (state, { schedule }) => ({
        ...state,
        days: schedule.days,
        items: schedule.items,
    }),

    [CALENDAR_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        ...snapshot,
        actionError: error,
    }),

    [CALENDAR_ACTIONS.actionErrorCleared]: (state) => ({ ...state, actionError: null }),
};

export const calendarReducer = (state, action) => {
    const handler = handlers[action.type];

    if (!handler) throw new Error(`Unknown calendar action "${action.type}"`);

    return handler(state, action);
};
```

- [x] **Step 4: Write the action creators**

Create `src/client/src/state/calendarActions.js`:

```js
// Action creators for `calendarReducer`. Components and hooks dispatch these
// rather than object literals, so the payload shape lives in one place.

import { CALENDAR_ACTIONS } from './calendarReducer';

export const loadStarted = () => ({ type: CALENDAR_ACTIONS.loadStarted });

export const loadSucceeded = (calendar) => ({
    type: CALENDAR_ACTIONS.loadSucceeded,
    calendar,
});

export const loadFailed = (error) => ({ type: CALENDAR_ACTIONS.loadFailed, error });

/** The settled result of one gesture: both collections, together. */
export const scheduleReplaced = (schedule) => ({
    type: CALENDAR_ACTIONS.scheduleReplaced,
    schedule,
});

export const rolledBack = (snapshot, error) => ({
    type: CALENDAR_ACTIONS.rolledBack,
    snapshot,
    error,
});

export const actionErrorCleared = () => ({ type: CALENDAR_ACTIONS.actionErrorCleared });
```

- [x] **Step 5: Write the context**

Create `src/client/src/state/CalendarContext.js`:

```js
import React, { createContext, useContext } from 'react';

// The loaded calendar and its mutation helpers, shared with the strip and the
// pool. The value is whatever `useCalendar` returns, so a day column deep in the
// strip reads the same state and calls the same helpers as the page itself.

const CalendarContext = createContext(null);

export const CalendarProvider = ({ value, children }) => (
    <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
);

/**
 * Throws rather than handing back `null` outside a provider, matching
 * `useProjectContext`: a calendar component rendered on its own is a wiring
 * mistake, and reading `state` off undefined further down would report it far
 * from its cause.
 */
export const useCalendarContext = () => {
    const context = useContext(CalendarContext);

    if (!context) {
        throw new Error('useCalendarContext must be used inside a CalendarProvider');
    }

    return context;
};

export default CalendarContext;
```

- [x] **Step 5b: Close the gap `schedule.js` left open for this reducer**

`schedule.js:344-364` names this reducer as the place three invariants get
established, and sketches the guard it wants:

```js
export const assertIngestible = (item) => {
    assertSchedulable(item);
    assertFitsInADay(item);
};
```

Step 3's reducer does not call it, and `assertIngestible` does not exist. Left
as it stands, a `NaN` `startMinutes` in a server payload is ingested silently
and first surfaces mid-drag, inside a `pointermove`, where no error boundary
catches it — the exact failure the comment was written to prevent.

Close it now rather than leaving the comment lying about where the check lives:

1. Export `assertIngestible` from `schedule.js`, as the composition above.
   Both of `spillFrom`'s preconditions must hold for an ingested item, not just
   the fold's — do not define a third notion of "a legal item".
2. Call it from the two reducer cases where data enters the tree:
   `loadSucceeded` (the serialized server response) and `scheduleReplaced` (an
   optimistic row, and a gesture payload). `rolledBack` restores a snapshot
   that was validated on its way in, so it needs no check.
3. Delete the now-stale "That is Task 17's reducer" paragraph's future tense at
   `schedule.js:344-364` and state what is true: the check lives in
   `calendarReducer`, so these assertions can only fire on a state that was
   already broken before any pointer moved.

Cost is per dispatch, not per frame: `scheduleReplaced` fires once when a
gesture is let go, not on every pointer move — the ghost is drawn from local
arithmetic that never touches the reducer.

Test first, in `calendarReducer.test.js`: a load whose payload carries an item
with a `NaN` start is refused, and a `scheduleReplaced` carrying a booking
longer than a day is refused. Assert on the guards' own messages so the test
fails if the reducer starts defining its own.

- [x] **Step 5c: Make the two schedule tests load-bearing**

Step 1's `replacing the schedule swaps both collections at once` and `a
rollback restores the snapshot and raises the message` never assert on
`next.days`. In both fixtures the `days` array is reference-identical to what
is already in state, so a handler that dropped `days` from the merge entirely
would pass both — and the test names both claim to cover days.

Give each fixture a `days` array that actually differs from the state it acts
on, and assert on it. This is the dead-assertion shape `6a017dd` and `5f50b2c`
already corrected twice in this plan; do not add a third.
- [x] **Step 6: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=calendarReducer`
Expected: PASS, 8 tests.

- [x] **Step 7: Commit**

```bash
git add src/client/src/state/calendarReducer.js src/client/src/state/calendarActions.js src/client/src/state/CalendarContext.js src/client/src/state/calendarReducer.test.js
git commit -m "feat(calendar): add the calendar reducer, actions and context"
```

---

## Task 18: `useCalendar`

**Files:**
- Create: `src/client/src/hooks/useCalendar.js`
- Test: `src/client/src/hooks/useCalendar.test.js`

**Two defects the Task 16 review found in this task's code. Fix them as you
write it — do not transcribe the blocks below as they stand.**

*Both were unreachable until Task 16 landed, because `spillFrom` was the only
producer of a temp day and its temp day is created and reconciled by the same
round trip. `appendDay` gives a temp day a round trip of its own, with no
commit attached, and that opens two interleavings.*

**1. `+` widens the unreconciled-`previous` window `toBulkRequest` throws on.**

`toBulkRequest` (`lib/calendarRequest.js:63`) deliberately throws when
`previous` still holds a temp day — see commit `6a017dd` for why that beats
scoping the count. But `commit` calls it straight out of a drop handler. Click
`+`, then drag a booking before the POST lands, and it throws where React's
error boundary cannot catch it (this module's own header at `schedule.js:331`
records that event handlers are outside the boundary): the drag dies with
nothing on screen to explain it.

Either gate the gesture — disable `+` and the drop targets while
`state.days.some((day) => isTempId(day.id))` — or have `commit` defer instead
of calling `toBulkRequest`. Gating is the smaller change and matches how
`DayColumn` already hides the × on an unsaved day. Whichever you pick, write
the test first: a drop dispatched against a state holding a temp day.

**2. `mutate`'s `onSuccess` closes over a stale `optimistic`.**

`const optimistic = apply(previous)` is captured, then handed to `onSuccess`
after the await. Click `+`, delete a *real* day before the POST resolves — the
× stays live during an `addDay` — and `reconcileDay` runs against the
pre-delete snapshot. The deleted column comes back on screen while it is gone
from the server, and stays diverged until a reload. Quiet, and green: the same
shape as the four defects Phase B closed.

Rebase `onSuccess` onto `stateRef.current` rather than the captured
`optimistic`, or serialize mutations so the second cannot start mid-flight.
Note that `reconcileDay` maps over `schedule.days` by id, so rebasing is
sufficient — it will simply find no temp day to swap if the state moved on.
Pin it with a test that interleaves `deleteDay` inside a pending `addDay`.

**3. `mutate` throws into an async gap, and the failure is silent.**

`apply()` and the optimistic `dispatch` sit *outside* the `try`, and `mutate`
is `async`, so a throw there rejects the returned promise instead of throwing
synchronously. `handleDragEnd` calls `commit(...)` without awaiting or
catching. So when the Task 17 ingest guard refuses an item — or `removeDay`
refuses a missing day in `deleteDay` — the result is: no optimistic state, no
request, no `rolledBack`, no `actionError`, nothing on screen. Only an
unhandled-rejection warning in the console.

That is quieter than an uncaught synchronous throw, which at least reaches
`window.onerror`, and it is the opposite of what `handleDragEnd`'s own comment
asks for — "a wiring bug that should be loud rather than silently doing
nothing".

Move `apply()` and the optimistic dispatch inside the `try`, so an ingest
failure surfaces as a rolled-back mutation with a visible `actionError`. Note
`toBulkRequest`'s throw in `commit` is *not* affected — `commit` is not async,
so it escapes synchronously as intended. Only throws reached through `mutate`
have this problem.

**4. `stateRef` must be folded forward eagerly, or fixes 2 and 3 do nothing.**

*Found while implementing this task; the Step 3 block below still shows the
superseded line, and defect 2 above still says "rebase onto
`stateRef.current`" without saying how that ref has to be maintained.*

`stateRef.current = state` during render lags any dispatch React has not
rendered yet, and a response can beat that render. The reconcile then finds no
temp day and **drops the day it just added** — worse than the defect it was
meant to fix. Task 18's own `addDay` test catches it: `Expected length: 2 /
Received length: 1`.

Worse, the ingest guard Task 17 added never reaches `mutate`'s `try`. React
runs the reducer during the render phase, so the throw's stack is

```
at calendarReducer (state/calendarReducer.js)
at updateReducer (react-dom)
at useCalendar … beginWork … renderRootSync
```

with `mutate` nowhere in it. Left alone, `assertIngestible` refusing an item
takes the whole calendar down through the error boundary instead of raising
`actionError`.

Fold the ref forward through `calendarReducer` at dispatch time, behind a
wrapper, so "current" means what the reducer has been told rather than what
React has painted, and keep the raw dispatch to a single call site. Both
effects follow: the reconcile sees the day it added, and the guard's throw
lands in the caller's frame where `mutate` catches it. The reducer is pure, so
running it twice per action is safe; the cost is once per gesture, not per
frame. Evaluate the fold before the raw dispatch, so a throw leaves neither
copy advanced.

**Serializing mutations is not a substitute for any of this.** It shrinks the
window and never closes it: `apply` still reads shared current state, and a
render-assigned ref still lags the dispatch that just happened, whether or not
another mutation is in flight.

- [x] **Step 1: Write the failing test**

Create `src/client/src/hooks/useCalendar.test.js`:

```js
import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendar from './useCalendar';
import { api } from '../lib/api';
import { CALENDAR_STATUS } from '../state/calendarReducer';

jest.mock('../lib/api');

const calendar = {
    days: [{ id: 1, position: 0, createdAt: '2026-09-09T08:00:00.000Z' }],
    items: [
        {
            id: 5,
            todoId: 7,
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 60,
            text: 'Wire up the token refresh',
            status: 'incomplete',
            projectId: 2,
            projectTitle: 'Auth rewrite',
            sequenceId: 9,
            sequenceTitle: 'Session handling',
        },
    ],
};

/** Renders the hook with the calendar already loaded. */
const renderReady = async () => {
    api.get.mockResolvedValue(calendar);

    const rendered = renderHook(() => useCalendar());
    await waitFor(() => expect(rendered.result.current.state.status).toBe(CALENDAR_STATUS.ready));

    return rendered;
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useCalendar loading', () => {
    test('loads the calendar in one request', async () => {
        // Arrange + Act
        const { result } = await renderReady();

        // Assert
        expect(api.get).toHaveBeenCalledWith('/calendar');
        expect(result.current.state.items).toHaveLength(1);
    });

    test('keeps a retry on screen when the load fails', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('Could not reach the server.'));

        // Act
        const { result } = renderHook(() => useCalendar());

        // Assert
        await waitFor(() =>
            expect(result.current.state.status).toBe(CALENDAR_STATUS.error)
        );
        expect(result.current.state.loadError).toBe('Could not reach the server.');
    });
});

describe('useCalendar.commit', () => {
    test('sends only what changed and installs the server’s answer', async () => {
        // Arrange
        const { result } = await renderReady();
        const moved = {
            days: calendar.days,
            items: [{ ...calendar.items[0], startMinutes: 600 }],
        };
        api.put.mockResolvedValue(moved);

        // Act
        await act(() => result.current.commit(moved));

        // Assert
        expect(api.put).toHaveBeenCalledWith('/calendar/items', {
            appendDays: 0,
            placements: [
                { todoId: 7, dayId: 1, startMinutes: 600, durationMinutes: 60 },
            ],
            unschedule: [],
        });
        expect(result.current.state.items[0].startMinutes).toBe(600);
    });

    test('sends nothing when the gesture changed nothing', async () => {
        // Arrange
        const { result } = await renderReady();

        // Act
        await act(() => result.current.commit({ days: calendar.days, items: calendar.items }));

        // Assert
        expect(api.put).not.toHaveBeenCalled();
    });

    test('rolls back and raises a message when the save fails', async () => {
        // Arrange
        const { result } = await renderReady();
        api.put.mockRejectedValue(new Error('Could not save the change.'));

        // Act
        await act(() =>
            result.current.commit({
                days: calendar.days,
                items: [{ ...calendar.items[0], startMinutes: 600 }],
            })
        );

        // Assert
        expect(result.current.state.items[0].startMinutes).toBe(540);
        expect(result.current.state.actionError).toBe('Could not save the change.');
    });
});

describe('useCalendar.addDay', () => {
    test('shows the day at once and re-keys it when the server answers', async () => {
        // Arrange
        const { result } = await renderReady();
        const saved = { id: 2, position: 1, createdAt: '2026-09-09T09:00:00.000Z' };
        api.post.mockResolvedValue(saved);

        // Act
        await act(() => result.current.addDay());

        // Assert
        expect(api.post).toHaveBeenCalledWith('/calendar/days', {});
        expect(result.current.state.days).toHaveLength(2);
        expect(result.current.state.days[1]).toEqual(saved);
    });

    test('rolls the day back if the request fails', async () => {
        // Arrange
        const { result } = await renderReady();
        api.post.mockRejectedValue(new Error('Nope'));

        // Act
        await act(() => result.current.addDay());

        // Assert
        expect(result.current.state.days).toHaveLength(1);
        expect(result.current.state.actionError).toBe('Nope');
    });
});

describe('useCalendar.deleteDay', () => {
    test('drops the day and its bookings at once', async () => {
        // Arrange
        const { result } = await renderReady();
        api.delete.mockResolvedValue({ id: 1 });

        // Act
        await act(() => result.current.deleteDay(1));

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/calendar/days/1');
        expect(result.current.state.days).toEqual([]);
        expect(result.current.state.items).toEqual([]);
    });
});

describe('useCalendar.unschedule', () => {
    test('releases the booking', async () => {
        // Arrange
        const { result } = await renderReady();
        api.delete.mockResolvedValue({ todoId: 7 });

        // Act
        await act(() => result.current.unschedule(7));

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/calendar/items/7');
        expect(result.current.state.items).toEqual([]);
    });
});

describe('useCalendar.completeTodo', () => {
    test('ticks the item without moving it', async () => {
        // Arrange
        const { result } = await renderReady();
        api.patch.mockResolvedValue({ id: 7, status: 'complete' });

        // Act
        await act(() => result.current.completeTodo(7));

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/todos/7', { status: 'complete' });
        expect(result.current.state.items[0].status).toBe('complete');
        expect(result.current.state.items[0].startMinutes).toBe(540);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=useCalendar`
Expected: FAIL — `Cannot find module './useCalendar'`.

- [x] **Step 3: Write the hook**

Create `src/client/src/hooks/useCalendar.js`:

```js
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { api } from '../lib/api';
import { toBulkRequest } from '../lib/calendarRequest';
import { appendDay, removeDay, unscheduleItem } from '../lib/schedule';
import { isTempId } from '../lib/tempIds';
import {
    calendarReducer,
    initialCalendarState,
    scheduleOf,
} from '../state/calendarReducer';
import {
    actionErrorCleared,
    loadFailed,
    loadStarted,
    loadSucceeded,
    rolledBack,
    scheduleReplaced,
} from '../state/calendarActions';

// Loads the calendar and applies changes to it optimistically, mirroring
// `useProjectGraph`.
//
// Each mutation dispatches its change immediately, sends the request, and then
// either installs what the server stored or rolls the whole schedule back to the
// snapshot taken beforehand and raises `actionError` for the page to surface.
// Nothing fails quietly.
//
// What is different here is the unit of change. A project mutation moves one row
// and a few neighbours; a calendar gesture is one arithmetic result over the
// whole schedule, computed by `lib/schedule` before it ever reaches this file.
// So the optimistic step is "replace the schedule", and the snapshot a rollback
// restores is the schedule as it was.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const TODO_COMPLETE = 'complete';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/** A gesture that asks the server for nothing — a drag let go where it started. */
const isNoOp = (request) =>
    request.appendDays === 0 &&
    request.placements.length === 0 &&
    request.unschedule.length === 0;

/**
 * Swaps an optimistic day for the row the server stored, carrying any bookings
 * that were pointing at the temporary id across with it.
 */
const reconcileDay = (schedule, tempId, saved) => ({
    days: schedule.days.map((day) => (day.id === tempId ? saved : day)),
    items: schedule.items.map((item) =>
        item.dayId === tempId ? { ...item, dayId: saved.id } : item
    ),
});

const useCalendar = () => {
    const [state, dispatch] = useReducer(calendarReducer, initialCalendarState);

    // Mutations need the schedule as it is at the moment they run, to snapshot it
    // for a possible rollback. `state` in a callback closure is the render's
    // value, which may already be stale by then; this ref is not.
    const stateRef = useRef(state);
    stateRef.current = state;

    const load = useCallback(async () => {
        dispatch(loadStarted());

        try {
            dispatch(loadSucceeded(await api.get('/calendar')));
        } catch (err) {
            dispatch(loadFailed(messageOf(err)));
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Runs one optimistic mutation: apply, send, then settle. `apply` turns the
     * schedule into what it should look like at once; `onSuccess` turns the
     * server's answer into what it should look like afterwards, and is omitted
     * when the optimistic change was already the final one.
     */
    const mutate = useCallback(async ({ apply, send, onSuccess }) => {
        const previous = scheduleOf(stateRef.current);
        const optimistic = apply(previous);

        dispatch(scheduleReplaced(optimistic));

        try {
            const saved = await send();

            if (onSuccess) dispatch(scheduleReplaced(onSuccess(optimistic, saved)));
        } catch (err) {
            dispatch(rolledBack(previous, messageOf(err)));
        }
    }, []);

    /**
     * Saves a settled gesture — a drop, a resize, a reorder.
     *
     * `next` is the whole schedule as `lib/schedule` computed it. Only the
     * difference goes on the wire: a resize near the top of a busy day moves half
     * a dozen bookings and leaves twenty alone. A gesture that changed nothing —
     * a drag let go where it started — sends nothing at all rather than a request
     * the server would apply to no effect.
     */
    const commit = useCallback(
        (next) => {
            const request = toBulkRequest(scheduleOf(stateRef.current), next);

            if (isNoOp(request)) return Promise.resolve();

            return mutate({
                apply: () => next,
                send: () => api.put('/calendar/items', request),
                onSuccess: (unused, saved) => saved,
            });
        },
        [mutate]
    );

    /** The + at the right of the strip. */
    const addDay = useCallback(() => {
        let tempId = null;

        return mutate({
            apply: (previous) => {
                const optimistic = appendDay(previous);
                tempId = optimistic.days[optimistic.days.length - 1].id;

                return optimistic;
            },
            send: () => api.post('/calendar/days', {}),
            onSuccess: (optimistic, saved) => reconcileDay(optimistic, tempId, saved),
        });
    }, [mutate]);

    /**
     * Deletes a day. Its bookings are released rather than pushed forward — the
     * container goes, the work does not (design decision 6) — and the to-dos
     * behind them reappear in the pool.
     */
    const deleteDay = useCallback(
        (dayId) =>
            mutate({
                apply: (previous) => removeDay(previous, dayId),
                send: () => api.delete(`/calendar/days/${dayId}`),
            }),
        [mutate]
    );

    /** Dropping a booking on the pool's remove overlay. */
    const unschedule = useCallback(
        (todoId) =>
            mutate({
                apply: (previous) => unscheduleItem(previous, todoId),
                send: () => api.delete(`/calendar/items/${todoId}`),
            }),
        [mutate]
    );

    /**
     * The bubble. The item stays exactly where it is and is struck through — the
     * point of ticking something on the calendar is to see what the day looked
     * like, which moving it would destroy.
     *
     * The same `PATCH /api/todos/:id` the project page sends, so a to-do
     * completed here is completed everywhere.
     */
    const completeTodo = useCallback(
        (todoId) =>
            mutate({
                apply: (previous) => ({
                    ...previous,
                    items: previous.items.map((item) =>
                        item.todoId === todoId ? { ...item, status: TODO_COMPLETE } : item
                    ),
                }),
                send: () => api.patch(`/todos/${todoId}`, { status: TODO_COMPLETE }),
            }),
        [mutate]
    );

    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), []);

    /** Whether a day is still waiting for the server to give it a real id. */
    const isUnsavedDay = useCallback((dayId) => isTempId(dayId), []);

    return {
        state,
        reload: load,
        commit,
        addDay,
        deleteDay,
        unschedule,
        completeTodo,
        dismissActionError,
        isUnsavedDay,
    };
};

export default useCalendar;
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=useCalendar`
Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add src/client/src/hooks/useCalendar.js src/client/src/hooks/useCalendar.test.js
git commit -m "feat(calendar): load and optimistically mutate the calendar"
```

---

## Task 19: `usePool`

**Files:**
- Create: `src/client/src/hooks/usePool.js`
- Test: `src/client/src/hooks/usePool.test.js`

The right panel's supply. No new endpoint: `GET /api/projects` already returns
each project's ready frontier with the next to-do in each sequence, which is
exactly design decision 3's pool.

- [x] **Step 1: Write the failing test**

Create `src/client/src/hooks/usePool.test.js`:

```js
import { renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api');

const projects = [
    {
        id: 2,
        title: 'Auth rewrite',
        frontier: [
            {
                sequenceId: 9,
                sequenceTitle: 'Session handling',
                nextTodo: { id: 7, text: 'Wire up the token refresh' },
                isStalled: false,
            },
            {
                sequenceId: 10,
                sequenceTitle: 'Blocked work',
                nextTodo: null,
                isStalled: true,
            },
        ],
    },
    { id: 3, title: 'Empty project', frontier: [] },
];

beforeEach(() => {
    jest.clearAllMocks();
});

describe('usePool', () => {
    test('offers one to-do per ready sequence', async () => {
        // Arrange
        api.get.mockResolvedValue(projects);

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        // Assert
        expect(api.get).toHaveBeenCalledWith('/projects');
        expect(result.current.projects[0].todos).toEqual([
            {
                todoId: 7,
                text: 'Wire up the token refresh',
                projectId: 2,
                projectTitle: 'Auth rewrite',
                sequenceId: 9,
                sequenceTitle: 'Session handling',
            },
        ]);
    });

    test('leaves out a stalled sequence, which has nothing to schedule', async () => {
        // Arrange
        api.get.mockResolvedValue(projects);

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        // Assert
        expect(result.current.projects[0].todos).toHaveLength(1);
    });

    test('keeps a project with nothing startable, so it can say so', async () => {
        // Arrange
        api.get.mockResolvedValue(projects);

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        // Assert
        expect(result.current.projects[1]).toEqual({
            id: 3,
            title: 'Empty project',
            todos: [],
        });
    });

    test('reports a failed load without emptying the panel silently', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('Could not reach the server.'));

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));

        // Assert
        expect(result.current.loadError).toBe('Could not reach the server.');
        expect(result.current.projects).toEqual([]);
    });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=usePool`
Expected: FAIL — `Cannot find module './usePool'`.

- [x] **Step 3: Write the hook**

Create `src/client/src/hooks/usePool.js`:

```js
import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';

// The right panel's supply of schedulable work.
//
// There is no calendar endpoint behind this. `GET /api/projects` already answers
// with every project's ready frontier and the next to-do in each ready sequence,
// which is exactly what the pool is (design decision 3) — the same response the
// projects home page renders its cards from.
//
// One to-do per ready sequence, not every open to-do in it. That keeps the
// calendar honest to the app's central idea: the frontier is what you may start,
// and within a sequence that is one thing. It also means the pool refills as
// items are ticked off, which is what makes the completion bubble part of the
// planning loop rather than a dead end.
//
// Loaded separately from the calendar, and failing separately: a calendar you
// cannot schedule into is still worth reading, and a pool you cannot drag from
// is still worth seeing (design section 10).

export const POOL_STATUS = { loading: 'loading', ready: 'ready', error: 'error' };

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/**
 * A frontier entry with no `nextTodo` is a sequence that is ready but has
 * nothing that can be picked up — empty, or with every outstanding to-do
 * blocked. There is nothing to schedule, so it is left out of both the list and
 * the count.
 *
 * A project with no startable work at all is kept, because the panel still has
 * to show its name and a count of zero rather than silently vanishing.
 */
const toPoolProjects = (projects) =>
    projects.map((project) => ({
        id: project.id,
        title: project.title,
        todos: project.frontier
            .filter((entry) => entry.nextTodo)
            .map((entry) => ({
                todoId: entry.nextTodo.id,
                text: entry.nextTodo.text,
                projectId: project.id,
                projectTitle: project.title,
                sequenceId: entry.sequenceId,
                sequenceTitle: entry.sequenceTitle,
            })),
    }));

const usePool = () => {
    const [projects, setProjects] = useState([]);
    const [status, setStatus] = useState(POOL_STATUS.loading);
    const [loadError, setLoadError] = useState('');

    const load = useCallback(async () => {
        setStatus(POOL_STATUS.loading);
        setLoadError('');

        try {
            setProjects(toPoolProjects(await api.get('/projects')));
            setStatus(POOL_STATUS.ready);
        } catch (err) {
            setLoadError(messageOf(err));
            setStatus(POOL_STATUS.error);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { projects, status, loadError, reload: load };
};

export default usePool;
```

- [x] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=usePool`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/client/src/hooks/usePool.js src/client/src/hooks/usePool.test.js
git commit -m "feat(calendar): derive the schedulable pool from the project frontier"
```

**Phase C is complete.** State and data flow work end to end; nothing renders yet.

---


**Known, open, and deliberately not fixed in Phase C.** A day whose `POST
/calendar/days` commits *after* a racing `GET /calendar` was served is absent
from view until the next load: the refetch could not carry a day the server had
not stored yet. `useCalendar`'s load-generation guard does not close this — it
is not a staleness problem — and closing it needs an idempotent re-apply,
appending `saved` when it is absent from the fresh state, rather than a guard.
It self-heals on any later load, and reaching it needs the GET issued and served
strictly inside the POST's commit window. Worth closing here if the page grows a
refetch users can trigger; not worth it while the only refetch is the one a
failed mutation issues. If anything later adds polling or refetch-on-focus,
concurrent GETs stop being rare and this moves up the list.


**Phase C is complete.** The calendar loads, mutates optimistically and rolls
back, and the pool derives itself from the project frontier — with no UI at all.

# Phase D — Static rendering

Everything here renders and can be clicked. Nothing can be dragged yet — days can
be added and deleted, bookings only draw.

## Task 20: The page shell, the route and the stylesheet

**Files:**
- Create: `src/client/src/components/Calendar/CalendarPage.js`
- Create: `src/client/src/components/Styling/Calendar.css`
- Modify: `src/client/src/routes.js`
- Modify: `src/client/src/components/Navbar.js`
- Test: `src/client/src/components/Calendar/CalendarPage.test.js`
- Test: `src/client/src/routes.test.js`

**A finding from the Task 19 review — fix it as you write this.**

Step 4's page renders `ProjectPanel` inside the calendar's `ready` branch, so a
failed `/calendar` load blanks the pool too, even when `/projects` returned
fine. That contradicts design section 10 — "Either can fail alone, and each
reports its own failure in its own panel rather than failing the whole page" —
and `usePool`'s own header comment, which says a pool you cannot drag from is
still worth seeing. `ProjectPanel` already has its own loading, error and ready
branches; it is only the page that takes them away.

Half the bargain currently holds: the calendar survives a pool failure. Lift
`ProjectPanel` out of the ready branch so the other half does too. The strip
stays behind the calendar's status, since there is nothing to draw without it.

- [ ] **Step 1: Write the failing tests**

Create `src/client/src/components/Calendar/CalendarPage.test.js`:

```js
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CalendarPage', () => {
    test('shows a loading state before anything arrives', () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        renderPage();

        // Assert
        expect(screen.getByLabelText('Loading calendar…')).toBeInTheDocument();
    });

    test('offers a retry when the calendar fails to load', async () => {
        // Arrange — an empty strip and a failed load must not look alike
        api.get.mockRejectedValue(new Error('Could not reach the server.'));

        // Act
        renderPage();

        // Assert
        expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    test('retrying asks again', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('Offline'));
        renderPage();
        await screen.findByRole('button', { name: 'Try again' });
        api.get.mockResolvedValue({ days: [], items: [] });

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

        // Assert
        await waitFor(() => expect(screen.queryByText('Offline')).not.toBeInTheDocument());
    });

    test('renders the two panels once loaded', async () => {
        // Arrange
        api.get.mockImplementation((path) =>
            path === '/calendar' ? Promise.resolve({ days: [], items: [] }) : Promise.resolve([])
        );

        // Act
        renderPage();

        // Assert
        expect(await screen.findByRole('region', { name: 'Days' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Projects' })).toBeInTheDocument();
    });
});
```

Append to `src/client/src/routes.test.js` a case matching that file's existing
style, asserting `/calendar` is present and wrapped in `ProtectedRoute`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run test:client -- --testPathPattern="CalendarPage|routes"`
Expected: FAIL — `Cannot find module './CalendarPage'`.

- [ ] **Step 3: Stub the two panels**

`CalendarPage` imports both, so they have to exist before it will even parse.
Create them as one-line placeholders; Task 23 replaces `DayStrip` and Task 24
replaces `ProjectPanel`.

`src/client/src/components/Calendar/DayStrip.js`:

```js
// Temporary — replaced in Task 23.
const DayStrip = () => <section className="calendar-strip" aria-label="Days" />;
export default DayStrip;
```

`src/client/src/components/Calendar/ProjectPanel.js`:

```js
// Temporary — replaced in Task 24.
const ProjectPanel = () => <section className="calendar-panel" aria-label="Projects" />;
export default ProjectPanel;
```

- [ ] **Step 4: Write the page**

Create `src/client/src/components/Calendar/CalendarPage.js`:

```js
import React from 'react';
import { Link } from 'react-router-dom';

import DayStrip from './DayStrip';
import ProjectPanel from './ProjectPanel';
import useCalendar from '../../hooks/useCalendar';
import usePool from '../../hooks/usePool';
import { CALENDAR_STATUS } from '../../state/calendarReducer';
import { CalendarProvider } from '../../state/CalendarContext';
import '../Styling/Calendar.css';

// The calendar: a strip of day columns on the left, the pool of startable work
// on the right (design section 8).
//
// Two requests, two failure states. The calendar and the pool are loaded
// separately and each reports its own trouble in its own panel, because a
// calendar you cannot schedule into is still worth reading and a pool you cannot
// drag from is still worth seeing.
//
// A failed calendar load keeps a retry on screen rather than rendering an empty
// strip, which would be indistinguishable from a calendar with no days in it.

const CalendarPage = () => {
    const calendar = useCalendar();
    const pool = usePool();

    const { state, reload, dismissActionError } = calendar;

    const isLoading =
        state.status === CALENDAR_STATUS.idle || state.status === CALENDAR_STATUS.loading;

    return (
        <main className="calendar-page">
            <header className="calendar-header">
                <h1>Calendar</h1>
                <Link to="/projects">← All projects</Link>
            </header>

            {/* Stays mounted and toggles `hidden` rather than being conditionally
                rendered: a live region inserted into the DOM already holding its
                message is not reliably announced; one that is already there when
                the text changes is. */}
            <div className="calendar-toast" role="alert" hidden={!state.actionError}>
                <p>{state.actionError}</p>
                <button type="button" onClick={dismissActionError} aria-label="Dismiss error">
                    Dismiss
                </button>
            </div>

            {isLoading && (
                <p className="calendar-loading" role="status" aria-label="Loading calendar…">
                    Loading calendar…
                </p>
            )}

            {state.status === CALENDAR_STATUS.error && (
                <div className="calendar-error">
                    <p role="alert">{state.loadError}</p>
                    <button type="button" onClick={reload}>
                        Try again
                    </button>
                </div>
            )}

            {state.status === CALENDAR_STATUS.ready && (
                <CalendarProvider value={calendar}>
                    <div className="calendar-body">
                        <DayStrip />
                        <ProjectPanel pool={pool} />
                    </div>
                </CalendarProvider>
            )}
        </main>
    );
};

export default CalendarPage;
```

Task 25 wraps `calendar-body` in `CalendarDragArea`; leave it as it is for now.

- [ ] **Step 5: Add the route**

In `src/client/src/routes.js`, import the page and add it beside the other
protected routes:

```js
import CalendarPage from './components/Calendar/CalendarPage';
```

```js
    { path: '/calendar',     element: <ProtectedRoute><CalendarPage /></ProtectedRoute> },
```

- [ ] **Step 6: Add the nav link**

In `src/client/src/components/Navbar.js`, add a Calendar button to the profile
panel, above the Dashboard one:

```js
                        <button
                            className="industrial-button"
                            onClick={() => { navigate('/calendar'); setShowPanel(false); }}
                        >
                            Calendar
                        </button>
```

- [ ] **Step 7: Write the stylesheet**

Create `src/client/src/components/Styling/Calendar.css`. Every value comes from
the `:root` tokens in `index.css` — no hardcoded colours, spacing or radii. The
two structural rules the layout depends on:

```css
/* The page is two columns: the day strip takes the room that is left, and the
   pool is a fixed rail. Only the strip scrolls sideways. */
.calendar-body {
    display: flex;
    gap: var(--space-md);
    align-items: stretch;
    min-height: 0;
}

.calendar-strip {
    flex: 1;
    display: flex;
    gap: var(--space-sm);
    overflow-x: auto;
    align-items: flex-start;
    min-width: 0;
}

.calendar-panel {
    flex: 0 0 320px;
    position: relative; /* the remove overlay pins to this */
    overflow-y: auto;
}

/* A day column is a fixed-width card whose 24 hours scroll inside it. The fixed
   height is what makes the inner scroll exist at all. */
.day-column {
    flex: 0 0 220px;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    max-height: 70vh;
}

.day-column-scroll {
    overflow-y: auto;
    position: relative;
}

.day-grid {
    position: relative;
}

.day-item-card {
    position: absolute;
    left: var(--space-xl);
    right: var(--space-xs);
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--bg-alt);
    border-left: 3px solid var(--color-accent);
}
```

Add the rest — hour lines, gutter labels, the bubble, the drag handle, the
accordion card, the resize edges — in the same idiom as `Project.css` and
`SequenceCard.css`, referencing tokens only.

- [ ] **Step 8: Run the tests**

Run: `npm run test:client -- --testPathPattern="CalendarPage|routes"`
Expected: PASS. The two panels are still the Step 3 stubs; Tasks 21–24 fill them
in.

- [ ] **Step 9: Commit**

```bash
git add src/client/src/components/Calendar src/client/src/components/Styling/Calendar.css src/client/src/routes.js src/client/src/routes.test.js src/client/src/components/Navbar.js
git commit -m "feat(calendar): add the calendar page shell and route"
```

---

## Task 21: `DayGrid`

**Files:**
- Create: `src/client/src/components/Calendar/DayGrid.js`
- Test: `src/client/src/components/Calendar/DayGrid.test.js`

- [ ] **Step 1: Write the failing test**

```js
import React from 'react';
import { render, screen } from '@testing-library/react';

import DayGrid from './DayGrid';
import { DAY_HEIGHT_PX, SLOTS_PER_DAY } from '../../lib/scheduleGeometry';

describe('DayGrid', () => {
    test('is exactly one day tall', () => {
        // Act
        const { container } = render(<DayGrid />);

        // Assert
        expect(container.querySelector('.day-grid')).toHaveStyle(`height: ${DAY_HEIGHT_PX}px`);
    });

    test('draws one line per half hour', () => {
        // Act
        const { container } = render(<DayGrid />);

        // Assert
        expect(container.querySelectorAll('.day-grid-slot')).toHaveLength(SLOTS_PER_DAY);
    });

    test('labels every hour from 00:00 to 23:00', () => {
        // Act
        const { container } = render(<DayGrid />);

        // Assert
        const labels = [...container.querySelectorAll('.day-grid-hour')].map(
            (node) => node.textContent
        );
        expect(labels).toHaveLength(24);
        expect(labels[0]).toBe('00:00');
        expect(labels[23]).toBe('23:00');
    });

    test('renders the bookings it is given over the grid', () => {
        // Act
        render(
            <DayGrid>
                <div>Wire up the token refresh</div>
            </DayGrid>
        );

        // Assert
        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=DayGrid`
Expected: FAIL — `Cannot find module './DayGrid'`.

- [ ] **Step 3: Write the component**

```js
import React from 'react';

import { DAY_HEIGHT_PX, SLOTS_PER_DAY, hourLabels, minutesToPx } from '../../lib/scheduleGeometry';

// The backdrop of one day: an hour gutter down the side and a half-hour rule
// across it, exactly one day tall.
//
// Purely decorative, and marked so. The grid is not a set of drop targets — a
// column is one droppable and the minute is worked out from where the pointer
// actually is (Task 25), which is both 48 fewer droppables per day and the only
// way a drop can land on a boundary the eye can see. Announcing 48 empty
// gridlines to a screen reader would be noise.
//
// Bookings are rendered as children, positioned absolutely over this.

const DayGrid = ({ children }) => (
    <div className="day-grid" style={{ height: `${DAY_HEIGHT_PX}px` }}>
        <div className="day-grid-gutter" aria-hidden="true">
            {hourLabels().map(({ minutes, label }) => (
                <div
                    key={minutes}
                    className="day-grid-hour"
                    style={{ top: `${minutesToPx(minutes)}px` }}
                >
                    {label}
                </div>
            ))}
        </div>

        <div className="day-grid-rules" aria-hidden="true">
            {Array.from({ length: SLOTS_PER_DAY }, (unused, slot) => (
                <div
                    key={slot}
                    className={`day-grid-slot${slot % 2 === 0 ? ' day-grid-slot--hour' : ''}`}
                />
            ))}
        </div>

        {children}
    </div>
);

export default DayGrid;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=DayGrid`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Calendar/DayGrid.js src/client/src/components/Calendar/DayGrid.test.js
git commit -m "feat(calendar): draw the 24-hour half-hour grid"
```

---

## Task 22: `DayItemCard`

**Files:**
- Create: `src/client/src/components/Calendar/DayItemCard.js`
- Test: `src/client/src/components/Calendar/DayItemCard.test.js`

Static for now: bubble, drag graphic, name. The graphic becomes a real handle in
Task 27 and the resize edges arrive in Task 26.

- [ ] **Step 1: Write the failing test**

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayItemCard from './DayItemCard';
import { minutesToPx } from '../../lib/scheduleGeometry';

const item = (overrides = {}) => ({
    todoId: 12,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    text: 'Wire up the token refresh',
    status: 'incomplete',
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 9,
    sequenceTitle: 'Session handling',
    ...overrides,
});

const renderCard = (overrides = {}, handlers = {}) =>
    render(
        <DayItemCard
            item={item(overrides)}
            onComplete={handlers.onComplete ?? jest.fn()}
            onOpenSource={handlers.onOpenSource ?? jest.fn()}
        />
    );

describe('DayItemCard', () => {
    test('sits at its start time and is as tall as its duration', () => {
        // Act
        const { container } = renderCard();

        // Assert
        const card = container.querySelector('.day-item-card');
        expect(card).toHaveStyle(`top: ${minutesToPx(540)}px`);
        expect(card).toHaveStyle(`height: ${minutesToPx(60)}px`);
    });

    test('shows the span it occupies', () => {
        renderCard();

        expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
    });

    test('reads the end of a day as 24:00', () => {
        renderCard({ startMinutes: 1380, durationMinutes: 60 });

        expect(screen.getByText('23:00–24:00')).toBeInTheDocument();
    });

    test('the bubble completes the to-do', async () => {
        // Arrange
        const onComplete = jest.fn();
        renderCard({}, { onComplete });

        // Act
        await userEvent.click(
            screen.getByRole('button', { name: 'Complete “Wire up the token refresh”' })
        );

        // Assert
        expect(onComplete).toHaveBeenCalledWith(12);
    });

    test('a completed item stays put, struck through, with an inert bubble', () => {
        // Arrange + Act
        const { container } = renderCard({ status: 'complete' });

        // Assert
        expect(container.querySelector('.day-item-card--complete')).toBeInTheDocument();
        expect(container.querySelector('.day-item-card')).toHaveStyle(
            `top: ${minutesToPx(540)}px`
        );
        expect(screen.getByRole('button', { name: /Completed/ })).toBeDisabled();
    });

    test('the name opens the sequence it came from', async () => {
        // Arrange
        const onOpenSource = jest.fn();
        renderCard({}, { onOpenSource });

        // Act — an exact string, not a regex: the bubble's accessible name is
        // `Complete “Wire up the token refresh”` and a substring match would
        // find both buttons.
        await userEvent.click(screen.getByRole('button', { name: 'Wire up the token refresh' }));

        // Assert
        expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ todoId: 12 }));
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=DayItemCard`
Expected: FAIL — `Cannot find module './DayItemCard'`.

- [ ] **Step 3: Write the component**

```js
import React from 'react';

import { formatTime, minutesToPx } from '../../lib/scheduleGeometry';

// One booking, drawn over the grid at the minute it starts and as tall as it
// lasts (design section 8).
//
// Three controls, and each answers a different question about the same to-do:
// the bubble finishes it, the graphic moves it, the name says where it came from.
//
// Ticking does not move the card. The point of completing something on a
// calendar is to see what the day actually looked like, and a card that jumped
// to a "done" pile would take that away — so the item stays exactly where it is
// and is struck through.
//
// The bubble only ever completes. Un-ticking is a project-page action: the pool
// here offers a sequence's *next* step, so a to-do un-ticked on the calendar
// would have nowhere coherent to reappear, and the card would be claiming to
// schedule work the frontier no longer offers.

const TODO_COMPLETE = 'complete';

// `resize` is `{ top, bottom }`, each the return of `useResizeEdge` (Task 26).
// Null until then, which is why the edges are absent in this task's tests.
const DayItemCard = ({ item, onComplete, onOpenSource, drag = null, resize = null }) => {
    const isComplete = item.status === TODO_COMPLETE;

    const className = ['day-item-card', isComplete ? 'day-item-card--complete' : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={className}
            style={{
                top: `${minutesToPx(item.startMinutes)}px`,
                height: `${minutesToPx(item.durationMinutes)}px`,
            }}
            ref={drag?.setNodeRef}
        >
            {resize && (
                <span
                    className="day-item-edge day-item-edge--top"
                    role="separator"
                    aria-label={`Change when “${item.text}” starts`}
                    {...resize.top.handleProps}
                />
            )}

            <div className="day-item-row">
                {isComplete ? (
                    <button
                        type="button"
                        className="day-item-bubble day-item-bubble--done"
                        aria-label={`Completed “${item.text}”`}
                        disabled
                        title="Un-tick this on its project page"
                    />
                ) : (
                    <button
                        type="button"
                        className="day-item-bubble"
                        aria-label={`Complete “${item.text}”`}
                        onClick={() => onComplete(item.todoId)}
                    />
                )}

                {drag ? (
                    <button
                        type="button"
                        className="day-item-handle"
                        aria-label={`Move “${item.text}”`}
                        {...drag.handleProps}
                    >
                        ⠿
                    </button>
                ) : (
                    <span className="day-item-handle" aria-hidden="true">
                        ⠿
                    </span>
                )}

                <button
                    type="button"
                    className="day-item-name"
                    onClick={() => onOpenSource(item)}
                >
                    {item.text}
                </button>
            </div>

            <span className="day-item-time">
                {formatTime(item.startMinutes)}–
                {formatTime(item.startMinutes + item.durationMinutes)}
            </span>

            {resize && (
                <span
                    className="day-item-edge day-item-edge--bottom"
                    role="separator"
                    aria-label={`Change how long “${item.text}” takes`}
                    {...resize.bottom.handleProps}
                />
            )}
        </div>
    );
};

export default DayItemCard;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=DayItemCard`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Calendar/DayItemCard.js src/client/src/components/Calendar/DayItemCard.test.js
git commit -m "feat(calendar): draw a booking as a card in its day"
```

---

## Task 23: `DayColumn` and `DayStrip`

**Files:**
- Create: `src/client/src/components/Calendar/DayColumn.js`
- Replace: `src/client/src/components/Calendar/DayStrip.js` (the Task 20 placeholder)
- Test: `src/client/src/components/Calendar/DayColumn.test.js`
- Test: `src/client/src/components/Calendar/DayStrip.test.js`

**Gate the `+` on `hasUnsavedDay`.** `useCalendar` exposes it so the strip can
disable the button while a day is still waiting for its id. Clicking `+` twice
before the first POST lands is the interleaving Task 18's defect 1 describes,
and the flag is the half of that fix which lives here. Disable the button and
say why in a `title`, rather than dropping the second click silently.

- [ ] **Step 1: Write the failing tests**

**Gate the `+` on `hasUnsavedDay`.** `useCalendar` exposes it so the strip can
disable the button while a day is still waiting for its id. Clicking `+` twice
before the first POST lands is the interleaving Task 18's defect 1 describes,
and the flag is the half of that fix which lives here. Disable the button and
say why in a `title`, rather than dropping the second click silently.

**Gate the `+` on `hasUnsavedDay`.** `useCalendar` exposes it so the strip can
disable the button while a day is still waiting for its id. Clicking `+` twice
before the first POST lands is the interleaving Task 18's defect 1 describes,
and the flag is the half of that fix which lives here. Disable the button and
say why in a `title`, rather than dropping the second click silently.

`DayColumn.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DayColumn from './DayColumn';
import { CalendarProvider } from '../../state/CalendarContext';
import { INITIAL_SCROLL_MINUTES, minutesToPx } from '../../lib/scheduleGeometry';

const day = { id: 4, position: 0, createdAt: '2026-09-09T08:30:00.000Z' };

const booking = {
    todoId: 12,
    dayId: 4,
    startMinutes: 540,
    durationMinutes: 60,
    text: 'Wire up the token refresh',
    status: 'incomplete',
    projectId: 2,
    sequenceId: 9,
};

const renderColumn = (items = [], calendar = {}) => {
    const value = {
        deleteDay: jest.fn(),
        completeTodo: jest.fn(),
        isUnsavedDay: () => false,
        state: { days: [day], items },
        ...calendar,
    };

    const rendered = render(
        <CalendarProvider value={value}>
            <DayColumn day={day} index={0} items={items} onOpenSource={jest.fn()} />
        </CalendarProvider>
    );

    return { ...rendered, value };
};

describe('DayColumn', () => {
    test('names itself by its place in the strip and stamps when it was made', () => {
        renderColumn();

        expect(screen.getByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    test('opens scrolled to 06:00', () => {
        // Arrange — jsdom has no layout, so an element never grows a scrolling
        // box and reading `scrollTop` back always answers 0 however it was set.
        // Spy on the assignment instead: what is under test is that the column
        // scrolls itself to 06:00 on mount, not that jsdom models scrolling.
        const scrolled = [];
        const descriptor = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'scrollTop'
        );
        Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            get: () => 0,
            set(value) {
                scrolled.push(value);
            },
        });

        try {
            // Act
            renderColumn();

            // Assert
            expect(scrolled).toContain(minutesToPx(INITIAL_SCROLL_MINUTES));
        } finally {
            Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', descriptor);
        }
    });

    test('renders its bookings', () => {
        renderColumn([booking]);

        expect(screen.getByText('Wire up the token refresh')).toBeInTheDocument();
    });

    test('deletes an empty day without asking', async () => {
        // Arrange
        const { value } = renderColumn([]);

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete Day 1' }));

        // Assert
        expect(value.deleteDay).toHaveBeenCalledWith(4);
    });

    test('asks before deleting a day that holds work, and says how much', async () => {
        // Arrange
        const { value } = renderColumn([booking]);

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete Day 1' }));

        // Assert
        expect(screen.getByText(/1 booking/)).toBeInTheDocument();
        expect(value.deleteDay).not.toHaveBeenCalled();
    });

    test('offers no delete on a day the server has not stored yet', () => {
        // Arrange + Act
        renderColumn([], { isUnsavedDay: () => true });

        // Assert
        expect(screen.queryByRole('button', { name: 'Delete Day 1' })).not.toBeInTheDocument();
    });

    test('confirming the prompt deletes it', async () => {
        // Arrange
        const { value } = renderColumn([booking]);
        await userEvent.click(screen.getByRole('button', { name: 'Delete Day 1' }));

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Delete day/ }));

        // Assert
        expect(value.deleteDay).toHaveBeenCalledWith(4);
    });
});
```

`DayStrip.test.js` covers: days render left to right; the + calls `addDay`; an
empty calendar shows an invitation rather than a bare strip.

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run test:client -- --testPathPattern="DayColumn|DayStrip"`
Expected: FAIL — `Cannot find module './DayColumn'`.

- [ ] **Step 3: Write `DayColumn`**

```js
import React, { useEffect, useRef, useState } from 'react';

import ConfirmDialog from '../Project/ConfirmDialog';
import DayGrid from './DayGrid';
import DayItemCard from './DayItemCard';
import DeleteBubble from '../common/DeleteBubble';
import { INITIAL_SCROLL_MINUTES, minutesToPx } from '../../lib/scheduleGeometry';
import { useCalendarContext } from '../../state/CalendarContext';

// One day: a header, a delete control, and 24 hours that scroll inside it.
//
// The inner scroll is what makes the side-by-side layout work at all. A day is
// 1152px tall at a readable scale, so a strip of full-height columns would put
// the whole page inside one enormous scroll; giving each column its own keeps
// adjacent days adjacent, which matters because the overflow rule is constantly
// moving work between them (design decision 9).
//
// It opens at 06:00 rather than midnight: the top six hours of most days are
// empty, and starting there would mean scrolling before anything can be done.
//
// A day has no name. Its header is where it sits and when it was made, which is
// what a day *is* here — an ordered container, not a date (design decision 2).

const DayColumn = ({ day, index, items, onOpenSource, droppable = null, children }) => {
    const { deleteDay, completeTodo, isUnsavedDay } = useCalendarContext();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const scrollRef = useRef(null);

    const label = `Day ${index + 1}`;

    // Once, on mount. Re-applying it on every render would yank the column back
    // to 06:00 every time a booking moved.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = minutesToPx(INITIAL_SCROLL_MINUTES);
        }
    }, []);

    // Deleting an empty day releases nothing, so it does not warrant a prompt —
    // the same rule `LayerRow` applies to an empty layer.
    const requestDelete = () => {
        if (items.length > 0) {
            setIsConfirmingDelete(true);
            return;
        }

        deleteDay(day.id);
    };

    const confirmDelete = () => {
        setIsConfirmingDelete(false);
        deleteDay(day.id);
    };

    const deleteMessage =
        `Its ${items.length} booking${items.length === 1 ? '' : 's'} ` +
        'will be released. The to-dos are not deleted — they return to the ' +
        'project panel, ready to be scheduled again.';

    return (
        <section className="day-column has-delete-bubble" aria-label={label}>
            <header className="day-column-header">
                <h2 className="day-column-title">{label}</h2>
                <time className="day-column-stamp" dateTime={day.createdAt}>
                    {new Date(day.createdAt).toLocaleString()}
                </time>
            </header>

            {/* A day the server has not stored yet has no id to address, so
                `DELETE /calendar/days/-1` would come back a 400 and roll the
                column back into existence. The × appears once the save lands,
                which for a day the + created is the very next tick. */}
            {!isUnsavedDay(day.id) && (
                <DeleteBubble label={`Delete ${label}`} onDelete={requestDelete} />
            )}

            <div className="day-column-scroll" ref={scrollRef}>
                <div ref={droppable?.setNodeRef} className={droppable?.className}>
                    <DayGrid>
                        {items.map((item) => (
                            <DayItemCard
                                key={item.todoId}
                                item={item}
                                onComplete={completeTodo}
                                onOpenSource={onOpenSource}
                            />
                        ))}
                        {children}
                    </DayGrid>
                </div>
            </div>

            {isConfirmingDelete && (
                <ConfirmDialog
                    title={`Delete ${label}?`}
                    message={deleteMessage}
                    confirmLabel="Delete day and release its bookings"
                    onConfirm={confirmDelete}
                    onCancel={() => setIsConfirmingDelete(false)}
                />
            )}
        </section>
    );
};

export default DayColumn;
```

`droppable` and `children` are the seams Task 25 uses; they are null until then.

- [ ] **Step 4: Write `DayStrip`, replacing the placeholder**

```js
import React from 'react';

import DayColumn from './DayColumn';
import { useCalendarContext } from '../../state/CalendarContext';

// The strip of days, left to right, scrolling sideways as it grows — the same
// treatment the 2026-09-07 spec gave layers, and for the same reason: columns
// that squeezed to fit would stop being readable at the fourth one.
//
// Days are already in order in the state, because the calendar keeps them as a
// list rather than keyed by id. Nothing here sorts.

const DayStrip = ({ onOpenSource, columnFor = null }) => {
    const { state, addDay } = useCalendarContext();

    const itemsOf = (dayId) => state.items.filter((item) => item.dayId === dayId);

    if (state.days.length === 0) {
        return (
            <section className="calendar-strip calendar-strip--empty" aria-label="Days">
                <p>No days yet.</p>
                <p>A day is one 24-hour slab to schedule work into.</p>
                <button type="button" onClick={addDay}>
                    Add the first day
                </button>
            </section>
        );
    }

    return (
        <section className="calendar-strip" aria-label="Days">
            {state.days.map((day, index) =>
                columnFor ? (
                    columnFor(day, index, itemsOf(day.id))
                ) : (
                    <DayColumn
                        key={day.id}
                        day={day}
                        index={index}
                        items={itemsOf(day.id)}
                        onOpenSource={onOpenSource}
                    />
                )
            )}

            <button
                type="button"
                className="calendar-strip-add"
                aria-label="Add a day"
                onClick={addDay}
            >
                +
            </button>
        </section>
    );
};

export default DayStrip;
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:client -- --testPathPattern="DayColumn|DayStrip"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Calendar/DayColumn.js src/client/src/components/Calendar/DayStrip.js src/client/src/components/Calendar/DayColumn.test.js src/client/src/components/Calendar/DayStrip.test.js
git commit -m "feat(calendar): render the day strip with add and delete"
```

---

## Task 24: The pool panel

**Files:**
- Create: `src/client/src/components/Calendar/ProjectAccordionCard.js`
- Create: `src/client/src/components/Calendar/PanelTodoRow.js`
- Replace: `src/client/src/components/Calendar/ProjectPanel.js` (the Task 20 placeholder)
- Test: `src/client/src/components/Calendar/ProjectPanel.test.js`

- [ ] **Step 1: Write the failing test**

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProjectPanel from './ProjectPanel';
import { POOL_STATUS } from '../../hooks/usePool';

const todo = (todoId, text) => ({
    todoId,
    text,
    projectId: 2,
    projectTitle: 'Auth rewrite',
    sequenceId: 9,
    sequenceTitle: 'Session handling',
});

const pool = {
    status: POOL_STATUS.ready,
    loadError: '',
    reload: jest.fn(),
    projects: [
        { id: 2, title: 'Auth rewrite', todos: [todo(12, 'Refresh tokens'), todo(13, 'Rotate keys')] },
        { id: 3, title: 'Quiet project', todos: [] },
    ],
};

const renderPanel = (scheduled = []) =>
    render(<ProjectPanel pool={pool} scheduledByTodoId={new Map(scheduled)} />);

describe('ProjectPanel', () => {
    test('a collapsed card shows the project and its unscheduled count', () => {
        renderPanel();

        expect(screen.getByRole('button', { name: /Auth rewrite/ })).toHaveTextContent('2');
    });

    test('the count leaves out work that is already booked', () => {
        // Arrange — decision 5: the count measures planning progress
        renderPanel([[12, { dayIndex: 0 }]]);

        // Assert
        expect(screen.getByRole('button', { name: /Auth rewrite/ })).toHaveTextContent('1');
    });

    test('a click anywhere on the card expands it', async () => {
        // Arrange
        renderPanel();
        expect(screen.queryByText('Refresh tokens')).not.toBeInTheDocument();

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        // Assert
        expect(screen.getByText('Refresh tokens')).toBeInTheDocument();
        expect(screen.getByText('Rotate keys')).toBeInTheDocument();
    });

    test('clicking again collapses it', async () => {
        // Arrange
        renderPanel();
        const card = screen.getByRole('button', { name: /Auth rewrite/ });
        await userEvent.click(card);

        // Act
        await userEvent.click(card);

        // Assert
        expect(screen.queryByText('Refresh tokens')).not.toBeInTheDocument();
    });

    test('a scheduled row is shown with its day and is not draggable', async () => {
        // Arrange — decision 4
        renderPanel([[12, { dayIndex: 0 }]]);

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Auth rewrite/ }));

        // Assert
        const row = screen.getByText('Refresh tokens').closest('.panel-todo-row');
        expect(row).toHaveClass('panel-todo-row--scheduled');
        expect(row).toHaveTextContent('Day 1');
        expect(row.querySelector('[draggable="true"]')).toBeNull();
    });

    test('a project with nothing startable says so rather than vanishing', async () => {
        // Arrange
        renderPanel();

        // Act
        await userEvent.click(screen.getByRole('button', { name: /Quiet project/ }));

        // Assert
        expect(screen.getByText(/Nothing startable/)).toBeInTheDocument();
    });

    test('a failed pool load offers a retry inside the panel', () => {
        // Arrange + Act
        render(
            <ProjectPanel
                pool={{ ...pool, status: POOL_STATUS.error, loadError: 'Offline', projects: [] }}
                scheduledByTodoId={new Map()}
            />
        );

        // Assert
        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=ProjectPanel`
Expected: FAIL — the placeholder renders an empty section.

- [ ] **Step 3: Write `PanelTodoRow`**

```js
import React from 'react';

// One schedulable to-do in the pool.
//
// Draggable while unscheduled; inert once booked, carrying the day it went to
// (design decision 4). The row stays listed either way, so the panel remains a
// complete answer to "where did this go" — but a booking is moved by grabbing it
// in the day itself, which keeps exactly one gesture per outcome.

const PanelTodoRow = ({ todo, scheduled = null, drag = null }) => {
    const className = ['panel-todo-row', scheduled ? 'panel-todo-row--scheduled' : '']
        .filter(Boolean)
        .join(' ');

    if (scheduled) {
        return (
            <li className={className}>
                <span className="panel-todo-text">{todo.text}</span>
                <span className="panel-todo-badge">Day {scheduled.dayIndex + 1}</span>
            </li>
        );
    }

    return (
        <li className={className} ref={drag?.setNodeRef} style={drag?.style}>
            <span
                className="panel-todo-grip"
                draggable={drag ? true : undefined}
                aria-hidden={drag ? undefined : 'true'}
                {...(drag?.handleProps ?? {})}
            >
                ⠿
            </span>
            <span className="panel-todo-text">{todo.text}</span>
            <span className="panel-todo-sequence">{todo.sequenceTitle}</span>
        </li>
    );
};

export default PanelTodoRow;
```

- [ ] **Step 4: Write `ProjectAccordionCard`**

```js
import React, { useState } from 'react';

import PanelTodoRow from './PanelTodoRow';

// One project in the pool, folded or open.
//
// Folded it shows a name and a count of unscheduled work; open it shows the same
// header and the rows. A click anywhere on the header toggles it — there is no
// hover behaviour, deliberately: the panel is a drag source, and a card that
// opened under the pointer during a drag would move the very rows being aimed at.
//
// The count is unscheduled work only. It measures planning progress — how much
// startable work is still unbooked — and ticks down as days fill (decision 5).
//
// Whether a card is open is browser-local and not persisted. Unlike a sequence
// card's `is_collapsed`, nothing here is worth a column: the pool is rebuilt from
// the frontier on every visit anyway.

const ProjectAccordionCard = ({ project, scheduledByTodoId, dragFor = null }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const unscheduledCount = project.todos.filter(
        (todo) => !scheduledByTodoId.has(todo.todoId)
    ).length;

    return (
        <li className={`pool-card${isExpanded ? ' pool-card--expanded' : ''}`}>
            <button
                type="button"
                className="pool-card-header"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
            >
                <span className="pool-card-title">{project.title}</span>
                <span className="pool-card-count">{unscheduledCount}</span>
            </button>

            {isExpanded &&
                (project.todos.length === 0 ? (
                    <p className="pool-card-empty">Nothing startable in this project.</p>
                ) : (
                    <ul className="pool-card-todos">
                        {project.todos.map((todo) => (
                            <PanelTodoRow
                                key={todo.todoId}
                                todo={todo}
                                scheduled={scheduledByTodoId.get(todo.todoId) ?? null}
                                drag={dragFor ? dragFor(todo) : null}
                            />
                        ))}
                    </ul>
                ))}
        </li>
    );
};

export default ProjectAccordionCard;
```

- [ ] **Step 5: Write `ProjectPanel`, replacing the placeholder**

```js
import React from 'react';

import ProjectAccordionCard from './ProjectAccordionCard';
import { POOL_STATUS } from '../../hooks/usePool';

// The right panel: every project, with the work it says can be started now.
//
// Its own loading and failure states rather than the page's. The calendar and
// the pool are separate requests and either can fail alone; a calendar you cannot
// schedule into is still worth reading (design section 10).
//
// `scheduledByTodoId` maps a to-do id to where it was booked. It comes from the
// calendar rather than from here, because the pool has no idea what a day is.

const ProjectPanel = ({ pool, scheduledByTodoId, dragFor = null, overlay = null }) => (
    <section className="calendar-panel" aria-label="Projects">
        {overlay}

        {pool.status === POOL_STATUS.loading && (
            <p className="pool-loading" role="status" aria-label="Loading projects…">
                Loading projects…
            </p>
        )}

        {pool.status === POOL_STATUS.error && (
            <div className="pool-error">
                <p role="alert">{pool.loadError}</p>
                <button type="button" onClick={pool.reload}>
                    Try again
                </button>
            </div>
        )}

        {pool.status === POOL_STATUS.ready &&
            (pool.projects.length === 0 ? (
                <p className="pool-empty">No projects yet.</p>
            ) : (
                <ul className="pool-cards">
                    {pool.projects.map((project) => (
                        <ProjectAccordionCard
                            key={project.id}
                            project={project}
                            scheduledByTodoId={scheduledByTodoId}
                            dragFor={dragFor}
                        />
                    ))}
                </ul>
            ))}
    </section>
);

export default ProjectPanel;
```

- [ ] **Step 6: Feed the panel from the calendar**

In `CalendarPage.js`, build the map and pass it down:

```js
    // Where each booked to-do went, for the pool's badges and its count. Built
    // here because the pool has no idea what a day is.
    const scheduledByTodoId = new Map(
        state.items.map((item) => [
            item.todoId,
            { dayIndex: state.days.findIndex((day) => day.id === item.dayId) },
        ])
    );
```

```jsx
                        <ProjectPanel pool={pool} scheduledByTodoId={scheduledByTodoId} />
```

- [ ] **Step 7: Run the tests**

Run: `npm run test:client -- --testPathPattern="ProjectPanel|CalendarPage"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/client/src/components/Calendar
git commit -m "feat(calendar): add the accordion pool of startable work"
```

**Phase D is complete.** The page renders, days can be added and deleted, and
bookings created by `curl` show up in the right columns.

---

# Phase E — Interactions

## Task 25: Dragging — pool into a day, and between days

**Files:**
- Create: `src/client/src/components/Calendar/CalendarDragArea.js`
- Modify: `src/client/src/components/Calendar/CalendarPage.js`
- Modify: `src/client/src/components/Calendar/DayStrip.js`
- Test: `src/client/src/components/Calendar/CalendarDragArea.test.js`

**Wire the gate `useCalendar` exposes.** `hasUnsavedDay` exists precisely so
this file can disable the drop targets while a day is waiting for its id —
without it, defect 1 of Task 18 ships with only the backstop throw, which is
the failure it describes: a drag that dies with nothing on screen. Read it
from the context and gate the droppables on it.

**A finding from the Task 17 review — fix it as you write this.**

`const shown = preview ?? scheduleOf(state)` followed by
`useMemo(..., [shown])` never hits when no drag is in flight, which is the
common case: `scheduleOf` returns a fresh wrapper object on every call, so the
memo rebuilds the whole `Map` — with a `findIndex` per item, O(items × days) —
on every render.

`scheduleOf`'s freshness is correct and deliberate: a rollback snapshot must
not be aliased to future state. The fix is on this side. Depend on
`[shown.days, shown.items]`, which are the stable references the reducer and
`lib/schedule` both work to preserve, rather than on the wrapper around them.

Booking from the pool and moving a booking between days are the same operation —
"put this to-do at this minute of this day" — so they share one code path.
`lib/schedule` already distinguishes them: `placeFromPool` for a to-do with no
booking, `moveItem` for one that has one.

**Two design notes that decide the shape of this file:**

*A column is one droppable, not 48.* The minute is worked out from where the
dragged card's top edge actually is, relative to the column's grid. Forty-eight
droppables per day would be four hundred for a week's strip, and would still snap
to a slot's centre rather than to its edge.

*The preview is the cascade, run live.* Every pointer move recomputes the whole
settled schedule and renders from that instead of from state. So what the user
sees during a drag is produced by exactly the function that will be saved on
release — not an approximation of it.

- [ ] **Step 1: Give `DayStrip` a schedule to render from**

Change its signature so a drag can hand it a preview:

```js
const DayStrip = ({ schedule = null, onOpenSource, columnFor = null }) => {
    const { state, addDay } = useCalendarContext();
    const shown = schedule ?? state;

    const itemsOf = (dayId) => shown.items.filter((item) => item.dayId === dayId);
```

and replace `state.days` with `shown.days` in the empty check and the map. Run
`npm run test:client -- --testPathPattern=DayStrip` — it should still pass, since
`schedule` defaults to the context.

- [ ] **Step 2: Write the failing test**

Create `src/client/src/components/Calendar/CalendarDragArea.test.js`. Pointer
drags cannot be simulated meaningfully in jsdom, so this covers the pure seams —
the exported helpers — and leaves the gesture itself to the E2E suite:

```js
import {
    dragKindOf,
    minutesAtRect,
    previewFor,
    withStableTempDays,
} from './CalendarDragArea';

const day = (id, position) => ({ id, position, createdAt: '2026-09-09T08:00:00.000Z' });

const booking = (todoId, dayId, startMinutes, durationMinutes = 60) => ({
    todoId,
    dayId,
    startMinutes,
    durationMinutes,
});

describe('dragKindOf', () => {
    test('tells a pool row from a booking', () => {
        expect(dragKindOf({ poolTodo: { todoId: 1 } })).toBe('pool');
        expect(dragKindOf({ bookingTodoId: 1 })).toBe('booking');
        expect(dragKindOf({})).toBeNull();
        expect(dragKindOf(undefined)).toBeNull();
    });
});

describe('minutesAtRect', () => {
    test('reads the minute off the card’s top edge and snaps it', () => {
        // Arrange — the grid starts at y=100; 24px is one 30-minute slot
        const grid = { top: 100 };

        // Act + Assert
        expect(minutesAtRect({ top: 100 }, grid)).toBe(0);
        expect(minutesAtRect({ top: 124 }, grid)).toBe(30);
        expect(minutesAtRect({ top: 532 }, grid)).toBe(540);
    });

    test('clamps a card dragged above the top or below the bottom', () => {
        const grid = { top: 100 };

        expect(minutesAtRect({ top: -500 }, grid)).toBe(0);
        expect(minutesAtRect({ top: 99999 }, grid)).toBe(1410);
    });
});

describe('previewFor', () => {
    test('books an unbooked to-do for an hour', () => {
        // Arrange
        const schedule = { days: [day(1, 0)], items: [] };

        // Act
        const next = previewFor(schedule, {
            kind: 'pool',
            todo: { todoId: 7, text: 'Refresh tokens', projectId: 2, sequenceId: 9 },
            dayId: 1,
            startMinutes: 540,
        });

        // Assert
        expect(next.items).toEqual([
            expect.objectContaining({ todoId: 7, dayId: 1, startMinutes: 540, durationMinutes: 60 }),
        ]);
    });

    test('moves a booking and pushes what it lands on', () => {
        // Arrange
        const schedule = { days: [day(1, 0)], items: [booking(7, 1, 540), booking(8, 1, 660)] };

        // Act
        const next = previewFor(schedule, {
            kind: 'booking',
            todo: { todoId: 8 },
            dayId: 1,
            startMinutes: 540,
        });

        // Assert
        expect(
            next.items
                .slice()
                .sort((a, b) => a.startMinutes - b.startMinutes)
                .map((item) => [item.todoId, item.startMinutes])
        ).toEqual([
            [8, 540],
            [7, 600],
        ]);
    });

    test('returns the schedule untouched when there is no target', () => {
        // Arrange
        const schedule = { days: [day(1, 0)], items: [] };

        // Act + Assert — a drag over nothing previews nothing
        expect(previewFor(schedule, null)).toBe(schedule);
    });
});

describe('withStableTempDays', () => {
    test('keeps the previous frame’s id for a day the spill re-created', () => {
        // Arrange — two frames of the same drag, each spilling into a new day
        const previous = { days: [day(1, 0), day(-1, 1)], items: [booking(7, -1, 0)] };
        const next = { days: [day(1, 0), day(-2, 1)], items: [booking(7, -2, 0)] };

        // Act
        const stable = withStableTempDays(previous, next);

        // Assert — the React key does not change between frames
        expect(stable.days[1].id).toBe(-1);
        expect(stable.items[0].dayId).toBe(-1);
    });

    test('leaves saved days alone', () => {
        // Arrange
        const previous = { days: [day(1, 0)], items: [] };
        const next = { days: [day(1, 0)], items: [booking(7, 1, 540)] };

        // Act + Assert
        expect(withStableTempDays(previous, next)).toBe(next);
    });

    test('passes the first frame straight through', () => {
        // Arrange
        const next = { days: [day(1, 0), day(-1, 1)], items: [] };

        // Act + Assert
        expect(withStableTempDays(null, next)).toBe(next);
    });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=CalendarDragArea`
Expected: FAIL — `Cannot find module './CalendarDragArea'`.

- [ ] **Step 4: Write the drag area**

```js
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';

import DayColumn from './DayColumn';
import DayStrip from './DayStrip';
import ProjectPanel from './ProjectPanel';
import RemoveOverlay from './RemoveOverlay';
import { DEFAULT_DURATION, moveItem, placeFromPool } from '../../lib/schedule';
import { clampStart, pxToMinutes } from '../../lib/scheduleGeometry';
import { isTempId } from '../../lib/tempIds';
import { scheduleOf } from '../../state/calendarReducer';
import { useCalendarContext } from '../../state/CalendarContext';

// Everything that can be dragged on this page, and what a drop means.
//
// Two things are dragged and they end in the same place: a row from the pool,
// which has no booking yet, and a booking already in a day. `lib/schedule` tells
// them apart — `placeFromPool` refuses a to-do that is already booked, `moveItem`
// refuses one that is not — so this file only has to say which is which.
//
// A day column is ONE droppable rather than one per half-hour slot. The minute
// comes from where the dragged card's top edge actually is, measured against the
// column's grid. Forty-eight droppables a day would be hundreds across a strip,
// and would snap to a slot's centre rather than its edge, so a card would never
// line up with the rule the user aimed at.
//
// The preview is the real thing. Every pointer move recomputes the whole settled
// schedule with the same function that will be saved on release, and the strip
// renders from that. There is no separate "what it would look like" code to drift
// from what actually happens.
//
// Nothing reaches the reducer until the drop: a drag in progress has changed
// nothing, and Escape or a release over nothing leaves the calendar as it was.

const POINTER_ACTIVATION_DISTANCE_PX = 5;

const POINTER_SENSOR_OPTIONS = {
    activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
};

export const DRAG_KIND = { pool: 'pool', booking: 'booking' };

/** What was lifted, read off the data the draggable carries. */
export const dragKindOf = (activeData) => {
    if (activeData?.poolTodo !== undefined) return DRAG_KIND.pool;
    if (activeData?.bookingTodoId !== undefined) return DRAG_KIND.booking;

    return null;
};

/**
 * The minute a card's top edge is over, snapped to the grid.
 *
 * The top edge rather than the pointer: it is the edge the user is lining up
 * against the rule, and for a booking being moved it is literally the value being
 * set. `getBoundingClientRect` already accounts for the column's inner scroll,
 * so no scroll offset is added here.
 */
export const minutesAtRect = (activeRect, gridRect) =>
    clampStart(pxToMinutes(activeRect.top - gridRect.top));

/**
 * The schedule as it would be if the drag were released now. Null target — the
 * pointer is over no column — previews nothing and returns the input unchanged.
 */
export const previewFor = (schedule, target) => {
    if (!target) return schedule;

    const { kind, todo, dayId, startMinutes } = target;

    return kind === DRAG_KIND.pool
        ? placeFromPool(schedule, {
              ...todo,
              dayId,
              startMinutes,
              durationMinutes: DEFAULT_DURATION,
          })
        : moveItem(schedule, { todoId: todo.todoId, dayId, startMinutes });
};

/**
 * Re-uses the previous frame's temporary day ids for this frame's.
 *
 * A preview is recomputed from scratch on every pointer move, and a drag near
 * the bottom of the last day spills — so `spillFrom` mints a *fresh* negative id
 * each time. Those ids are React keys: without this, the appended column would
 * unmount and remount on every frame of the drag, losing its scroll position and
 * flickering, and the id counter would run away for the length of the gesture.
 *
 * Temporary days are only ever appended, in order, so matching them up by
 * position is exact. Days the server has already saved are left alone.
 */
export const withStableTempDays = (previousPreview, next) => {
    if (!previousPreview) return next;

    const before = previousPreview.days.filter((day) => isTempId(day.id)).map((day) => day.id);
    const after = next.days.filter((day) => isTempId(day.id)).map((day) => day.id);

    const remap = new Map(
        after.slice(0, before.length).map((id, index) => [id, before[index]])
    );

    if (remap.size === 0) return next;

    return {
        ...next,
        days: next.days.map((day) =>
            remap.has(day.id) ? { ...day, id: remap.get(day.id) } : day
        ),
        items: next.items.map((item) =>
            remap.has(item.dayId) ? { ...item, dayId: remap.get(item.dayId) } : item
        ),
    };
};

/** A day column's droppable wiring, plus the ref the geometry is measured from. */
const useDayDroppable = (dayId, registerGrid) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `day-${dayId}`,
        data: { dropTarget: { dayId } },
    });

    const ref = useCallback(
        (node) => {
            setNodeRef(node);
            registerGrid(dayId, node);
        },
        [dayId, setNodeRef, registerGrid]
    );

    return {
        setNodeRef: ref,
        className: `day-column-drop${isOver ? ' day-column-drop--over' : ''}`,
    };
};

const CalendarDragArea = ({ pool, onOpenSource }) => {
    const { state, commit, unschedule } = useCalendarContext();

    const [active, setActive] = useState(null);
    const [preview, setPreview] = useState(null);

    // dayId → the element the grid is drawn in, for measuring a drop.
    const gridsRef = useRef(new Map());

    const registerGrid = useCallback((dayId, node) => {
        if (node) gridsRef.current.set(dayId, node);
        else gridsRef.current.delete(dayId);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
        useSensor(KeyboardSensor)
    );

    const shown = preview ?? scheduleOf(state);

    const scheduledByTodoId = useMemo(
        () =>
            new Map(
                shown.items.map((item) => [
                    item.todoId,
                    { dayIndex: shown.days.findIndex((day) => day.id === item.dayId) },
                ])
            ),
        [shown]
    );

    /** What the drop would be, from the event, or null when it is over nothing. */
    const targetFrom = useCallback(
        (event) => {
            const data = event.active.data.current;
            const kind = dragKindOf(data);
            const dropTarget = event.over?.data.current?.dropTarget ?? null;

            if (!kind || !dropTarget || dropTarget.dayId === undefined) return null;

            const grid = gridsRef.current.get(dropTarget.dayId);
            const activeRect = event.active.rect.current.translated;

            if (!grid || !activeRect) return null;

            return {
                kind,
                todo: kind === DRAG_KIND.pool ? data.poolTodo : { todoId: data.bookingTodoId },
                dayId: dropTarget.dayId,
                startMinutes: minutesAtRect(activeRect, grid.getBoundingClientRect()),
            };
        },
        []
    );

    const handleDragStart = useCallback((event) => {
        const data = event.active.data.current;

        setActive({ kind: dragKindOf(data), data });
    }, []);

    // A gesture aimed at something impossible — a pool row for a to-do that is
    // somehow already booked — makes `lib/schedule` throw, by design. On a
    // pointer-move handler that would tear down the whole page mid-drag, so it is
    // reported and the last good preview is held instead. Not swallowed: it
    // reaches the console with its cause, and the drop below re-runs the same
    // call, where a genuine failure surfaces as a rolled-back mutation.
    const handleDragMove = useCallback(
        (event) => {
            const target = targetFrom(event);

            if (!target) {
                setPreview(null);
                return;
            }

            setPreview((current) => {
                try {
                    return withStableTempDays(current, previewFor(scheduleOf(state), target));
                } catch (err) {
                    console.error('Could not preview this drop:', err);
                    return current;
                }
            });
        },
        [state, targetFrom]
    );

    /**
     * A release over the remove overlay unschedules; over a column, commits the
     * preview; over nothing, does nothing at all. That last one is the "drag it
     * back and let go" cancel — it is not a failure and says nothing.
     */
    const handleDragEnd = useCallback(
        (event) => {
            const dropTarget = event.over?.data.current?.dropTarget ?? null;
            const data = event.active.data.current;

            setActive(null);
            setPreview(null);

            if (dropTarget?.remove && dragKindOf(data) === DRAG_KIND.booking) {
                unschedule(data.bookingTodoId);
                return;
            }

            const target = targetFrom(event);
            if (!target) return;

            // Unguarded on purpose, unlike the move handler: a drop is a single
            // event, and a gesture that cannot be computed is a wiring bug that
            // should be loud rather than silently doing nothing.
            commit(previewFor(scheduleOf(state), target));
        },
        [commit, state, targetFrom, unschedule]
    );

    // Escape, and any cancel dnd-kit reports. The preview simply goes.
    const handleDragCancel = useCallback(() => {
        setActive(null);
        setPreview(null);
    }, []);

    const isDraggingBooking = active?.kind === DRAG_KIND.booking;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="calendar-body">
                <DayStrip
                    schedule={shown}
                    onOpenSource={onOpenSource}
                    columnFor={(day, index, items) => (
                        <DroppableDayColumn
                            key={day.id}
                            day={day}
                            index={index}
                            items={items}
                            onOpenSource={onOpenSource}
                            registerGrid={registerGrid}
                        />
                    )}
                />

                <ProjectPanel
                    pool={pool}
                    scheduledByTodoId={scheduledByTodoId}
                    dragFor={(todo) => (scheduledByTodoId.has(todo.todoId) ? null : todo)}
                    overlay={<RemoveOverlay isActive={isDraggingBooking} />}
                />
            </div>

            {/* The thing under the pointer. The preview shows where everything
                lands; this shows what is in the hand. */}
            <DragOverlay dropAnimation={null}>
                {active && <div className="calendar-drag-ghost">{labelOf(active)}</div>}
            </DragOverlay>
        </DndContext>
    );
};

/** A day column with its droppable wired in. */
const DroppableDayColumn = ({ day, index, items, onOpenSource, registerGrid }) => {
    const droppable = useDayDroppable(day.id, registerGrid);

    return (
        <DayColumn
            day={day}
            index={index}
            items={items}
            onOpenSource={onOpenSource}
            droppable={droppable}
        />
    );
};

const labelOf = (active) =>
    active.kind === DRAG_KIND.pool ? active.data.poolTodo.text : 'Moving…';

export default CalendarDragArea;
```

- [ ] **Step 5: Put the two draggable hooks in their own module**

They cannot live in `CalendarDragArea.js`. That file imports `ProjectPanel`,
which imports `ProjectAccordionCard`, which imports `PanelTodoRow` — so a
`PanelTodoRow` that imported back from `CalendarDragArea` would close a require
cycle and get `undefined` for the hook. Create
`src/client/src/hooks/useCalendarDrag.js`, which imports nothing of the
component tree:

```js
import { useDraggable } from '@dnd-kit/core';

// The draggable wiring for the two things this page can lift: a pool row, which
// has no booking yet, and a booking already in a day. `data` is what
// `dragKindOf` reads to tell them apart on drop.
//
// They live here rather than beside `CalendarDragArea` because the components
// that call them are imported *by* that file, and importing back would be a
// cycle.

export const usePoolDrag = (todo) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `pool-${todo.todoId}`,
        data: { poolTodo: todo },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners }, isDragging };
};

export const useBookingDrag = (todoId) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `booking-${todoId}`,
        data: { bookingTodoId: todoId },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners }, isDragging };
};
```

- [ ] **Step 6: Wire the handles**

A hook cannot be called from inside a render prop, so the row and the card each
call their own — `dragFor` only says *whether* a row is draggable.

In `CalendarDragArea`, pass a predicate:

```js
                    dragFor={(todo) => !scheduledByTodoId.has(todo.todoId)}
```

`ProjectAccordionCard` forwards it as `isDraggable` to each `PanelTodoRow`, and
`PanelTodoRow` calls `usePoolDrag(todo)` itself. Do the same in `DayItemCard`
with `useBookingDrag(item.todoId)`.

Both hooks must be called unconditionally — `isDraggable` decides what is
*rendered*, never whether the hook runs, or React reports "rendered more hooks
than during the previous render". Outside a `DndContext` `useDraggable` is inert
rather than throwing, so the Phase D tests that render these components bare
keep working; leave `isDraggable` defaulting to `false` so they render the inert
graphic they already assert on.

- [ ] **Step 7: Point the page at the drag area**

In `CalendarPage.js`, replace the bare `calendar-body` div with:

```jsx
                <CalendarProvider value={calendar}>
                    <CalendarDragArea pool={pool} onOpenSource={openSource} />
                </CalendarProvider>
```

and delete the `scheduledByTodoId` computed there — it moved into the drag area,
which is the only place that knows about the preview.

- [ ] **Step 8: Run the tests**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/client/src/components/Calendar src/client/src/hooks/useCalendarDrag.js
git commit -m "feat(calendar): drag from the pool and between days, with a live preview"
```

---

## Task 26: Resizing an item's edges

**Files:**
- Create: `src/client/src/hooks/useResizeEdge.js`
- Modify: `src/client/src/components/Calendar/DayItemCard.js`
- Test: `src/client/src/hooks/useResizeEdge.test.js`

Resizing is **not** a dnd-kit drag. It is a raw pointer gesture on a 6px edge,
and routing it through the drag library would mean fighting the sensor's
activation distance for a gesture whose first pixel matters.

- [ ] **Step 1: Write the failing test**

```js
import { rectFor } from './useResizeEdge';

describe('rectFor', () => {
    const item = { todoId: 7, startMinutes: 540, durationMinutes: 60 };

    test('the bottom edge changes only the duration', () => {
        expect(rectFor(item, { edge: 'bottom', deltaMinutes: 60, floor: 0 })).toEqual({
            startMinutes: 540,
            durationMinutes: 120,
        });
    });

    test('the bottom edge stops at one slot', () => {
        expect(rectFor(item, { edge: 'bottom', deltaMinutes: -600, floor: 0 })).toEqual({
            startMinutes: 540,
            durationMinutes: 30,
        });
    });

    test('the bottom edge may pass midnight, for the spill to resolve', () => {
        const late = { todoId: 7, startMinutes: 1380, durationMinutes: 60 };

        expect(rectFor(late, { edge: 'bottom', deltaMinutes: 120, floor: 0 })).toEqual({
            startMinutes: 1380,
            durationMinutes: 180,
        });
    });

    test('the top edge moves the start and keeps the end fixed', () => {
        expect(rectFor(item, { edge: 'top', deltaMinutes: -60, floor: 0 })).toEqual({
            startMinutes: 480,
            durationMinutes: 120,
        });
    });

    test('the top edge clamps at the item above and never pushes it', () => {
        // Arrange — the item above ends at 10:00
        expect(rectFor(item, { edge: 'top', deltaMinutes: -600, floor: 600 })).toEqual({
            startMinutes: 600,
            durationMinutes: 30,
        });
    });

    test('the top edge cannot swallow its own end', () => {
        expect(rectFor(item, { edge: 'top', deltaMinutes: 600, floor: 0 })).toEqual({
            startMinutes: 570,
            durationMinutes: 30,
        });
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=useResizeEdge`
Expected: FAIL — `Cannot find module './useResizeEdge'`.

- [ ] **Step 3: Write the hook**

```js
import { useCallback, useEffect, useRef, useState } from 'react';

import { MIN_DURATION } from '../lib/schedule';
import { clampDuration, pxToMinutes, snapToSlot } from '../lib/scheduleGeometry';

// Dragging the top or bottom edge of a booking.
//
// Not a dnd-kit drag. The sensor's activation distance exists so a click on a
// button is not swallowed by a drag, and it is exactly wrong for a 6px edge whose
// first pixel of movement is the gesture. Raw pointer events, captured on the
// handle, are both simpler and more accurate here.
//
// The two edges are not symmetric, and that asymmetry is decision 7:
//
//   - The bottom edge changes the duration and may run past midnight. That is
//     not an error to prevent; it is the input to the spill.
//   - The top edge changes the start and holds the end still, and it *clamps* at
//     the end of the item above rather than pushing it. The cascade only ever
//     runs downward, and letting one edge push upward would make the item above
//     move while the user was dragging the one below.

export const EDGE = { top: 'top', bottom: 'bottom' };

/**
 * The rectangle an edge drag asks for. Pure, so every clamp is testable without
 * a pointer.
 *
 * `floor` is the earliest the top edge may reach — `topEdgeFloor` from
 * `lib/schedule`, which is the end of the item above or midnight.
 */
export const rectFor = (item, { edge, deltaMinutes, floor }) => {
    if (edge === EDGE.bottom) {
        return {
            startMinutes: item.startMinutes,
            durationMinutes: clampDuration(item.durationMinutes + deltaMinutes),
        };
    }

    const end = item.startMinutes + item.durationMinutes;
    const wanted = snapToSlot(item.startMinutes + deltaMinutes);
    const startMinutes = Math.min(Math.max(wanted, floor), end - MIN_DURATION);

    return { startMinutes, durationMinutes: end - startMinutes };
};

/**
 * Wires one edge. `onPreview` is called on every move with the rectangle so far
 * — the caller runs the cascade and renders it — and `onCommit` once on release.
 * `onCancel` fires on Escape, so a resize can be abandoned the same way a drag
 * can.
 */
const useResizeEdge = ({ item, edge, floor, onPreview, onCommit, onCancel }) => {
    const [isResizing, setIsResizing] = useState(false);
    const originRef = useRef(0);
    const latestRef = useRef(null);

    const handlePointerDown = useCallback(
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);

            originRef.current = event.clientY;
            latestRef.current = null;
            setIsResizing(true);
        },
        []
    );

    const handlePointerMove = useCallback(
        (event) => {
            if (!isResizing) return;

            const deltaMinutes = snapToSlot(pxToMinutes(event.clientY - originRef.current));
            const rect = rectFor(item, { edge, deltaMinutes, floor });

            latestRef.current = rect;
            onPreview(rect);
        },
        [edge, floor, isResizing, item, onPreview]
    );

    const handlePointerUp = useCallback(() => {
        if (!isResizing) return;

        setIsResizing(false);

        if (latestRef.current) onCommit(latestRef.current);
        else onCancel();
    }, [isResizing, onCancel, onCommit]);

    // Escape abandons a resize in flight, matching what it does to a drag.
    useEffect(() => {
        if (!isResizing) return undefined;

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;

            setIsResizing(false);
            latestRef.current = null;
            onCancel();
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isResizing, onCancel]);

    return {
        isResizing,
        handleProps: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp,
        },
    };
};

export default useResizeEdge;
```

- [ ] **Step 4: Feed the edges the card already renders**

`DayItemCard` renders both handles from a `resize` prop of `{ top, bottom }`
(Task 22). Build that prop in `CalendarDragArea`, where the schedule and
`commit` live, calling `useResizeEdge` once per edge with:

- `floor`: `topEdgeFloor(schedule, item.todoId)` for the top edge, `0` for the
  bottom, which has no floor.
- `onPreview`: `setPreview(resizeItem(scheduleOf(state), { todoId, ...rect }))`.
  `resizeItem` already runs `spillFrom` itself — do not call it again.
- `onCommit`: the same call, handed to `commit`.
- `onCancel`: `setPreview(null)`.

The same preview-then-commit shape the drag uses, so a resize that runs past
midnight spills live and is saved as one bulk request.

- [ ] **Step 5: Run the tests**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/hooks/useResizeEdge.js src/client/src/hooks/useResizeEdge.test.js src/client/src/components/Calendar
git commit -m "feat(calendar): resize a booking by its top or bottom edge"
```

---

## Task 27: The remove overlay

**Files:**
- Create: `src/client/src/components/Calendar/RemoveOverlay.js`
- Test: `src/client/src/components/Calendar/RemoveOverlay.test.js`

- [ ] **Step 1: Write the failing test**

```js
import React from 'react';
import { render, screen } from '@testing-library/react';

import RemoveOverlay from './RemoveOverlay';

describe('RemoveOverlay', () => {
    test('is hidden when nothing is being dragged out of a day', () => {
        // Arrange + Act
        render(<RemoveOverlay isActive={false} />);

        // Assert
        expect(screen.getByText('Drag here to remove from day')).not.toBeVisible();
    });

    test('covers the panel while a booking is in the air', () => {
        // Arrange + Act
        render(<RemoveOverlay isActive />);

        // Assert
        expect(screen.getByText('Drag here to remove from day')).toBeVisible();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=RemoveOverlay`
Expected: FAIL — `Cannot find module './RemoveOverlay'`.

- [ ] **Step 3: Write the component**

```js
import React from 'react';
import { useDroppable } from '@dnd-kit/core';

// The pool, turned into a bin for the duration of a drag.
//
// It appears only while a booking that came *from a day* is in the air. A row
// being dragged out of the pool has nowhere to be removed from, and covering the
// panel then would hide the very list the user was dragging out of.
//
// Rendered always and toggled with `hidden` rather than mounted on demand: it is
// a droppable, and dnd-kit has to have registered it before the pointer arrives.
// A droppable that mounts mid-drag is not reliably part of that drag.

const RemoveOverlay = ({ isActive }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: 'remove-from-day',
        disabled: !isActive,
        data: { dropTarget: { remove: true } },
    });

    const className = ['remove-overlay', isOver ? 'remove-overlay--over' : '']
        .filter(Boolean)
        .join(' ');

    return (
        <div ref={setNodeRef} className={className} hidden={!isActive}>
            <p>Drag here to remove from day</p>
        </div>
    );
};

export default RemoveOverlay;
```

Add to `Calendar.css`, using tokens only — the overlay pins to the panel, which
Task 20 already gave `position: relative`:

```css
.remove-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-lg);
    border: 2px dashed var(--color-danger);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    color: var(--color-danger);
}

.remove-overlay--over {
    background: var(--color-warning-light);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run test:client -- --testPathPattern=RemoveOverlay`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Calendar/RemoveOverlay.js src/client/src/components/Calendar/RemoveOverlay.test.js src/client/src/components/Styling/Calendar.css
git commit -m "feat(calendar): drop a booking on the pool to unschedule it"
```

---

## Task 28: The name link and the project-page flash

**Files:**
- Create: `src/client/src/hooks/useSequenceSpotlight.js`
- Modify: `src/client/src/components/Calendar/CalendarPage.js`
- Modify: `src/client/src/components/Project/ProjectPage.js`
- Modify: `src/client/src/components/Project/Canvas.js`
- Modify: `src/client/src/components/Project/LayerRow.js`
- Modify: `src/client/src/components/Project/SequenceCard.js`
- Modify: `src/client/src/components/Styling/SequenceCard.css`
- Test: `src/client/src/hooks/useSequenceSpotlight.test.js`

The one change outside the Calendar folder.

- [ ] **Step 1: Write the failing test**

```js
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

import useSequenceSpotlight from './useSequenceSpotlight';

const wrapperFor = (initialEntry) => ({ children }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
            <Route path="/projects/:id" element={children} />
        </Routes>
    </MemoryRouter>
);

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useSequenceSpotlight', () => {
    test('flashes nothing when no sequence was asked for', () => {
        // Arrange + Act
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2'),
        });

        // Assert
        expect(result.current).toBeNull();
    });

    test('waits before flashing, because the card is not on screen yet', () => {
        // Arrange
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2?sequence=9'),
        });

        // Assert — nothing immediately
        expect(result.current).toBeNull();

        // Act
        act(() => jest.advanceTimersByTime(600));

        // Assert
        expect(result.current).toBe(9);
    });

    test('stops flashing on its own', () => {
        // Arrange
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2?sequence=9'),
        });
        act(() => jest.advanceTimersByTime(600));

        // Act
        act(() => jest.advanceTimersByTime(2000));

        // Assert
        expect(result.current).toBeNull();
    });

    test('holds off until the graph is ready', () => {
        // Arrange
        const { result, rerender } = renderHook(({ ready }) => useSequenceSpotlight(ready), {
            wrapper: wrapperFor('/projects/2?sequence=9'),
            initialProps: { ready: false },
        });

        // Act
        act(() => jest.advanceTimersByTime(5000));

        // Assert — still nothing; the card has not rendered
        expect(result.current).toBeNull();

        // Act
        rerender({ ready: true });
        act(() => jest.advanceTimersByTime(600));

        // Assert
        expect(result.current).toBe(9);
    });

    test('ignores a sequence parameter that is not an id', () => {
        // Arrange
        const { result } = renderHook(() => useSequenceSpotlight(true), {
            wrapper: wrapperFor('/projects/2?sequence=nonsense'),
        });

        // Act
        act(() => jest.advanceTimersByTime(600));

        // Assert
        expect(result.current).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:client -- --testPathPattern=useSequenceSpotlight`
Expected: FAIL — `Cannot find module './useSequenceSpotlight'`.

- [ ] **Step 3: Write the hook**

```js
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// "Show me where this came from", arriving from the calendar as `?sequence=9`.
//
// Two delays, and each earns its place. The first is because the card is not on
// screen when the navigation happens — the graph has to load — so flashing
// immediately would flash nothing. The second is that a flash is a flash: it ends.
//
// The parameter is consumed the moment it is read, and the URL rewritten without
// it. Otherwise a reload, or a back-navigation onto this page, would flash a card
// the user never asked about a second time.

const HIGHLIGHT_DELAY_MS = 600;
const HIGHLIGHT_DURATION_MS = 2000;

const parseSequenceId = (raw) => {
    if (!raw) return null;

    const id = Number(raw);

    return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * The sequence to flash right now, or null. `isReady` is whether the graph has
 * loaded — the wait starts from that, not from mount.
 */
const useSequenceSpotlight = (isReady) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [pendingId, setPendingId] = useState(null);
    const [highlightedId, setHighlightedId] = useState(null);

    // Read once and clear. Held in state rather than read from the URL each
    // render, because clearing the URL would otherwise cancel the very timers
    // that are waiting to use it.
    useEffect(() => {
        const id = parseSequenceId(searchParams.get('sequence'));

        if (id === null) return;

        setPendingId(id);
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (pendingId === null || !isReady) return undefined;

        const show = setTimeout(() => setHighlightedId(pendingId), HIGHLIGHT_DELAY_MS);
        const hide = setTimeout(() => {
            setHighlightedId(null);
            setPendingId(null);
        }, HIGHLIGHT_DELAY_MS + HIGHLIGHT_DURATION_MS);

        return () => {
            clearTimeout(show);
            clearTimeout(hide);
        };
    }, [pendingId, isReady]);

    return highlightedId;
};

export default useSequenceSpotlight;
```

- [ ] **Step 4: Send the user from the calendar**

In `CalendarPage.js`:

```js
    const navigate = useNavigate();

    /**
     * "Where did this come from?" — the project, and the sequence within it.
     *
     * Both are read off the booking itself rather than looked up in the pool: a
     * completed to-do has left the frontier and is no longer in the pool, and it
     * is exactly then that a user is most likely to ask.
     *
     * A booking whose to-do has since been returned to the unorganized panel has
     * no sequence to point at, so it simply arrives at the project.
     */
    const openSource = useCallback(
        (item) =>
            navigate(
                item.sequenceId
                    ? `/projects/${item.projectId}?sequence=${item.sequenceId}`
                    : `/projects/${item.projectId}`
            ),
        [navigate]
    );
```

- [ ] **Step 5: Thread the highlight through the project page**

In `ProjectPage.js`:

```js
    const highlightedSequenceId = useSequenceSpotlight(
        state.status === PROJECT_STATUS.ready
    );
```

and pass it to `<Canvas highlightedSequenceId={highlightedSequenceId} />`.

In `Canvas.js`, accept the prop and pass it to each `<LayerRow>`; in
`LayerRow.js`, accept it and pass it to each `<SequenceCard>` — the same route
`activeSequenceId` already travels, so no new plumbing is invented.

In `SequenceCard.js`, add it to the card's class list:

```js
        isSpotlit ? 'sequence-card--spotlit' : '',
```

where `isSpotlit = sequence.id === highlightedSequenceId`.

- [ ] **Step 6: Add the flash**

In `SequenceCard.css`, tokens only:

```css
/* Arriving from the calendar: a card says "here I am" and then stops. Two
   pulses is enough to catch the eye without becoming decoration. */
@keyframes sequence-card-spotlight {
    0%, 100% { box-shadow: var(--shadow-sm); }
    50%      { box-shadow: 0 0 0 3px var(--color-accent); }
}

.sequence-card--spotlit {
    animation: sequence-card-spotlight 1s ease-in-out 2;
}

@media (prefers-reduced-motion: reduce) {
    .sequence-card--spotlit {
        animation: none;
        box-shadow: 0 0 0 3px var(--color-accent);
    }
}
```

- [ ] **Step 7: Run the whole client suite**

Run: `npm run test:client`
Expected: PASS, including every existing project-page test — the four files you
touched all take one new optional prop and nothing else.

- [ ] **Step 8: Commit**

```bash
git add src/client/src/hooks/useSequenceSpotlight.js src/client/src/hooks/useSequenceSpotlight.test.js src/client/src/components/Calendar/CalendarPage.js src/client/src/components/Project src/client/src/components/Styling/SequenceCard.css
git commit -m "feat(calendar): open a booking's sequence and flash it on arrival"
```

---

# Phase F — End to end

## Task 29: The critical flow

**Files:**
- Create: `tests/e2e/calendar.spec.js`

- [ ] **Step 1: Read the existing suite first**

Read `tests/e2e/helpers.js`, `tests/e2e/database.js` and
`tests/e2e/criticalFlow.spec.js`. What it actually exports is
`newCredentials`, `seedPlan`, `addTodo`, `openProject`, `dragOnto`,
`attachDiagnostics` — there is no `signIn` and no `seedProjectWithTodos`, so do
not write against those names.

Two of these matter here:

- **`dragOnto(page, source, target)`** — use it for every drag. dnd-kit's
  pointer sensor tracks *movement*, not endpoints, so Playwright's `dragTo`
  does nothing at all: the helper exists because of that, and already does the
  nudge, the stepped move and the settle before release.
- **`seedPlan(page, credentials, title)`** — registers an account, builds a
  two-layer plan through the API and leaves the browser signed in. It returns
  `{ projectId, headers, parent, child }`; `addTodo(page, headers, projectId,
  text, sequenceId)` files a to-do into one of those sequences, which is what
  puts it on the frontier and therefore in the calendar's pool.

- [ ] **Step 2: Write the spec**

```js
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

/** Opens the calendar with one empty day ready to receive work. */
const openCalendarWithADay = async (page) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Add the first day' }).click();
    await expect(page.getByRole('region', { name: 'Day 1' })).toBeVisible();
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
        await dragOnto(page, page.getByText('Refresh tokens'), column);

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

        // Act — reload, to prove it was saved rather than only drawn
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
        await dragOnto(page, page.getByText('Refresh tokens'), column);
        await expect(column.getByText('Refresh tokens')).toBeVisible();

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
```

- [ ] **Step 3: Run it**

Run: `npm run test:e2e -- calendar.spec.js`
Expected: PASS. Playwright drags are timing-sensitive; if the resize proves
flaky, raise the step count so every intermediate `pointermove` is delivered,
rather than adding a sleep. If a *drag* proves flaky, the fault is in
`dragOnto`'s constants and should be fixed there for every spec at once, not
worked around here.

- [ ] **Step 4: Run everything**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/calendar.spec.js
git commit -m "test(calendar): cover booking, spilling and unscheduling end to end"
```

---

# Plan self-review

Checked after writing, against `docs/superpowers/specs/2026-09-09-planapp-calendar-design.md`.

**Spec coverage.** Every section maps to at least one task: §4 → Task 1; §5 →
Tasks 4–9, with the denormalised item payload covered by Task 8's join and its
two regression tests; §6 → Tasks 11, 12, 13, 16; §7 → Tasks 10, 14, 15, 17–24;
§8 → Tasks 22–28; §9 → Task 14; §10 → Tasks 18, 19, 20; §12 → distributed, plus
Task 29; §13's build order is the order of the tasks.

**One deliberate deviation.** The spec's §7 file list names
`state/CalendarDragContext.js`. No task creates it: `CalendarDragArea` keeps
`active` and `preview` as local state and passes the preview down as a prop,
because nothing outside that component reads them. A context would be indirection
with one consumer. The file table above has been corrected to match, and
`hooks/useResizeEdge.js` and `hooks/useSequenceSpotlight.js` — which the spec's
list did not anticipate — added to it.

**Known gaps, deliberately left open.** Each is a real limit of this design, not
an oversight; none blocks the first pass, and each has a cheap fix if it bites.

1. **A second gesture during an unsaved spill can double-append a day.**
   `toBulkRequest` derives `appendDays` from the temporary days in the state it
   is given. If a spill creates one and the user starts another gesture before
   that `PUT` answers, the second request counts the same temporary day again and
   the server appends a duplicate. Rare in practice — the request is one round
   trip and the strip is not usually dragged that fast — and the honest fix is to
   refuse a `commit` while one is in flight. If you would rather close it now, add
   a `isSaving` ref to `useCalendar` and have `commit` queue behind it.

2. **A failed bulk save rolls back the whole schedule, not just the gesture.**
   That is the intended behaviour — the request is atomic, so the state must be
   too — but it means an unrelated concurrent change made in another tab is lost
   on rollback. The calendar has no live sync, so this is consistent with the rest
   of the app.

3. **`unschedule` from the pool overlay and the `unschedule` array in the bulk
   body are two paths to the same outcome.** The overlay uses
   `DELETE /calendar/items/:todoId` because it is a single, self-contained act;
   the bulk field exists because a settled gesture can drop a booking as a side
   effect. They are not redundant, but they do need to stay in agreement — if you
   change what unscheduling means, change both.

**Verified before hand-off.** The push-down fold and the spill were extracted and
run against every case in Tasks 11 and 12 — 13 `settleDay` cases and 8
`spillFrom` cases — and the ordering in Task 11 was corrected as a result: keying
each anchor by its own start let a receiving day's item interleave with an
arriving spill group, which the multi-anchor case catches. Anchors are now keyed
by the group's earliest start. `rebaseToTop`'s claim to preserve gaps was also
softened: a settled overflow tail is always contiguous below its first member, so
there is never a gap to preserve.

**No placeholders.** Every step carries the code or the exact command it needs.


