# Calendar Notes and Column Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free-floating, overlapping "notes" as a second plane inside every calendar day column, and resize the day column so it fills the page vertically and exactly two days fit across the strip.

**Architecture:** Notes are a separate plane that shares a clock with bookings and nothing else. They never cascade, never spill, and never move a booking — so `src/client/src/lib/schedule.js`, `src/client/src/lib/calendarRequest.js` and `PUT /api/calendar/items` are not touched by any task in this plan. Notes get their own table cascading from `calendar_days`, their own plain-REST router, and their own client hook (`useCalendarNotes`) sitting beside `usePool` and `useCalendar` in `CalendarPage`. A note's lane (0–3, filling right to left) is derived on every render, never stored. Separately, `PX_PER_SLOT` stops being a constant and becomes a scale derived from the window, published through a context.

**Tech Stack:** Express 4 + Zod + MySQL 8 (mysql2) on the server; React 18 (CRA) + @dnd-kit/core on the client. Jest + Supertest for server tests, React Testing Library under `react-scripts test` for client tests, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-09-16-calendar-notes-design.md`. Section references below (`§5.4`, `decision 7`) point into it.

---

## Before you start

Create a branch. The repo's convention is a dated feature branch:

```bash
git checkout -b feat/calendar-notes-2026-09-16
```

Server tests need a MySQL database whose name ends in `_test`, and `JWT_SECRET` set:

```bash
mysql -u <user> -p -e "CREATE DATABASE IF NOT EXISTS planapp_test;"
mysql -u <user> -p planapp_test < src/db/schema.sql
```

Commands used throughout:

| What | Command |
|---|---|
| Server unit + integration tests | `DB_NAME=planapp_test npm test` |
| One server test file | `DB_NAME=planapp_test npx jest tests/unit/calendarNoteLanes.test.js` |
| Client tests | `npm run test:client` |
| One client test file | `CI=true npm test --prefix src/client -- --testPathPattern=noteLanes` |
| E2E | `npm run test:e2e` |

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/db/repositories/calendarNotesRepo.js` | Data access for `calendar_notes`. Nothing else knows the table exists. |
| `src/lib/calendarNoteLanes.js` | Pure: is this set of notes a legal day? Sweep for max overlap. No connection, no Express. |
| `src/routes/calendarNotes.js` | The four note endpoints. Validation, ownership, transaction boundaries. |
| `src/shared/noteLaneCases.json` | One table of note arrangements read by both the client and server lane suites. |
| `src/client/src/lib/noteLanes.js` | Pure: day's notes → lane per note; can a candidate be placed? |
| `src/client/src/state/notesActions.js` | Action creators for the notes reducer. |
| `src/client/src/state/notesReducer.js` | Notes as state: status, rows, load error, action error. |
| `src/client/src/state/DayScaleContext.js` | Publishes the scale-dependent geometry to the column tree. |
| `src/client/src/hooks/useDayScale.js` | Measures the scroll viewport, returns `pxPerSlot`. |
| `src/client/src/hooks/useCalendarNotes.js` | Load + optimistic create/update/delete for notes. |
| `src/client/src/hooks/useNoteDraft.js` | Press-and-drag on empty notes background → a draft range. |
| `src/client/src/components/Calendar/NotePlane.js` | Four lanes, the create surface, the notes drop target. |
| `src/client/src/components/Calendar/NoteRibbon.js` | One note: rotated text, two resize edges, drag handle. |
| `src/client/src/components/Calendar/NotePopover.js` | Text field, time range, Delete. |

Each of the above gets a sibling `*.test.js` (client) or a file under `tests/unit/` / `tests/integration/` (server), named in its task.

### Modified

| File | Change |
|---|---|
| `src/db/schema.sql` | `calendar_notes` table, teardown line, migration note |
| `src/middleware/assertOwnership.js` | `calendarNote` resource type |
| `src/lib/serializers.js` | `toCalendarNote` |
| `src/server.js` | mount `/api/calendar/notes` |
| `src/client/src/lib/scheduleGeometry.js` | `PX_PER_SLOT_MIN`, `createDayGeometry` |
| `src/client/src/hooks/useResizeEdge.js` | takes `geometry` |
| `src/client/src/hooks/useCalendar.js` | response body checked at the boundary (user ruling, Task 13) |
| `src/client/src/components/Calendar/DayGrid.js` | height and hour tops from context |
| `src/client/src/components/Calendar/DayItemCard.js` | top/height from context |
| `src/client/src/components/Calendar/DayColumn.js` | renders `NotePlane`; scroll ref feeds the scale |
| `src/client/src/components/Calendar/CalendarDragArea.js` | note droppable, note gestures, geometry provider |
| `src/client/src/components/Calendar/CalendarPage.js` | `useCalendarNotes`, `onDayDeleted`, merged toast |
| `src/client/src/components/Styling/Calendar.css` | fill-page, two-day width, note styles |
| `README.md` | calendar bullet mentions notes |

### Untouched, deliberately

`src/client/src/lib/schedule.js`, `src/client/src/lib/calendarRequest.js`, `src/routes/calendar.js`'s `PUT /items`. If a task seems to need one of these, stop — decision 1 has been violated somewhere upstream.

---

## Task 1: The `calendar_notes` table

**Files:**
- Modify: `src/db/schema.sql`

- [ ] **Step 1: Add the teardown line**

In the teardown block near the top of `src/db/schema.sql`, add `calendar_notes` **above** `calendar_items` so the reverse-dependency order holds (notes cascade from `calendar_days`, which is dropped further down):

```sql
-- -- Teardown ---------------------------------------------------------------
DROP TABLE IF EXISTS `calendar_notes`;
DROP TABLE IF EXISTS `calendar_items`;
DROP TABLE IF EXISTS `calendar_days`;
```

- [ ] **Step 2: Add the table at the end of the file**

Append after the `calendar_items` block:

```sql
-- -- calendar_notes --------------------------------------------------------
-- Unplanned context for a day: a train journey, being on call, the kids being
-- home. A note is not work, and the difference is the whole design — notes do
-- not cascade, do not spill, and never move a booking (design 2026-09-16,
-- decision 1).
--
-- What is absent matters as much as what is here:
--
--   - No `lane`. Which of the four vertical tracks a note is drawn in is
--     derived from the day's notes on every render (decision 5). Stored, it
--     would be a second truth with nothing keeping it honest: deleting a note
--     would leave a hole no sibling could fill until something rewrote them all.
--   - No `owner_id`. A note reaches its owner through its day, the way a to-do
--     reaches its owner through its project.
--   - No unique key. `calendar_items` has one because a to-do may be booked at
--     most once; a day may hold any number of notes.
--   - No `position`. Display order is `start_minutes` then `id`, which is a
--     total order over any set of notes and needs no stored rank.
--
-- The ON DELETE CASCADE is decision 9 stated in the schema rather than in code:
-- deleting a day deletes its notes, with no prompt. Unlike a booking, a note
-- has nowhere to be released to — it exists only as part of its day.
CREATE TABLE `calendar_notes` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `text`             varchar(500) NOT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_notes_day_start` (`day_id`, `start_minutes`),
  CONSTRAINT `fk_calendar_notes_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
```

- [ ] **Step 3: Add the migration note to the file header**

In the header comment block, after the existing paragraph about `calendar_days` and `calendar_items`, add:

```sql
-- A database created before the calendar notes pass is missing one table. Add it
-- in place rather than re-running this file: copy the CREATE TABLE statement for
-- `calendar_notes` from the bottom of this file and run it alone.
```

- [ ] **Step 4: Apply it to the test and dev databases**

```bash
mysql -u <user> -p planapp_test < src/db/schema.sql
mysql -u <user> -p planapp      -e "$(sed -n '/CREATE TABLE `calendar_notes`/,/ENGINE=InnoDB;/p' src/db/schema.sql)"
```

Expected: no output, exit 0. Verify:

```bash
mysql -u <user> -p planapp_test -e "DESCRIBE calendar_notes;"
```

Expected: six columns — `id`, `day_id`, `text`, `start_minutes`, `duration_minutes`, `created_at`, `updated_at`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql
git commit -m "feat: add calendar_notes table"
```

---

## Task 2: `calendarNotesRepo`

**Files:**
- Create: `src/db/repositories/calendarNotesRepo.js`
- Test: `tests/integration/calendarNotesRepo.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/calendarNotesRepo.test.js`:

```js
'use strict';

const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarNotesRepo = require('../../src/db/repositories/calendarNotesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');

const getConn = useTransaction();

/**
 * Notes are the simplest table in the calendar: no position to keep dense, no
 * unique key to honour, no joins to draw a card. What is asserted here is
 * ownership scoping and that reads come back in display order.
 */

const createDay = async (conn) => {
    const ownerId = await createTestUser(conn);
    const day = await calendarDaysRepo.create(conn, { ownerId });

    return { ownerId, day };
};

describe('calendarNotesRepo.create', () => {
    test('stores a note against its day', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);

        // Act
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'train to Leeds',
            startMinutes: 540,
            durationMinutes: 120,
        });

        // Assert
        expect(note.day_id).toBe(day.id);
        expect(note.text).toBe('train to Leeds');
        expect(note.start_minutes).toBe(540);
        expect(note.duration_minutes).toBe(120);
    });
});

describe('calendarNotesRepo.listByOwner', () => {
    test('returns only the owner’s notes', async () => {
        // Arrange
        const conn = getConn();
        const mine = await createDay(conn);
        const theirs = await createDay(conn);

        await calendarNotesRepo.create(conn, {
            dayId: mine.day.id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: theirs.day.id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByOwner(conn, mine.ownerId);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['mine']);
    });

    test('orders by day position, then start, then id', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const first = await calendarDaysRepo.create(conn, { ownerId });
        const second = await calendarDaysRepo.create(conn, { ownerId });

        await calendarNotesRepo.create(conn, {
            dayId: second.id,
            text: 'day two',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: first.id,
            text: 'late',
            startMinutes: 720,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: first.id,
            text: 'early',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByOwner(conn, ownerId);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['early', 'late', 'day two']);
    });
});

describe('calendarNotesRepo.listByDayId', () => {
    test('returns the day’s notes in start order', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);

        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'second',
            startMinutes: 600,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'first',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByDayId(conn, day.id);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['first', 'second']);
    });

    test('breaks a tie on start_minutes by insertion id', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);

        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'inserted first',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'inserted second',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const notes = await calendarNotesRepo.listByDayId(conn, day.id);

        // Assert
        expect(notes.map((note) => note.text)).toEqual(['inserted first', 'inserted second']);
    });
});

describe('calendarNotesRepo.update', () => {
    test('applies only the named fields', async () => {
        // Arrange
        const conn = getConn();
        const { day } = await createDay(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const updated = await calendarNotesRepo.update(conn, note.id, { startMinutes: 600 });

        // Assert
        expect(updated.start_minutes).toBe(600);
        expect(updated.text).toBe('on call');
        expect(updated.duration_minutes).toBe(60);
    });

    test('returns null for a note that is not there', async () => {
        // Arrange
        const conn = getConn();

        // Act
        const updated = await calendarNotesRepo.update(conn, 999999, { text: 'nope' });

        // Assert
        expect(updated).toBeNull();
    });
});

describe('calendarNotesRepo.remove', () => {
    test('deletes the note and reports it', async () => {
        // Arrange
        const conn = getConn();
        const { day, ownerId } = await createDay(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'gone',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const deleted = await calendarNotesRepo.remove(conn, note.id);

        // Assert
        expect(deleted).toBe(true);
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });

    test('returns false for a note that is not there', async () => {
        // Arrange
        const conn = getConn();

        // Act
        const deleted = await calendarNotesRepo.remove(conn, 999999);

        // Assert
        expect(deleted).toBe(false);
    });
});

describe('deleting a day', () => {
    test('takes its notes with it', async () => {
        // Arrange
        const conn = getConn();
        const { day, ownerId } = await createDay(conn);
        await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'context',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        await calendarDaysRepo.remove(conn, day.id);

        // Assert
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
DB_NAME=planapp_test npx jest tests/integration/calendarNotesRepo.test.js
```

Expected: FAIL — `Cannot find module '../../src/db/repositories/calendarNotesRepo'`.

- [ ] **Step 3: Write the repository**

Create `src/db/repositories/calendarNotesRepo.js`:

```js
'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `calendar_notes` — unplanned context attached to a day
 * (design 2026-09-16, section 4).
 *
 * The simplest table in the calendar, and the absences are why. There is no
 * `position` to keep dense, because a note's display order is `start_minutes`
 * then `id` — a real quantity and a tie-break, not an index anyone maintains.
 * There is no unique key to honour, because a day may hold any number of notes.
 * And there are no joins, unlike `calendarItemsRepo`: a note carries its own
 * text and belongs to nothing but its day, so a row can already draw itself.
 *
 * Which lane a note occupies is not here either. It is derived on the client
 * from the day's notes (decision 5), so it is neither stored nor selected.
 *
 * Ownership: `listByOwner` scopes by joining out to `calendar_days`. Everything
 * else trusts its caller, the way `calendarItemsRepo` does — the route owes them
 * an id already cleared by `assertOwnership`.
 */

const SELECT_COLUMNS =
    'n.id, n.day_id, n.text, n.start_minutes, n.duration_minutes, n.created_at, n.updated_at';

/** The fields `update` will accept, and the column each one writes. */
const UPDATABLE_COLUMNS = {
    text: 'text',
    dayId: 'day_id',
    startMinutes: 'start_minutes',
    durationMinutes: 'duration_minutes',
};

const findById = async (conn, id) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS} FROM calendar_notes n WHERE n.id = ?`,
        [id]
    );

    return firstRow(rows) ?? null;
};

/** Every note in the owner's calendar, days left to right, notes top to bottom. */
const listByOwner = async (conn, ownerId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         FROM calendar_notes n
         JOIN calendar_days d ON d.id = n.day_id
         WHERE d.owner_id = ?
         ORDER BY d.position, n.start_minutes, n.id`,
        [ownerId]
    );

    return rows;
};

/**
 * One day's notes, in display order. This is what the lane check reads: the
 * server validates what is *now stored* rather than what was sent, because a day
 * holds notes the request never mentioned (design section 5.4).
 */
const listByDayId = async (conn, dayId) => {
    const [rows] = await conn.execute(
        `SELECT ${SELECT_COLUMNS}
         FROM calendar_notes n
         WHERE n.day_id = ?
         ORDER BY n.start_minutes, n.id`,
        [dayId]
    );

    return rows;
};

const create = async (conn, { dayId, text, startMinutes, durationMinutes }) => {
    const [result] = await conn.execute(
        `INSERT INTO calendar_notes (day_id, text, start_minutes, duration_minutes)
         VALUES (?, ?, ?, ?)`,
        [dayId, text, startMinutes, durationMinutes]
    );

    return findById(conn, result.insertId);
};

/**
 * Applies the named fields and leaves the rest alone. Returns the updated row,
 * or null when there was no such note.
 *
 * The column list is built by `buildAssignments` from a fixed allow-list rather
 * than from the caller's keys, so an unexpected field cannot reach the SQL and
 * identifiers are quoted rather than interpolated raw. Values still go through
 * placeholders. `buildAssignments` throws when the patch names nothing to
 * change — an empty patch is a caller bug, not something to silently succeed
 * at, and the router rejects one before it ever reaches here.
 */
const update = async (conn, id, fields) => {
    const { clause, values } = buildAssignments(fields, UPDATABLE_COLUMNS);

    const existing = await findById(conn, id);
    if (!existing) return null;

    await conn.execute(`UPDATE calendar_notes SET ${clause} WHERE id = ?`, [...values, id]);

    return findById(conn, id);
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM calendar_notes WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = { create, findById, listByDayId, listByOwner, remove, update };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
DB_NAME=planapp_test npx jest tests/integration/calendarNotesRepo.test.js
```

Expected: PASS, 10 tests.

> If `update` with a non-existent id returns a row rather than null, check that
> `existing` (read via `findById` before the `UPDATE`) is what is being tested,
> not the `UPDATE`'s own `affectedRows`.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/calendarNotesRepo.js tests/integration/calendarNotesRepo.test.js
git commit -m "feat: add calendarNotesRepo"
```

---

## Task 3: Ownership and serializer

**Files:**
- Modify: `src/middleware/assertOwnership.js`
- Modify: `src/lib/serializers.js`
- Test: `tests/integration/assertOwnership.test.js`
- Test: `tests/unit/serializers.test.js`

- [ ] **Step 1: Write the failing ownership test**

Append to `tests/integration/assertOwnership.test.js`, inside the existing top-level scope (match the file's existing `describe` style and its imports — add `calendarDaysRepo` and `calendarNotesRepo` requires at the top if they are not already there):

```js
describe('assertOwnership calendarNote', () => {
    test('returns the owning day row for the owner', async () => {
        // Arrange — someone else's day and note go in first, so a query that
        // forgot to filter by id would hand back theirs and fail here rather
        // than pass by accident on a table this test happens to be alone in.
        const conn = getConn();
        const intruderId = await createTestUser(conn);
        const intruderDay = await calendarDaysRepo.create(conn, { ownerId: intruderId });
        await calendarNotesRepo.create(conn, {
            dayId: intruderDay.id,
            text: 'not this one',
            startMinutes: 0,
            durationMinutes: 30,
        });
        const ownerId = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const owned = await assertOwnership(conn, 'calendarNote', note.id, ownerId);

        // Assert
        expect(owned.id).toBe(day.id);
        expect(owned.owner_id).toBe(ownerId);
    });

    test('rejects another user’s note', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        const note = await calendarNotesRepo.create(conn, {
            dayId: day.id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act & Assert
        await expect(
            assertOwnership(conn, 'calendarNote', note.id, strangerId)
        ).rejects.toMatchObject({ status: 403 });
    });

    test('404s for a note that is not there', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act & Assert
        await expect(
            assertOwnership(conn, 'calendarNote', 999999, ownerId)
        ).rejects.toMatchObject({ status: 404 });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
DB_NAME=planapp_test npx jest tests/integration/assertOwnership.test.js
```

Expected: FAIL — `Unknown resource type "calendarNote"`.

- [ ] **Step 3: Add the resource type**

In `src/middleware/assertOwnership.js`, add to `OWNER_QUERIES` after the `calendarDay` entry:

```js
    // Reached through its day, which is itself owned directly. So this is the
    // one two-hop query here that still does not touch `projects` — and, like
    // `calendarDay`, the row it returns is not a project row. Callers must not
    // read a project id off it. Unlike `calendarDay`, the returned row is also
    // not the requested resource: `owned.id` here is the day's id, not this
    // note's — callers already have the note's id from the route param.
    calendarNote: {
        label: 'Note',
        sql: `SELECT d.id, d.owner_id FROM calendar_notes n
              JOIN calendar_days d ON d.id = n.day_id
              WHERE n.id = ?`,
    },
```

- [ ] **Step 4: Run it to verify it passes**

```bash
DB_NAME=planapp_test npx jest tests/integration/assertOwnership.test.js
```

Expected: PASS.

- [ ] **Step 5: Write the failing serializer test**

Append to `tests/unit/serializers.test.js`:

```js
describe('toCalendarNote', () => {
    test('maps the row to the wire shape and drops timestamps', () => {
        // Arrange
        const row = {
            id: 7,
            day_id: 3,
            text: 'kids at home',
            start_minutes: 540,
            duration_minutes: 180,
            created_at: new Date('2026-09-16T08:00:00Z'),
            updated_at: new Date('2026-09-16T08:00:00Z'),
        };

        // Act
        const note = toCalendarNote(row);

        // Assert
        expect(note).toEqual({
            id: 7,
            dayId: 3,
            text: 'kids at home',
            startMinutes: 540,
            durationMinutes: 180,
        });
    });
});
```

Add `toCalendarNote` to the file's existing destructured `require` of `../../src/lib/serializers`.

- [ ] **Step 6: Run it to verify it fails**

```bash
DB_NAME=planapp_test npx jest tests/unit/serializers.test.js
```

Expected: FAIL — `toCalendarNote is not a function`.

- [ ] **Step 7: Add the serializer**

In `src/lib/serializers.js`, add before `module.exports` and include `toCalendarNote` in the exported object:

```js
/**
 * One note on its way to the browser.
 *
 * Narrower than `toCalendarItem`, which has to carry a project and a sequence so
 * a booking can draw itself after leaving the pool. A note belongs to nothing
 * but its day and carries its own text, so there is nothing to join and nothing
 * to pass through.
 *
 * No timestamps: nothing in the UI shows when a note was written. No lane
 * either — that is derived in the browser from the day's notes (decision 5).
 *
 * Times are integer minutes from midnight, never clock strings, matching every
 * other calendar serializer.
 */
const toCalendarNote = (row) => ({
    id: row.id,
    dayId: row.day_id,
    text: row.text,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
});
```

- [ ] **Step 8: Run both to verify they pass**

```bash
DB_NAME=planapp_test npx jest tests/unit/serializers.test.js tests/integration/assertOwnership.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/middleware/assertOwnership.js src/lib/serializers.js tests/integration/assertOwnership.test.js tests/unit/serializers.test.js
git commit -m "feat: teach ownership and serializers about calendar notes"
```

---

## Task 4: The shared lane-case table

**Files:**
- Create: `src/shared/noteLaneCases.json`

This table is read by two test suites in two bundles (Task 5 on the server, Task 7 on the client). It exists because no single test can import both: the client is ESM behind CRA's module scope, the server is CommonJS under the root Jest config. This is the same mechanism `src/shared/frontierFixtures.json` already provides for the ready frontier.

- [ ] **Step 1: Write the table**

Create `src/shared/noteLaneCases.json`:

```json
{
  "README": "Note lane arrangements (design 2026-09-16, decisions 4-7). The client assigns lanes greedily right-to-left in src/client/src/lib/noteLanes.js; the server enforces the cap by sweeping for maximum overlap in src/lib/calendarNoteLanes.js. Decision 7 is the claim that those are the same rule. Both suites read this one table so the two cannot drift apart silently. Client suite: src/client/src/lib/noteLanes.fixtures.test.js. Server suite: tests/unit/calendarNoteLanes.test.js. Notes are in the API's camelCase wire shape. `lanes` maps note id to expected lane, and is null when the arrangement is illegal. Notes within a case are listed in arbitrary order; an implementation must sort by (startMinutes, id) before assigning lanes, not rely on input order. Lane numbers are arbitrary slots with no screen position of their own; that lane 0 renders rightmost is a decision in the design spec, not in this table.",
  "maxLanes": 4,
  "cases": [
    {
      "name": "no notes at all",
      "notes": [],
      "maxOverlap": 0,
      "lanes": {}
    },
    {
      "name": "a lone note takes lane 0",
      "notes": [{ "id": 1, "startMinutes": 540, "durationMinutes": 60 }],
      "maxOverlap": 1,
      "lanes": { "1": 0 }
    },
    {
      "name": "notes that do not overlap share lane 0",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 2, "startMinutes": 660, "durationMinutes": 60 }
      ],
      "maxOverlap": 1,
      "lanes": { "1": 0, "2": 0 }
    },
    {
      "name": "end-to-start contact is not an overlap",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 2, "startMinutes": 600, "durationMinutes": 60 }
      ],
      "maxOverlap": 1,
      "lanes": { "1": 0, "2": 0 }
    },
    {
      "name": "two overlapping notes fill lanes 0 and 1",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 120 },
        { "id": 2, "startMinutes": 600, "durationMinutes": 120 }
      ],
      "maxOverlap": 2,
      "lanes": { "1": 0, "2": 1 }
    },
    {
      "name": "equal starts break the tie by id",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 2, "startMinutes": 540, "durationMinutes": 60 }
      ],
      "maxOverlap": 2,
      "lanes": { "1": 0, "2": 1 }
    },
    {
      "name": "a freed lane is reused by a later note",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 300 },
        { "id": 2, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 3, "startMinutes": 660, "durationMinutes": 60 }
      ],
      "maxOverlap": 2,
      "lanes": { "1": 0, "2": 1, "3": 1 }
    },
    {
      "name": "a note nested inside another takes the next lane",
      "notes": [
        { "id": 1, "startMinutes": 0, "durationMinutes": 1440 },
        { "id": 2, "startMinutes": 600, "durationMinutes": 60 }
      ],
      "maxOverlap": 2,
      "lanes": { "1": 0, "2": 1 }
    },
    {
      "name": "a staircase of four fills every lane",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 240 },
        { "id": 2, "startMinutes": 570, "durationMinutes": 240 },
        { "id": 3, "startMinutes": 600, "durationMinutes": 240 },
        { "id": 4, "startMinutes": 630, "durationMinutes": 240 }
      ],
      "maxOverlap": 4,
      "lanes": { "1": 0, "2": 1, "3": 2, "4": 3 }
    },
    {
      "name": "four overlapping notes are legal at exactly the cap",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 2, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 3, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 4, "startMinutes": 540, "durationMinutes": 60 }
      ],
      "maxOverlap": 4,
      "lanes": { "1": 0, "2": 1, "3": 2, "4": 3 }
    },
    {
      "name": "a fifth overlapping note is refused",
      "notes": [
        { "id": 1, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 2, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 3, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 4, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 5, "startMinutes": 540, "durationMinutes": 60 }
      ],
      "maxOverlap": 5,
      "lanes": null
    },
    {
      "name": "five notes that never all overlap at once are legal",
      "notes": [
        { "id": 1, "startMinutes": 0, "durationMinutes": 120 },
        { "id": 2, "startMinutes": 0, "durationMinutes": 120 },
        { "id": 3, "startMinutes": 0, "durationMinutes": 120 },
        { "id": 4, "startMinutes": 0, "durationMinutes": 120 },
        { "id": 5, "startMinutes": 120, "durationMinutes": 120 }
      ],
      "maxOverlap": 4,
      "lanes": { "1": 0, "2": 1, "3": 2, "4": 3, "5": 0 }
    },
    {
      "name": "a fifth overlapping note only in the middle of the day is refused",
      "notes": [
        { "id": 1, "startMinutes": 0, "durationMinutes": 1440 },
        { "id": 2, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 3, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 4, "startMinutes": 540, "durationMinutes": 60 },
        { "id": 5, "startMinutes": 540, "durationMinutes": 60 }
      ],
      "maxOverlap": 5,
      "lanes": null
    },
    {
      "name": "input order does not decide lanes",
      "notes": [
        { "id": 3, "startMinutes": 780, "durationMinutes": 180 },
        { "id": 4, "startMinutes": 600, "durationMinutes": 120 },
        { "id": 2, "startMinutes": 540, "durationMinutes": 240 },
        { "id": 1, "startMinutes": 720, "durationMinutes": 180 }
      ],
      "maxOverlap": 2,
      "lanes": { "1": 1, "2": 0, "3": 0, "4": 1 }
    }
  ]
}
```

- [ ] **Step 2: Verify it is valid JSON**

```bash
node -e "const t=require('./src/shared/noteLaneCases.json'); console.log(t.cases.length, 'cases');"
```

Expected: `14 cases`

- [ ] **Step 3: Commit**

```bash
git add src/shared/noteLaneCases.json
git commit -m "test: add the shared note-lane case table"
```

---

## Task 5: `lib/calendarNoteLanes.js` (server)

**Files:**
- Create: `src/lib/calendarNoteLanes.js`
- Test: `tests/unit/calendarNoteLanes.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/calendarNoteLanes.test.js`:

```js
'use strict';

const cases = require('../../src/shared/noteLaneCases.json');
const {
    MAX_NOTE_LANES,
    findLaneProblem,
    maxOverlap,
} = require('../../src/lib/calendarNoteLanes');

/**
 * The server's half of decision 7. The client assigns lanes greedily and the
 * server counts maximum overlap; the claim is that those refuse exactly the
 * same arrangements. Neither side can import the other, so both read one table.
 *
 * The client twin of this file is
 * `src/client/src/lib/noteLanes.fixtures.test.js`.
 */

describe('the shared table', () => {
    test('is actually loaded, and agrees on the cap', () => {
        expect(cases.cases.length).toBeGreaterThan(0);
        expect(cases.maxLanes).toBe(MAX_NOTE_LANES);
    });
});

describe('maxOverlap against the shared table', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Act & Assert
            expect(maxOverlap(testCase.notes)).toBe(testCase.maxOverlap);
        });
    });
});

describe('findLaneProblem against the shared table', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Arrange
            const isLegal = testCase.lanes !== null;

            // Act
            const problem = findLaneProblem(testCase.notes);

            // Assert
            if (isLegal) expect(problem).toBeNull();
            else expect(problem).toMatch(/at most 4 notes/);
        });
    });
});

describe('maxOverlap', () => {
    test('a zero-duration note is invisible to the sweep, which the router\'s minimum duration prevents', () => {
        // Arrange — the notes router's minimum duration (Task 6) is the only
        // thing keeping this input from ever reaching here for real.
        const notes = [
            { id: 1, startMinutes: 0, durationMinutes: 0 },
            { id: 2, startMinutes: 0, durationMinutes: 0 },
            { id: 3, startMinutes: 0, durationMinutes: 0 },
            { id: 4, startMinutes: 0, durationMinutes: 0 },
            { id: 5, startMinutes: 0, durationMinutes: 0 },
        ];

        // Act & Assert
        expect(maxOverlap(notes)).toBe(0);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
DB_NAME=planapp_test npx jest tests/unit/calendarNoteLanes.test.js
```

Expected: FAIL — `Cannot find module '../../src/lib/calendarNoteLanes'`.

- [ ] **Step 3: Write the module**

Create `src/lib/calendarNoteLanes.js`:

```js
'use strict';

/**
 * Whether a day's notes are a legal arrangement (design 2026-09-16, section 5.4).
 *
 * Beside `lib/calendarPlacement.js` and following its conventions: pure
 * functions over plain data, each returning a human-readable message or null,
 * so the whole rule set is testable without a connection.
 *
 * The rule is a count, not a layout. This file has no concept of a lane being
 * leftmost or rightmost and never assigns one — that is the browser's business
 * (`src/client/src/lib/noteLanes.js`), because it is a drawing decision that has
 * to be recomputed on every pointer move.
 *
 * What makes the two sides agree is decision 7. The client fills the
 * lowest-numbered free lane, walking notes in start order — greedy colouring of
 * an interval graph, which is optimal and therefore uses exactly as many lanes
 * as the maximum number of notes overlapping at any one minute. So "the client
 * found no free lane" and "this sweep exceeds the cap" are the same condition
 * rather than two that happen to agree today.
 *
 * `src/shared/noteLaneCases.json` is what keeps that honest across the bundle
 * boundary; see this module's test for the shape of that arrangement.
 */

/** Four lanes. Wider than this and the rotated text stops being readable. */
const MAX_NOTE_LANES = 4;

/**
 * The largest number of notes covering any single minute.
 *
 * A sweep rather than a pairwise comparison: +1 at each start, -1 at each end,
 * sorted, running maximum. Pairwise would be quadratic and would also have to
 * decide what "overlapping" means for three notes that pairwise overlap but
 * never coincide — a question the sweep does not have to ask.
 *
 * Ends sort before starts at the same minute, which is what makes contact
 * non-overlapping: a note ending at 10:00 and one starting at 10:00 may share a
 * lane, so the -1 must land first or the count would briefly read 2.
 *
 * Assumes `durationMinutes > 0`. A zero-duration note's start and end land on
 * the same minute, and that same ends-before-starts tie-break cancels its +1
 * before `running` ever sees it — the note is invisible for its whole
 * existence, not just at its boundary. This file does not guard against that;
 * the notes router's minimum duration does, the same way `routes/calendar.js`
 * owns the arithmetic this module never re-checks.
 */
const maxOverlap = (notes) => {
    const events = notes.flatMap((note) => [
        { at: note.startMinutes, delta: 1 },
        { at: note.startMinutes + note.durationMinutes, delta: -1 },
    ]);

    events.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.delta - b.delta));

    let running = 0;
    let highest = 0;

    for (const event of events) {
        running += event.delta;
        if (running > highest) highest = running;
    }

    return highest;
};

/**
 * The cap, as a message or null.
 *
 * Runs on what is *now stored* rather than on what a request carried. A day
 * holds notes the request never mentioned, and a check that read only the
 * payload would sail straight past them — the same rule `routes/calendar.js`
 * applies to booking overlap, for the same reason.
 */
const findLaneProblem = (notes) => {
    const overlap = maxOverlap(notes);

    if (overlap <= MAX_NOTE_LANES) return null;

    return (
        `a day may hold at most ${MAX_NOTE_LANES} notes overlapping at once; ` +
        `this would make ${overlap}`
    );
};

module.exports = { MAX_NOTE_LANES, findLaneProblem, maxOverlap };
```

- [ ] **Step 4: Run it to verify it passes**

```bash
DB_NAME=planapp_test npx jest tests/unit/calendarNoteLanes.test.js
```

Expected: PASS, 30 tests — one table-sanity check, the 14 shared cases in each of the two describe blocks, and one dedicated `maxOverlap` test pinning the zero-duration precondition.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendarNoteLanes.js tests/unit/calendarNoteLanes.test.js
git commit -m "feat: add the server-side note lane cap"
```

---

## Task 6: `routes/calendarNotes.js`

**Files:**
- Create: `src/routes/calendarNotes.js`
- Modify: `src/server.js`
- Test: `tests/integration/calendarNotesRoutes.test.js`

- [ ] **Step 1: Find the mount point**

```bash
grep -n "api/calendar" src/server.js
```

Expected: one line mounting `src/routes/calendar.js`. The new router mounts on the more specific path **before** it, so `/api/calendar/notes` is not swallowed by the calendar router's own `/:id`-shaped routes.

- [ ] **Step 2: Write the failing route test**

Create `tests/integration/calendarNotesRoutes.test.js`:

```js
'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarNotesRepo = require('../../src/db/repositories/calendarNotesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The note endpoints (design 2026-09-16, section 5). Every request runs on the
 * connection the test opened, so everything the routes write is rolled back
 * afterwards (tests/helpers/db.js).
 *
 * Two properties are asserted throughout: nothing crosses an ownership boundary,
 * and a refused write leaves nothing behind.
 */

const createWorld = async (conn, { dayCount = 2 } = {}) => {
    const ownerId = await createTestUser(conn);
    const days = [];

    for (let index = 0; index < dayCount; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        days.push(await calendarDaysRepo.create(conn, { ownerId }));
    }

    return { ownerId, days };
};

const body = (overrides = {}) => ({
    text: 'on call',
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

describe('GET /api/calendar/notes', () => {
    test('returns an empty list for a new user', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.notes).toEqual([]);
    });

    test('returns only the caller’s notes, in the wire shape', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const stranger = await createWorld(conn);

        await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: stranger.days[0].id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .get('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.body.data.notes).toHaveLength(1);
        expect(response.body.data.notes[0]).toEqual({
            id: expect.any(Number),
            dayId: days[0].id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });
});

describe('POST /api/calendar/notes', () => {
    test('creates a note and answers 201', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id }));

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });

    test('trims the text', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, text: '  on call  ' }));

        // Assert
        expect(response.body.data.text).toBe('on call');
    });

    test('refuses a day belonging to someone else', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const stranger = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: stranger.days[0].id }));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarNotesRepo.listByDayId(conn, stranger.days[0].id)).toEqual([]);
    });

    test.each([
        ['an off-grid start', { startMinutes: 545 }],
        ['an off-grid duration', { durationMinutes: 45 }],
        ['a negative start', { startMinutes: -30 }],
        ['a duration below the minimum', { durationMinutes: 0 }],
        ['empty text', { text: '   ' }],
    ])('refuses %s', async (unused, override) => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, ...override }));

        // Assert
        expect(response.status).toBe(400);
        expect(await calendarNotesRepo.listByDayId(conn, days[0].id)).toEqual([]);
    });

    test('refuses a note running past midnight', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, startMinutes: 1410, durationMinutes: 60 }));

        // Assert
        expect(response.status).toBe(400);
        expect(await calendarNotesRepo.listByDayId(conn, days[0].id)).toEqual([]);
    });

    test('refuses the fifth overlapping note and stores nothing', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await calendarNotesRepo.create(conn, {
                dayId: days[0].id,
                text: `note ${index}`,
                startMinutes: 540,
                durationMinutes: 60,
            });
        }

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, text: 'the fifth' }));

        // Assert
        expect(response.status).toBe(400);
        expect(await calendarNotesRepo.listByDayId(conn, days[0].id)).toHaveLength(4);
    });

    test('allows a fifth note that does not overlap the other four', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await calendarNotesRepo.create(conn, {
                dayId: days[0].id,
                text: `note ${index}`,
                startMinutes: 540,
                durationMinutes: 60,
            });
        }

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, text: 'later', startMinutes: 600 }));

        // Assert
        expect(response.status).toBe(201);
    });
});

describe('PATCH /api/calendar/notes/:id', () => {
    test('moves a note to another day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ dayId: days[1].id, startMinutes: 600 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ dayId: days[1].id, startMinutes: 600 });
    });

    test('renames a note without moving it', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'on call (swapped)' });

        // Assert
        expect(response.body.data).toMatchObject({
            text: 'on call (swapped)',
            startMinutes: 540,
            dayId: days[0].id,
        });
    });

    test('refuses an empty body', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(400);
    });

    test('refuses another user’s note', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const stranger = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: stranger.days[0].id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'mine now' });

        // Assert
        expect(response.status).toBe(403);
        expect((await calendarNotesRepo.findById(conn, note.id)).text).toBe('theirs');
    });

    test('refuses a move into another user’s day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const stranger = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ dayId: stranger.days[0].id });

        // Assert
        expect(response.status).toBe(403);
        expect((await calendarNotesRepo.findById(conn, note.id)).day_id).toBe(days[0].id);
    });

    test('rolls back a move that would make a fifth overlap', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await calendarNotesRepo.create(conn, {
                dayId: days[1].id,
                text: `note ${index}`,
                startMinutes: 540,
                durationMinutes: 60,
            });
        }

        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'the fifth',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ dayId: days[1].id });

        // Assert
        expect(response.status).toBe(400);
        expect((await calendarNotesRepo.findById(conn, note.id)).day_id).toBe(days[0].id);
        expect(await calendarNotesRepo.listByDayId(conn, days[1].id)).toHaveLength(4);
    });

    test('lets a note stay where it is when the day is already at the cap', async () => {
        // Arrange — the note being resized is one of the four, so excluding it
        // is what makes this legal. A check that counted it twice would refuse.
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const notes = [];

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            notes.push(
                await calendarNotesRepo.create(conn, {
                    dayId: days[0].id,
                    text: `note ${index}`,
                    startMinutes: 540,
                    durationMinutes: 60,
                })
            );
        }

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${notes[0].id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ durationMinutes: 120 });

        // Assert
        expect(response.status).toBe(200);
    });
});

describe('DELETE /api/calendar/notes/:id', () => {
    test('deletes the note', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'gone',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: note.id });
        expect(await calendarNotesRepo.findById(conn, note.id)).toBeNull();
    });

    test('refuses another user’s note', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const stranger = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: stranger.days[0].id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarNotesRepo.findById(conn, note.id)).not.toBeNull();
    });
});

describe('deleting a day', () => {
    test('takes its notes with it and says nothing about them', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'context',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/days/${days[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});

describe('authentication', () => {
    test.each([
        ['get', '/api/calendar/notes'],
        ['post', '/api/calendar/notes'],
        ['patch', '/api/calendar/notes/1'],
        ['delete', '/api/calendar/notes/1'],
    ])('%s %s requires a token', async (method, path) => {
        // Act
        const response = await request(app)[method](path).send({});

        // Assert
        expect(response.status).toBe(401);
    });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
DB_NAME=planapp_test npx jest tests/integration/calendarNotesRoutes.test.js
```

Expected: FAIL — 404s everywhere, because nothing is mounted yet.

- [ ] **Step 4: Write the router**

Create `src/routes/calendarNotes.js`:

```js
'use strict';

const express = require('express');
const { z } = require('zod');

const asyncRoute = require('../lib/asyncRoute');
const assertOwnership = require('../middleware/assertOwnership');
const calendarNotesRepo = require('../db/repositories/calendarNotesRepo');
const { badRequest, notFound } = require('../lib/httpError');
const { DAY_MINUTES, SLOT_MINUTES } = require('../lib/calendarPlacement');
const { findLaneProblem } = require('../lib/calendarNoteLanes');
const { toCalendarNote } = require('../lib/serializers');
const { idSchema, parseId } = require('../lib/validation');
const { withConnection, withTransaction } = require('../db/unitOfWork');

/**
 * Notes (design 2026-09-16, section 5). Mounted at `/api/calendar/notes` behind
 * `isAuth`, so `req.user.id` is the owner and every id the caller hands in is
 * checked against them before anything is touched.
 *
 * Plain REST, deliberately, where bookings get a bulk endpoint. `PUT
 * /api/calendar/items` is bulk and atomic because one booking gesture settles a
 * whole day, can move a dozen rows across three days, and can invent a day that
 * did not exist. None of that is true of a note: notes do not cascade and do not
 * spill (decisions 2 and 8), so **a note gesture touches exactly one row and can
 * never create a day**. Routing it through the bulk endpoint would buy nothing
 * and would hand the cascade a notes dimension it has no use for.
 *
 * What this file owes the database is the same narrow promise `routes/calendar.js`
 * makes: whatever it stores is a *legal* day. For notes that is two things — the
 * arithmetic of one note, and the four-lane cap across the day.
 */

const router = express.Router();

// Notes and bookings share a day, a clock and a grid (design 2026-09-16,
// section 5) — `DAY_MINUTES` and `SLOT_MINUTES` come from `calendarPlacement`
// rather than being restated here, so the two grids cannot drift apart.
// `MIN_DURATION` and `MAX_TEXT_LENGTH` stay local: they are note-specific
// rules that merely happen to share a value with something else today, not
// facts about the shared grid.
const MIN_DURATION = 30;
const MAX_TEXT_LENGTH = 500;

const slotAlignedSchema = (label) =>
    z
        .number({ error: `${label} must be an integer number of minutes` })
        .int(`${label} must be an integer number of minutes`)
        .refine((value) => value % SLOT_MINUTES === 0, {
            message: `${label} must be a multiple of ${SLOT_MINUTES}`,
        });

const startSchema = slotAlignedSchema('startMinutes').min(0, 'startMinutes must be 0 or more');

const durationSchema = slotAlignedSchema('durationMinutes')
    .min(MIN_DURATION, `durationMinutes must be at least ${MIN_DURATION}`)
    .max(DAY_MINUTES, `durationMinutes must be at most ${DAY_MINUTES}`);

/**
 * Trimmed before it is measured, so a note of nothing but spaces is empty rather
 * than three characters long.
 */
const textSchema = z
    .string({ error: 'text must be a string' })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: 'text must not be empty' })
    .refine((value) => value.length <= MAX_TEXT_LENGTH, {
        message: `text must be at most ${MAX_TEXT_LENGTH} characters`,
    });

const createSchema = z.object({
    dayId: idSchema,
    text: textSchema,
    startMinutes: startSchema,
    durationMinutes: durationSchema,
});

/**
 * Every field optional, but not all of them at once: an empty body means the
 * caller has asked for nothing, which is a mistake worth reporting rather than a
 * write to perform.
 */
const updateSchema = z
    .object({
        dayId: idSchema.optional(),
        text: textSchema.optional(),
        startMinutes: startSchema.optional(),
        durationMinutes: durationSchema.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
        message: 'name at least one field to change',
    });

/**
 * A note may not run past midnight (decision 8).
 *
 * Checked against the *resulting* note rather than against the request, because
 * a `PATCH` may move only one of the two numbers: a note lengthened without
 * being moved, or moved without being lengthened, can each fall off the end of
 * the day on their own.
 */
const assertWithinDay = ({ startMinutes, durationMinutes }) => {
    if (startMinutes + durationMinutes > DAY_MINUTES) {
        throw badRequest(
            `a note must end by the end of its day; this one would end at ` +
                `${startMinutes + durationMinutes} minutes`
        );
    }
};

/**
 * Locks the day row so a concurrent writer to the *same* day serializes
 * behind this transaction. Must be the very first statement to touch that
 * row in the transaction — see the "Concurrency" section of the comment on
 * `assertLanesFit` below for why "somewhere before the cap read" is not
 * good enough.
 */
const lockDay = async (conn, dayId) => {
    await conn.execute('SELECT id FROM calendar_days WHERE id = ? FOR UPDATE', [dayId]);
};

/**
 * Locks the note being patched and returns its current `day_id`, or `null`
 * if the note does not exist. `PATCH` needs this to know which day to lock
 * *before* it can call `assertOwnership` — see `lockDay`.
 *
 * A locking read, not a plain one, and that distinction is the entire point:
 * see `lockDay`.
 */
const lockNoteRow = async (conn, id) => {
    const [rows] = await conn.execute(
        'SELECT day_id FROM calendar_notes WHERE id = ? FOR UPDATE',
        [id]
    );

    return rows.length > 0 ? rows[0].day_id : null;
};

/**
 * The cap, read back off the database after the write and inside the same
 * transaction, so a violation rolls the write away.
 *
 * Only the day the note has landed in is checked. A move also empties a slot in
 * the day it left, and removing a note can never raise that day's maximum
 * overlap — so re-reading it would always pass and cost a query. `DELETE` is not
 * checked at all, for the same reason.
 *
 * --- Concurrency ---
 *
 * `listByDayId` below is a plain `SELECT`. Under InnoDB's default REPEATABLE
 * READ, every plain read in a transaction shares the snapshot established by
 * that transaction's *first* plain read — not "the state right now". Both
 * `POST` and `PATCH` run `assertOwnership`'s plain `SELECT` before this
 * function ever runs, so by the time this function's read happens, the
 * snapshot is already fixed. Two transactions racing to fill the same day can
 * each see the same "3 notes, room for a 4th" snapshot, each insert a 4th,
 * and each commit — four notes apiece having each individually passed the
 * check, five actually on the row when it's done.
 *
 * A `FOR UPDATE` lock taken *here*, immediately before this read, does not
 * fix that: the snapshot was already fixed earlier, so the read still can't
 * see what the other transaction committed while this one waited. It also
 * introduces a real deadlock, measured while building this fix: inserting a
 * note takes an implicit shared lock on its day row (to check the foreign
 * key), so two concurrent inserts into the same day both hold that shared
 * lock, and a `FOR UPDATE` issued by either one afterwards wants an
 * exclusive lock the other is holding a shared lock against — classic
 * deadlock, reproduced in 5/5 runs of a throwaway script.
 *
 * The fix that actually works — `lockDay` / `lockNoteRow` above — takes the
 * exclusive lock as the *first* statement of the transaction, before
 * `assertOwnership`'s read and before any insert or update. A second writer
 * to the same day then blocks on that lock before its own snapshot exists;
 * once it proceeds, everything the first writer committed is visible to it.
 * Measured: 5/5 runs correct, 0 deadlocks, for both the plain create race and
 * the PATCH move-into-the-same-day race. See the "Concurrency" note in
 * `docs/superpowers/specs/2026-09-16-calendar-notes-design.md` section 5.3.
 */
const assertLanesFit = async (conn, dayId) => {
    const stored = await calendarNotesRepo.listByDayId(conn, dayId);

    const problem = findLaneProblem(
        stored.map((row) => ({
            id: row.id,
            startMinutes: row.start_minutes,
            durationMinutes: row.duration_minutes,
        }))
    );

    if (problem) throw badRequest(problem);
};

// GET /api/calendar/notes — every note in the owner's calendar.
//
// Its own request rather than a field on `GET /api/calendar`, because the page
// loads it with its own hook and reports its own failure: a strip whose notes
// failed to load is still a usable calendar (design section 7.1).
router.get(
    '/',
    asyncRoute(async (req, res) => {
        const notes = await withConnection((conn) =>
            calendarNotesRepo.listByOwner(conn, req.user.id)
        );

        res.sendData({ notes: notes.map(toCalendarNote) });
    })
);

// POST /api/calendar/notes — a new note in a day.
router.post(
    '/',
    asyncRoute(async (req, res) => {
        const { dayId, text, startMinutes, durationMinutes } = createSchema.parse(req.body ?? {});

        assertWithinDay({ startMinutes, durationMinutes });

        const note = await withTransaction(async (conn) => {
            // First statement in the transaction, before assertOwnership's
            // plain read — see the concurrency note on assertLanesFit.
            await lockDay(conn, dayId);

            await assertOwnership(conn, 'calendarDay', dayId, req.user.id);

            const created = await calendarNotesRepo.create(conn, {
                dayId,
                text,
                startMinutes,
                durationMinutes,
            });

            await assertLanesFit(conn, dayId);

            return created;
        });

        res.sendData(toCalendarNote(note), 201);
    })
);

// PATCH /api/calendar/notes/:id — rename, move, or resize.
//
// One endpoint for all three because they are one row write. Which fields a
// gesture happens to send is the client's business, not a reason for three
// routes that would each repeat the same ownership and cap checks.
router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);
        const fields = updateSchema.parse(req.body ?? {});

        const note = await withTransaction(async (conn) => {
            // Which day this write could overflow is not yet known here: a
            // move names it (`fields.dayId`), otherwise it's the note's
            // current day, which is only knowable by reading the note. Both
            // locks must land before any plain read in this transaction —
            // see the concurrency note on assertLanesFit — so the note's
            // current day is read with its own locking read (lockNoteRow)
            // rather than through assertOwnership, whose SELECT is a plain
            // read that would fix the snapshot too early.
            const currentDayId = await lockNoteRow(conn, id);
            const targetDayId = fields.dayId ?? currentDayId;
            if (targetDayId !== null) {
                await lockDay(conn, targetDayId);
            }

            await assertOwnership(conn, 'calendarNote', id, req.user.id);

            // A move names a day that has never been checked against this user.
            // Without this, a note could be walked into a stranger's calendar.
            if (fields.dayId !== undefined) {
                await assertOwnership(conn, 'calendarDay', fields.dayId, req.user.id);
            }

            const existing = await calendarNotesRepo.findById(conn, id);
            if (!existing) throw notFound('Note');

            assertWithinDay({
                startMinutes: fields.startMinutes ?? existing.start_minutes,
                durationMinutes: fields.durationMinutes ?? existing.duration_minutes,
            });

            const updated = await calendarNotesRepo.update(conn, id, fields);
            if (!updated) throw notFound('Note');

            await assertLanesFit(conn, updated.day_id);

            return updated;
        });

        res.sendData(toCalendarNote(note));
    })
);

// DELETE /api/calendar/notes/:id — the popover's Delete.
router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
        const id = parseId(req.params.id);

        const deleted = await withTransaction(async (conn) => {
            await assertOwnership(conn, 'calendarNote', id, req.user.id);

            return calendarNotesRepo.remove(conn, id);
        });

        // `assertOwnership` has already answered 404 for a note this
        // transaction never saw, but a note can still vanish between that
        // check and this delete: a second request racing this one can
        // commit its own delete first, and this one's `DELETE` then affects
        // zero rows. Answering 404 here is the correct response to that,
        // not a dead branch — the same backstop `DELETE /calendar/days/:id`
        // carries for the same reason.
        if (!deleted) throw notFound('Note');

        res.sendData({ id });
    })
);

module.exports = router;
```

- [ ] **Step 5: Mount it**

In `src/server.js`, beside the existing calendar mount, **above** it:

```js
// The more specific mount comes first, so `/api/calendar/notes` is not
// swallowed by the calendar router's own `/:id` routes.
app.use('/api/calendar/notes', isAuth, respond, calendarNotesRoutes);
app.use('/api/calendar', isAuth, require('./routes/calendar'));
```

Match the surrounding file's exact style for `isAuth` and the require — if the existing calendar line imports the router at the top of the file rather than inline, do the same for this one.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
DB_NAME=planapp_test npx jest tests/integration/calendarNotesRoutes.test.js
```

Expected: PASS, 27 tests — the POST validation `test.each` carries five rows, not four.

> If every request 404s, the mount order is wrong — `/api/calendar/notes` must be
> registered before `/api/calendar`.
>
> If `response.body.data` is undefined, check how `res.sendData` shapes a
> response in `src/lib/respond.js` and match the existing calendar route tests.

- [ ] **Step 7: Run the whole server suite**

```bash
DB_NAME=planapp_test npm test
```

Expected: PASS. Nothing existing should have moved.

- [ ] **Step 8: Commit**

```bash
git add src/routes/calendarNotes.js src/server.js tests/integration/calendarNotesRoutes.test.js
git commit -m "feat: add the calendar notes API"
```

---

## Task 7: `lib/noteLanes.js` (client)

**Files:**
- Create: `src/client/src/lib/noteLanes.js`
- Test: `src/client/src/lib/noteLanes.test.js`
- Test: `src/client/src/lib/noteLanes.fixtures.test.js`

- [ ] **Step 1: Write the failing behaviour test**

Create `src/client/src/lib/noteLanes.test.js`:

```js
import { MAX_NOTE_LANES, assignLanes, canPlace } from './noteLanes';

/**
 * The lane picker. Everything the notes plane draws trusts this, and the live
 * refusal during a gesture is `canPlace` and nothing else.
 *
 * The arrangements themselves are covered by the shared table in
 * `noteLanes.fixtures.test.js`; what is here is the behaviour that table cannot
 * express — how a candidate is tested, and what happens past the cap.
 */

const note = (id, startMinutes, durationMinutes) => ({ id, startMinutes, durationMinutes });

describe('assignLanes', () => {
    test('returns an empty map for a day with no notes', () => {
        // Act & Assert
        expect(assignLanes([])).toEqual(new Map());
    });

    test('fills lane 0 first, which is drawn rightmost', () => {
        // Arrange
        const notes = [note(1, 540, 60)];

        // Act
        const lanes = assignLanes(notes);

        // Assert
        expect(lanes.get(1)).toBe(0);
    });

    test('does not mutate the array it is given', () => {
        // Arrange
        const notes = [note(2, 600, 60), note(1, 540, 60)];
        const before = [...notes];

        // Act
        assignLanes(notes);

        // Assert
        expect(notes).toEqual(before);
    });

    test('maps a note with no free lane to null rather than dropping it', () => {
        // Arrange — five at the same minute, one past the cap
        const notes = [1, 2, 3, 4, 5].map((id) => note(id, 540, 60));

        // Act
        const lanes = assignLanes(notes);

        // Assert
        expect(lanes.size).toBe(5);
        expect(lanes.get(5)).toBeNull();
    });

    test('is stable across runs for notes sharing a start', () => {
        // Arrange
        const notes = [note(3, 540, 60), note(1, 540, 60), note(2, 540, 60)];

        // Act
        const first = assignLanes(notes);
        const second = assignLanes([...notes].reverse());

        // Assert
        expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
    });
});

describe('canPlace', () => {
    test('allows a note into an empty day', () => {
        // Act & Assert
        expect(canPlace([], note(1, 540, 60))).toBe(true);
    });

    test('allows a fifth note that overlaps nothing', () => {
        // Arrange
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert
        expect(canPlace(existing, note(5, 600, 60))).toBe(true);
    });

    test('refuses a fifth note that overlaps the other four', () => {
        // Arrange
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert
        expect(canPlace(existing, note(5, 540, 60))).toBe(false);
    });

    test('excludes the candidate’s own row, so a note can be resized in a full day', () => {
        // Arrange — the candidate IS one of the four already there. Counting it
        // twice would refuse a resize that is plainly legal.
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert
        expect(canPlace(existing, note(1, 540, 120))).toBe(true);
    });

    test('refuses a note that would run past midnight', () => {
        // Act & Assert
        expect(canPlace([], note(1, 1410, 60))).toBe(false);
    });

    test('refuses a note starting before midnight', () => {
        // Act & Assert
        expect(canPlace([], note(1, -30, 60))).toBe(false);
    });

    test('treats end-to-start contact as free', () => {
        // Arrange
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));

        // Act & Assert — starts exactly where the others end
        expect(canPlace(existing, note(5, 600, 60))).toBe(true);
    });
});

describe('canPlace with an id-less candidate', () => {
    // A note being created has no id yet — that shape is not in the shared
    // table, which has no notion of an id-less note, so these belong here.

    test('refuses a tied draft when the day is already at capacity', () => {
        // Arrange — four existing notes fill every lane; the draft shares
        // their start and has no id, which is what a note being created
        // looks like before it is saved.
        const existing = [1, 2, 3, 4].map((id) => note(id, 540, 60));
        const draft = { startMinutes: 540, durationMinutes: 60 };

        // Act & Assert
        expect(canPlace(existing, draft)).toBe(false);
    });

    test('allows a tied draft when the day is under capacity', () => {
        // Arrange — three existing notes leave a lane free
        const existing = [1, 2, 3].map((id) => note(id, 540, 60));
        const draft = { startMinutes: 540, durationMinutes: 60 };

        // Act & Assert
        expect(canPlace(existing, draft)).toBe(true);
    });
});

describe('MAX_NOTE_LANES', () => {
    test('is four', () => {
        expect(MAX_NOTE_LANES).toBe(4);
    });
});
```

> **Post-review addendum (commit `db313af`):** review before Tasks 16/18 land found
> that the `a.id - b.id` tie-break above is `NaN` when `candidate` has no id yet
> (a note being created), and a comparator returning `NaN` is treated as "equal" —
> so an id-less draft's lane at capacity depended on which side of
> `[...siblings, candidate]` it landed on, correct only because that spread
> happens to put it last. The two tests above, and the explicit tie-break in
> Step 4 below, close that gap. See that commit's message for the full finding.

- [ ] **Step 2: Write the failing fixture test**

Create `src/client/src/lib/noteLanes.fixtures.test.js`:

```js
import cases from '../../../shared/noteLaneCases.json';

import { MAX_NOTE_LANES, assignLanes } from './noteLanes';

/**
 * The client's half of decision 7. The browser assigns lanes greedily and the
 * server counts maximum overlap; the claim is that those refuse exactly the same
 * arrangements.
 *
 * Neither side can import the other — this bundle is ESM behind CRA's module
 * scope and the server is CommonJS under the root Jest config — so both read one
 * table, exactly as the ready frontier already does in `graph.frontier.test.js`.
 *
 * The server twin of this file is `tests/unit/calendarNoteLanes.test.js`.
 */

/** The map, as the table writes it: plain object, string keys, null for refused. */
const summarise = (lanes) => {
    const entries = [...lanes.entries()].map(([id, lane]) => [String(id), lane]);

    return Object.fromEntries(entries);
};

const isRefused = (lanes) => [...lanes.values()].some((lane) => lane === null);

describe('the shared table', () => {
    test('is actually loaded, and agrees on the cap', () => {
        expect(cases.cases.length).toBeGreaterThan(0);
        expect(cases.maxLanes).toBe(MAX_NOTE_LANES);
    });
});

describe('assignLanes against the shared table', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Act
            const lanes = assignLanes(testCase.notes);

            // Assert
            if (testCase.lanes === null) {
                expect(isRefused(lanes)).toBe(true);
                return;
            }

            expect(summarise(lanes)).toEqual(testCase.lanes);
        });
    });
});

describe('the picker refuses exactly what the cap refuses', () => {
    cases.cases.forEach((testCase) => {
        test(testCase.name, () => {
            // Arrange — the table's `maxOverlap` is what the server computes
            const exceedsCap = testCase.maxOverlap > MAX_NOTE_LANES;

            // Act
            const lanes = assignLanes(testCase.notes);

            // Assert
            expect(isRefused(lanes)).toBe(exceedsCap);
        });
    });
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=noteLanes
```

Expected: FAIL — `Cannot find module './noteLanes'`.

- [ ] **Step 4: Write the module**

Create `src/client/src/lib/noteLanes.js`:

```js
// Which vertical track each note in a day is drawn in (design 2026-09-16,
// decisions 4-7).
//
// Pure — no React, no DOM, no measurement — the same bargain `lib/schedule.js`
// makes, and for the same reason: this runs on every pointer move of a create,
// a move and a resize, and it has to be testable without a rendered column.
//
// Notes are free-floating. Unlike bookings, nothing here moves anything: a note
// keeps the start and the length it was given, and the only question is which of
// four lanes it is drawn in. That is why this file is arithmetic over a day
// rather than a cascade, and why it has no counterpart to `settleDay`.
//
// LANE 0 IS RIGHTMOST, adjacent to the to-do plane, so the two planes build
// outward from the boundary between them (decision 6). Nothing in this file
// knows that — it hands out the lowest free number and the stylesheet decides
// which side of the column that is. Keeping the direction in one place means
// flipping it is a CSS change, not an arithmetic one.

import { DAY_MINUTES } from './schedule';

/**
 * Four lanes, and a fifth overlapping note is refused rather than accommodated
 * (decision 4). Lanes that subdivided indefinitely would reach a width where the
 * rotated text stops being readable, and a calendar that silently becomes
 * illegible is worse than one that says no.
 *
 * Also stated in `src/lib/calendarNoteLanes.js`, which the client bundle cannot
 * import — the same split `DAY_MINUTES` and `SLOT_MINUTES` already have between
 * `lib/schedule.js` and `lib/calendarPlacement.js`. `src/shared/noteLaneCases.json`
 * is what holds the two copies together.
 */
export const MAX_NOTE_LANES = 4;

const endOf = (note) => note.startMinutes + note.durationMinutes;

/**
 * Two notes overlap when one begins before the other ends.
 *
 * Strict on both sides, so contact is not overlap: a note ending at 10:00 and
 * one starting at 10:00 may share a lane. Without that, a day of back-to-back
 * half-hour notes would consume every lane and refuse the fifth.
 */
const overlaps = (a, b) => a.startMinutes < endOf(b) && b.startMinutes < endOf(a);

/**
 * Day's notes → `Map(noteId → lane)`.
 *
 * Greedy colouring: walk the notes in `(startMinutes, id)` order and give each
 * the lowest-numbered lane none of whose occupants it overlaps. On an interval
 * graph that is optimal — it uses exactly as many lanes as the maximum number of
 * notes covering any one minute — which is what makes this and the server's
 * overlap sweep the same rule rather than two that agree by luck (decision 7).
 *
 * The `id` tie-break is what makes the arrangement stable. Two notes starting at
 * the same minute must not swap lanes between renders, or a ribbon would jump
 * sideways when something unrelated changed.
 *
 * A note being created has no id yet (see `canPlace`), so the tie-break treats
 * a missing id as larger than every real one: a draft always loses a tie
 * against a saved note. Written as `?? Number.POSITIVE_INFINITY` rather than
 * bare subtraction, because `undefined - b.id` is `NaN`, and a comparator that
 * returns `NaN` is treated as "equal" — which would make the outcome depend on
 * where the draft happened to sit in the array `canPlace` builds, a detail with
 * no meaning of its own. Two id-less notes would compare `Infinity - Infinity`
 * (`NaN`, so "equal", so whichever order they arrived in), but only one draft
 * exists at a time during a gesture, so that case cannot arise today.
 *
 * A note with no free lane maps to `null` rather than being left out, so a
 * caller iterating the map still sees it and can draw it as unplaceable. Every
 * client gesture is refused before it can produce one (see `canPlace`), so this
 * only arises from data that got past the server — a stale tab, or a hand-edited
 * row. Drawing it wrongly beats not drawing it at all.
 *
 * Sorts a copy; the array it is given is untouched.
 */
export const assignLanes = (notes) => {
    const ordered = [...notes].sort(
        (a, b) =>
            a.startMinutes - b.startMinutes ||
            (a.id ?? Number.POSITIVE_INFINITY) - (b.id ?? Number.POSITIVE_INFINITY)
    );

    // lane index → the notes already placed in it
    const lanes = Array.from({ length: MAX_NOTE_LANES }, () => []);
    const assigned = new Map();

    for (const note of ordered) {
        const lane = lanes.findIndex(
            (occupants) => !occupants.some((other) => overlaps(other, note))
        );

        if (lane === -1) {
            assigned.set(note.id, null);
            continue;
        }

        lanes[lane].push(note);
        assigned.set(note.id, lane);
    }

    return assigned;
};

/**
 * Whether a note could be placed as described — the live refusal behind every
 * gesture.
 *
 * `candidate`'s own id is excluded from `notes` first, which is the whole point
 * of the function: a note being moved or resized is tested against its siblings,
 * never against the row it is about to replace. Counted twice, resizing one of
 * four overlapping notes would refuse itself.
 *
 * The day bounds are checked here too (decision 8). They belong with the lane
 * question rather than beside it because a gesture asks one thing — "may I put
 * it here?" — and a caller that had to remember to ask two would eventually
 * forget one.
 *
 * `candidate.id` may be absent, which is what a note being created looks like.
 * Nothing is then excluded, which is correct: it has no row to replace.
 */
export const canPlace = (notes, candidate) => {
    if (candidate.startMinutes < 0) return false;
    if (endOf(candidate) > DAY_MINUTES) return false;

    const siblings = notes.filter((note) => note.id !== candidate.id);
    const lanes = assignLanes([...siblings, candidate]);

    return lanes.get(candidate.id) !== null;
};
```

- [ ] **Step 5: Run both to verify they pass**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=noteLanes
```

Expected: PASS, 44 tests across the two files — the 13 original behaviour tests
plus the 2 id-less-candidate tests added in the post-review addendum above, plus
one table-loaded check and the 14 shared cases in each of the fixture suite's two
describe blocks.

> If `assignLanes` returns `undefined` rather than `null` for a refused note,
> check that the `lane === -1` branch sets the entry rather than `continue`ing
> past it.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/lib/noteLanes.js src/client/src/lib/noteLanes.test.js src/client/src/lib/noteLanes.fixtures.test.js
git commit -m "feat: add the client-side note lane picker"
```

---

## Task 8: A scale-taking geometry

**Files:**
- Modify: `src/client/src/lib/scheduleGeometry.js`
- Test: `src/client/src/lib/scheduleGeometry.test.js`

The scale stops being a constant. Only the two conversions depend on it, so only those move into a factory — `snapToSlot`, `clampStart`, `clampDuration`, `formatTime` and `hourLabels` stay exactly as they are, which is what keeps that file's guard analysis true unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/client/src/lib/scheduleGeometry.test.js`, and add `PX_PER_SLOT_MIN` and `createDayGeometry` to its existing import from `./scheduleGeometry`:

```js
describe('createDayGeometry', () => {
    test('converts minutes to pixels at the given scale', () => {
        // Arrange
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        // Act & Assert — one slot is one slot's worth of pixels
        expect(geometry.minutesToPx(30)).toBe(PX_PER_SLOT_MIN);
        expect(geometry.minutesToPx(60)).toBe(PX_PER_SLOT_MIN * 2);
    });

    test('stretches with the scale', () => {
        // Arrange
        const stretched = createDayGeometry(PX_PER_SLOT_MIN * 2);

        // Act & Assert
        expect(stretched.minutesToPx(30)).toBe(PX_PER_SLOT_MIN * 2);
    });

    test('round-trips minutes through pixels at any scale', () => {
        // Arrange
        const scales = [PX_PER_SLOT_MIN, 31, 48.5];

        // Act & Assert
        scales.forEach((pxPerSlot) => {
            const geometry = createDayGeometry(pxPerSlot);

            expect(geometry.pxToMinutes(geometry.minutesToPx(450))).toBeCloseTo(450);
            // The round-trip alone only proves the two conversions are each
            // other's inverse — it says nothing about the scale itself. Tying
            // one slot's worth of minutes back to `pxPerSlot` is what catches a
            // factory that ignores its argument and always converts at the same
            // fixed rate. `toBeCloseTo`, not `toBe`, because dividing then
            // re-multiplying by `SLOT_MINUTES` is not exact for every scale in
            // this table — 31 / 30 * 30 lands a float epsilon off 31.
            expect(geometry.minutesToPx(SLOT_MINUTES)).toBeCloseTo(pxPerSlot);
        });
    });

    test('a day is exactly the scale times the number of slots', () => {
        // Arrange
        const geometry = createDayGeometry(40);

        // Act & Assert
        expect(geometry.dayHeightPx).toBe(40 * SLOTS_PER_DAY);
        expect(geometry.minutesToPx(DAY_MINUTES)).toBe(geometry.dayHeightPx);
    });

    test('carries its own scale, so callers can compare two', () => {
        // Act & Assert
        expect(createDayGeometry(37).pxPerSlot).toBe(37);
    });
});

describe('PX_PER_SLOT_MIN', () => {
    test('is the scale the calendar has always drawn at', () => {
        // 48px an hour reads comfortably, and the page never goes below it:
        // more hours beats a squeezed day (design 2026-09-16, decision 10).
        expect(PX_PER_SLOT_MIN).toBe(24);
    });
});
```

Add `DAY_MINUTES` and `SLOT_MINUTES` to the test file's imports from `./schedule` if they are not already imported.

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=scheduleGeometry
```

Expected: FAIL — `createDayGeometry is not a function`.

- [ ] **Step 3: Replace the scale constant with the factory**

In `src/client/src/lib/scheduleGeometry.js`, replace the `PX_PER_SLOT` / `PX_PER_MINUTE` / `DAY_HEIGHT_PX` / `minutesToPx` / `pxToMinutes` block with:

```js
/**
 * The smallest the scale ever gets, and the one the calendar drew at when it was
 * fixed. 48px an hour reads comfortably.
 *
 * A floor rather than a value, because the priority is showing more hours rather
 * than fitting a whole day: on a short window the column fills the page at this
 * scale and the rest scrolls inside, and only a window tall enough for all 24
 * hours makes the scale grow (design 2026-09-16, decision 10).
 */
export const PX_PER_SLOT_MIN = 24;

export const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES;

/**
 * The two conversions that depend on how tall a slot is drawn, bound to one
 * scale.
 *
 * A factory rather than a `pxPerSlot` parameter on each converter, and that is a
 * decision about this file's guards as much as about its ergonomics. Every note
 * in the header above reasons about which parameters are open to a value read
 * off a payload; adding a second parameter to `minutesToPx` and `pxToMinutes`
 * would open a new boundary at each call site and make that analysis something
 * to redo. Bound once, at the one place that measures, there is no new boundary
 * — and a caller cannot forget the argument, because there is no argument.
 *
 * `snapToSlot`, `clampStart`, `clampDuration`, `formatTime` and `hourLabels` are
 * all scale-independent and stay module-level exports, so everything the header
 * says about them is still true.
 *
 * `pxPerSlot` is carried on the result so a consumer can tell two geometries
 * apart — which is what lets a memo key on the scale rather than on the object.
 *
 * `pxPerSlot` itself is unguarded, and the header's rule is why: it is never a
 * field read off a payload. The literal `PX_PER_SLOT_MIN` and `useDayScale`'s
 * `scaleFor` — already `Math.max`-clamped to that floor — are its only two
 * callers, so nothing reaches this parameter that a guard here would refuse.
 */
export const createDayGeometry = (pxPerSlot) => {
    const pxPerMinute = pxPerSlot / SLOT_MINUTES;

    return {
        pxPerSlot,

        /**
         * Unguarded, and the header's rule is why: both are fed the result of
         * arithmetic — a rect subtraction, a pointer delta — never a field read
         * off a payload. The worst case is `NaN`, which propagates safely into a
         * clamp that refuses it.
         */
        minutesToPx: (minutes) => minutes * pxPerMinute,
        pxToMinutes: (px) => px / pxPerMinute,

        dayHeightPx: pxPerSlot * SLOTS_PER_DAY,
    };
};
```

Then update the header comment's opening paragraph, which currently says the scale is "one number rather than a factor scattered through five components". Replace that sentence with:

```
// so the scale is decided in one place rather than scattered through five
// components — and every magic number in the layout has a name here instead.
// The scale itself is no longer a constant: it is derived from the window by
// `hooks/useDayScale` and bound into a geometry by `createDayGeometry` below.
```

- [ ] **Step 4: Fix the remaining module-level references**

`INITIAL_SCROLL_MINUTES` stays as it is. Search for anything else in this file still referencing the removed names:

```bash
grep -n "PX_PER_MINUTE\|DAY_HEIGHT_PX\|minutesToPx\|pxToMinutes" src/client/src/lib/scheduleGeometry.js
```

Expected: hits only inside `createDayGeometry` and in comments.

- [ ] **Step 5: Run the geometry tests**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=scheduleGeometry
```

Expected: PASS for the new tests. **Existing tests in this file that call the old module-level `minutesToPx` / `pxToMinutes` will fail** — update each to build a geometry first:

```js
const geometry = createDayGeometry(PX_PER_SLOT_MIN);
expect(geometry.minutesToPx(60)).toBe(48);
```

- [ ] **Step 6: Commit**

```bash
git add src/client/src/lib/scheduleGeometry.js src/client/src/lib/scheduleGeometry.test.js
git commit -m "refactor: bind the calendar scale into a geometry factory"
```

> The client build is broken until Task 11 — `DayGrid`, `DayItemCard`,
> `DayColumn` and `useResizeEdge` still import the removed names. That is
> expected; Tasks 9 to 11 close it.

---

## Task 9: `useDayScale` and `DayScaleContext`

**Files:**
- Create: `src/client/src/hooks/useDayScale.js`
- Create: `src/client/src/state/DayScaleContext.js`
- Test: `src/client/src/hooks/useDayScale.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/hooks/useDayScale.test.js`:

```js
import { act, renderHook } from '@testing-library/react';

import useDayScale from './useDayScale';
import { PX_PER_SLOT_MIN, SLOTS_PER_DAY } from '../lib/scheduleGeometry';

/**
 * The scale is derived from how tall a day column's scroll viewport turns out to
 * be. jsdom has no layout, so the viewport is a stub whose `clientHeight` the
 * test sets, and the ResizeObserver is a stub the test fires by hand.
 */

let observers = [];

class StubResizeObserver {
    constructor(callback) {
        this.callback = callback;
        this.elements = new Set();
        observers.push(this);
    }

    observe(element) {
        this.elements.add(element);
    }

    unobserve(element) {
        this.elements.delete(element);
    }

    disconnect() {
        this.elements.clear();
    }

    /** What the browser would call after a layout change. */
    fire() {
        this.callback([...this.elements].map((element) => ({ target: element })));
    }
}

const viewportOf = (clientHeight) => ({ clientHeight });

const fireAll = () =>
    act(() => {
        observers.forEach((observer) => observer.fire());
    });

beforeEach(() => {
    observers = [];
    global.ResizeObserver = StubResizeObserver;
});

describe('useDayScale', () => {
    test('starts at the floor before anything has been measured', () => {
        // Act
        const { result } = renderHook(() => useDayScale());

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    test('stays at the floor when the viewport is too short for a whole day', () => {
        // Arrange — half a day's worth of room
        const { result } = renderHook(() => useDayScale());
        const short = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 0.5;

        // Act
        act(() => result.current.registerViewport(viewportOf(short)));
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    test('stretches so a whole day exactly fills a tall viewport', () => {
        // Arrange — twice the room a day needs at the floor
        const { result } = renderHook(() => useDayScale());
        const tall = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2;

        // Act
        act(() => result.current.registerViewport(viewportOf(tall)));
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN * 2);
        expect(result.current.geometry.dayHeightPx).toBe(tall);
    });

    test('follows the viewport when it is resized', () => {
        // Arrange
        const { result } = renderHook(() => useDayScale());
        const viewport = viewportOf(PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2);

        act(() => result.current.registerViewport(viewport));
        fireAll();

        // Act — the window shrinks below a whole day
        viewport.clientHeight = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 0.5;
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    test('takes the tallest of several columns', () => {
        // Arrange — every column is the same height in practice, but a column
        // mid-unmount can report 0, and that must not shrink the whole strip.
        const { result } = renderHook(() => useDayScale());
        const tall = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2;

        // Act
        act(() => {
            result.current.registerViewport(viewportOf(0));
            result.current.registerViewport(viewportOf(tall));
        });
        fireAll();

        // Assert
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN * 2);
    });

    test('keeps the same geometry object while the scale has not moved', () => {
        // Arrange — the object is a context value; a new one every render would
        // re-render every column for nothing.
        const { result, rerender } = renderHook(() => useDayScale());
        const before = result.current.geometry;

        // Act
        rerender();

        // Assert
        expect(result.current.geometry).toBe(before);
    });

    test('survives a browser with no ResizeObserver', () => {
        // Arrange
        delete global.ResizeObserver;

        // Act
        const { result } = renderHook(() => useDayScale());
        act(() => result.current.registerViewport(viewportOf(2000)));

        // Assert — the floor, and no throw
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });

    // Added beyond the 7 tests originally drafted here. React calls a ref
    // callback with `null` on unmount but never says which node it was, so a
    // shared `registerViewport` cannot drop the entry itself — see the
    // `pruneDetached` note in useDayScale.js. A real, detached DOM node reports
    // `isConnected === false`; nothing here can prove that with the plain-object
    // stub `viewportOf` returns, so this test uses a stub that mimics it.
    test('drops a detached viewport once another remeasure runs', () => {
        // Arrange — a tall column, then a second column that goes away.
        const { result } = renderHook(() => useDayScale());
        const tall = PX_PER_SLOT_MIN * SLOTS_PER_DAY * 2;
        const staleViewport = { clientHeight: tall, isConnected: true };

        act(() => result.current.registerViewport(staleViewport));
        fireAll();
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN * 2);

        // Act — the column unmounts (`isConnected` flips, as it does for a real
        // DOM node) and a second, shorter column registers in its place.
        staleViewport.isConnected = false;
        const freshViewport = { clientHeight: PX_PER_SLOT_MIN * SLOTS_PER_DAY, isConnected: true };
        act(() => result.current.registerViewport(freshViewport));
        fireAll();

        // Assert — the stale entry was dropped rather than still counted as the
        // tallest, so the scale now tracks only the live column.
        expect(result.current.geometry.pxPerSlot).toBe(PX_PER_SLOT_MIN);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useDayScale
```

Expected: FAIL — `Cannot find module './useDayScale'`.

- [ ] **Step 3: Write the hook**

Create `src/client/src/hooks/useDayScale.js`:

```js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    PX_PER_SLOT_MIN,
    SLOTS_PER_DAY,
    createDayGeometry,
} from '../lib/scheduleGeometry';

// How tall a half-hour is drawn, derived from how much room a day column
// actually got (design 2026-09-16, decision 10 and section 9.1).
//
//     pxPerSlot = max(PX_PER_SLOT_MIN, availableHeightPx / SLOTS_PER_DAY)
//
// One formula, two behaviours. On a short window the division loses, the floor
// holds, and the column fills the page at the scale the calendar has always
// drawn at — so more hours are visible than the old 70vh cap allowed and the
// rest still scrolls inside. On a window tall enough for all 24 hours the
// division wins and the day stretches to fill the column exactly.
//
// WHAT IS MEASURED, AND WHY IT IS NOT A LOOP. The scroll *viewport* — the
// element with `overflow-y: auto` — never the grid inside it. The grid's height
// is `dayHeightPx`, which is derived from the scale, so measuring the grid would
// make the scale derive from itself and oscillate. The viewport is safe because
// its height comes from flex layout: it is `flex: 1` inside a column of a fixed
// height, so what it contains cannot change how tall it is.
//
// Columns register themselves rather than the hook reaching for a selector. All
// columns are the same height, so any one would do — but a column mid-unmount
// can report 0, so the tallest is taken rather than the first.

/**
 * The tallest viewport currently registered, ignoring any reporting 0.
 *
 * A node that is not part of a rendered layout — including one detached from
 * the document — reports `clientHeight` as `0`, so a stale entry can never
 * skew this upward. That is what makes `pruneDetached` below optional for
 * correctness: a scale computed before a stale entry is pruned is already the
 * same scale computed after.
 */
const tallestOf = (viewports) =>
    [...viewports].reduce((tallest, node) => Math.max(tallest, node.clientHeight || 0), 0);

/**
 * Drops any viewport that is no longer in the document, so `viewportsRef` and
 * its `ResizeObserver.observe` calls do not grow for the life of the calendar
 * page.
 *
 * Memory hygiene, not correctness — see `tallestOf` above for why a stale
 * entry cannot corrupt the measured scale on its own. Nobody needs to "fix"
 * this file for that reason.
 *
 * Lazy, and only bounded in the common case, not guaranteed. A column's ref
 * callback is called with `null` on unmount, but React does not say which
 * node that was — a shared, stable `registerViewport` has no way to tell one
 * column's unmount from another's from that argument alone, so it cannot
 * remove the entry itself, and an unmount does not trigger a remeasure on its
 * own either: `ResizeObserver` fires when an observed element's size changes,
 * not when it is removed from the document. What actually reclaims a stale
 * entry is the next remeasure from anywhere else — and in this app there
 * usually is one close behind, because every *mount* calls `observe()`, which
 * a real `ResizeObserver` answers with one notification for that element's
 * current size on its own. Columns swap constantly as the strip pages through
 * dates, so the next column to mount typically clears out the one that just
 * left. That is what ordinary use looks like, not a structural guarantee: a
 * page that stops mounting columns keeps its stale entries until the hook
 * itself unmounts, at which point the effect's `disconnect()` clears
 * everything at once regardless.
 *
 * Assumes `registerViewport` is only ever handed a real, mounted DOM node —
 * true today via `DayColumn`'s `attachScroll` (Task 11). `isConnected !==
 * false`, not merely falsy, is what makes that assumption load-bearing: a
 * live node and a plain-object test stub (no `isConnected` at all,
 * `undefined`) both pass it, and only a real, detached DOM node's strict
 * `false` trips it.
 */
const pruneDetached = (viewports, observer) => {
    viewports.forEach((node) => {
        if (node.isConnected !== false) return;

        viewports.delete(node);
        observer?.unobserve(node);
    });
};

const scaleFor = (availableHeightPx) =>
    Math.max(PX_PER_SLOT_MIN, availableHeightPx / SLOTS_PER_DAY);

const useDayScale = () => {
    const [pxPerSlot, setPxPerSlot] = useState(PX_PER_SLOT_MIN);

    const viewportsRef = useRef(new Set());
    const observerRef = useRef(null);

    const remeasure = useCallback(() => {
        pruneDetached(viewportsRef.current, observerRef.current);

        const available = tallestOf(viewportsRef.current);

        // Nothing has been laid out yet — every column is gone, or jsdom. The
        // floor is the honest answer, and re-deriving from 0 would collapse the
        // scale on the way out of a re-render.
        if (available <= 0) {
            setPxPerSlot(PX_PER_SLOT_MIN);
            return;
        }

        setPxPerSlot(scaleFor(available));
    }, []);

    /**
     * A day column's scroll viewport, handed over as a ref callback. React
     * calls this with `null` on unmount, but never says which node that was —
     * so this cannot remove the entry itself; `pruneDetached` above is what
     * actually drops it, lazily, the next time anything remeasures.
     *
     * Safe to call on every render: a node already registered is re-added to the
     * same Set and re-observed, and `ResizeObserver.observe` on an element it is
     * already watching is a no-op.
     *
     * Deliberately does not call `remeasure` itself. `ResizeObserver.observe`
     * delivers one notification for the element's current size on its own,
     * right after the next layout — so measuring here too would just be the
     * same number a frame earlier, at the cost of a second code path. Without a
     * `ResizeObserver` there is no such notification, and the absence is exactly
     * what keeps the scale at the floor rather than measuring once and freezing
     * on whatever size happened to be registered first.
     */
    const registerViewport = useCallback((node) => {
        if (!node) return;

        viewportsRef.current.add(node);
        observerRef.current?.observe(node);
    }, []);

    useEffect(() => {
        // jsdom before 22, and any browser old enough to matter. Without a
        // ResizeObserver the scale simply stays at the floor, which is exactly
        // what the calendar did before this hook existed.
        if (typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver(remeasure);

        observerRef.current = observer;
        viewportsRef.current.forEach((node) => observer.observe(node));

        return () => {
            observer.disconnect();
            observerRef.current = null;
        };
    }, [remeasure]);

    // Held stable across renders that did not move the scale. This object is a
    // context value, and a fresh one every render would re-render every column
    // and every card for nothing — the same reason `useCalendar` memoises its
    // own return.
    const geometry = useMemo(() => createDayGeometry(pxPerSlot), [pxPerSlot]);

    return useMemo(() => ({ geometry, registerViewport }), [geometry, registerViewport]);
};

export default useDayScale;
```

> **Two corrections made against an earlier draft of this hook, both caught by the tests
> above rather than invented after the fact.**
>
> `registerViewport` must not call `remeasure()` itself. An earlier draft did, and it broke
> `survives a browser with no ResizeObserver`: without an observer, `observerRef.current` is
> null, but the manual `remeasure()` call still ran and measured the registered node directly —
> `2000 / SLOTS_PER_DAY` clamps to `41.67`, not the floor. The fix is to let
> `ResizeObserver.observe()` do the measuring on its own: a real `ResizeObserver` delivers one
> notification carrying the element's current size right after the next layout, as soon as
> `observe()` is called, so a manual call here was always redundant on top of being wrong when
> there is no observer to fall back on. Every test above that needs a measurement to land calls
> `fireAll()` explicitly for exactly this reason.
>
> `pruneDetached` exists because `registerViewport(null)` cannot, by itself, remove the stale
> entry — see its own docstring above. This is memory hygiene, not a correctness fix: a stale
> node's `clientHeight` is already `0` once it is out of layout, so it can never skew
> `tallestOf`'s `max()` upward, and nothing here should later be "fixed" on the theory that it
> can. What `pruneDetached` bounds is `viewportsRef.current` and the open `ResizeObserver.observe`
> calls it carries — and only in the common case, not by guarantee: an unmount alone does not
> trigger a remeasure (`ResizeObserver` fires on a resize, not a removal), so a stale entry only
> clears once something else remeasures, which in this app is usually the very next column to
> mount, since every `observe()` call gets its own initial notification. None of the 7 tests
> above catch any of this on their own, because their viewport stubs are plain objects with no
> real DOM detachment semantics to fail on — this is exactly the class of bug jsdom will not
> tell you about. The 8th test, appended to Step 1, proves the pruning itself with a stub that
> mimics `isConnected` flipping to `false`.

- [ ] **Step 4: Write the context**

Create `src/client/src/state/DayScaleContext.js`:

```js
import { createContext, useContext } from 'react';

import { PX_PER_SLOT_MIN, createDayGeometry } from '../lib/scheduleGeometry';

// The scale, published to everything that draws a day.
//
// A context rather than a prop, because the consumers are leaves: every booking
// card and every note ribbon converts minutes to pixels, and threading a
// geometry through `DayStrip` → `DayColumn` → `DayGrid` → each card would touch
// every component in between for a value none of them use.
//
// The default is a geometry at the floor rather than `null`, so a component
// rendered bare in a test draws at the scale the calendar has always drawn at
// instead of throwing. That matches how `DayColumn` already treats `droppable`
// and `cardFor` as optional: outside its wrapper, a column is still a column.

const DayScaleContext = createContext(createDayGeometry(PX_PER_SLOT_MIN));

export const DayScaleProvider = DayScaleContext.Provider;

/** The geometry bound to the current scale: `minutesToPx`, `pxToMinutes`, `dayHeightPx`. */
export const useDayGeometry = () => useContext(DayScaleContext);

export default DayScaleContext;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useDayScale
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/hooks/useDayScale.js src/client/src/state/DayScaleContext.js src/client/src/hooks/useDayScale.test.js
git commit -m "feat: derive the calendar scale from the window"
```

---

## Task 10: `useResizeEdge` takes a geometry

**Files:**
- Modify: `src/client/src/hooks/useResizeEdge.js`
- Test: `src/client/src/hooks/useResizeEdge.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/client/src/hooks/useResizeEdge.test.js`:

```js
describe('rectFor at a stretched scale', () => {
    test('is unaffected by the scale, because it works in minutes', () => {
        // Arrange — rectFor never sees pixels; the caller converts first. This
        // pins that, so a future change that smuggles a scale in here fails.
        const item = { todoId: 1, startMinutes: 540, durationMinutes: 60 };

        // Act
        const rect = rectFor(item, { edge: EDGE.bottom, deltaMinutes: 30, floor: 0 });

        // Assert
        expect(rect).toEqual({ startMinutes: 540, durationMinutes: 90 });
    });
});
```

Then find every `renderHook(() => useResizeEdge({ ... }))` in the file and add a `geometry` to the options object:

```js
const geometry = createDayGeometry(PX_PER_SLOT_MIN);

// ...each render becomes:
renderHook(() => useResizeEdge({ geometry, resolve, onPreview, onCommit, onCancel }));
```

Add to the file's imports:

```js
import { PX_PER_SLOT_MIN, createDayGeometry } from '../lib/scheduleGeometry';
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useResizeEdge
```

Expected: FAIL — `pxToMinutes is not defined` or similar, since the module-level import no longer exists.

- [ ] **Step 3: Thread the geometry through**

In `src/client/src/hooks/useResizeEdge.js`:

Change the import line from

```js
import { clampDuration, pxToMinutes, snapToSlot } from '../lib/scheduleGeometry';
```

to

```js
import { clampDuration, snapToSlot } from '../lib/scheduleGeometry';
```

Change the hook signature and add to its JSDoc:

```js
/**
 * `geometry` is the scale-bound converter from `DayScaleContext` — the calendar
 * no longer draws at a fixed 24px a slot, so how far a pointer has travelled in
 * minutes depends on how tall the column was laid out (design 2026-09-16,
 * decision 10). It is read on every move rather than captured with the gesture,
 * so a window resized mid-drag is followed rather than ignored.
 *
 * Only the pixel conversion needs it. `snapToSlot` and `clampDuration` work in
 * minutes and are scale-independent, which is why they are still imported
 * directly.
 */
const useResizeEdge = ({ geometry, resolve, onPreview, onCommit, onCancel }) => {
```

And in `handlePointerMove`, replace the conversion:

```js
            const deltaMinutes = snapToSlot(
                geometry.pxToMinutes(event.clientY - gesture.originY)
            );
```

Add `geometry` to that callback's dependency array:

```js
        [gesture, geometry, onPreview]
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useResizeEdge
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/hooks/useResizeEdge.js src/client/src/hooks/useResizeEdge.test.js
git commit -m "refactor: resize edges convert at the live scale"
```

---

## Task 11: The column fills the page and two days fit

This is the change the spec calls out as riskiest, and it lands on its own with no notes in it so it can be reviewed by itself.

**Files:**
- Modify: `src/client/src/components/Calendar/DayGrid.js`
- Modify: `src/client/src/components/Calendar/DayItemCard.js`
- Modify: `src/client/src/components/Calendar/DayColumn.js`
- Modify: `src/client/src/components/Calendar/CalendarDragArea.js`
- Modify: `src/client/src/components/Styling/Calendar.css`
- Test: `src/client/src/components/Calendar/DayGrid.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/client/src/components/Calendar/DayGrid.test.js`:

```js
describe('DayGrid at a stretched scale', () => {
    test('is as tall as the geometry says a day is', () => {
        // Arrange
        const geometry = createDayGeometry(48);

        // Act
        const { container } = render(
            <DayScaleProvider value={geometry}>
                <DayGrid />
            </DayScaleProvider>
        );

        // Assert
        expect(container.querySelector('.day-grid')).toHaveStyle({
            height: `${geometry.dayHeightPx}px`,
        });
    });

    test('draws at the floor with no provider above it', () => {
        // Arrange
        const floor = createDayGeometry(PX_PER_SLOT_MIN);

        // Act
        const { container } = render(<DayGrid />);

        // Assert
        expect(container.querySelector('.day-grid')).toHaveStyle({
            height: `${floor.dayHeightPx}px`,
        });
    });
});
```

Add to the test file's imports:

```js
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=DayGrid
```

Expected: FAIL — `DAY_HEIGHT_PX` is no longer exported, so the module does not load.

- [ ] **Step 3: Read the scale in `DayGrid`**

In `src/client/src/components/Calendar/DayGrid.js`, replace the import and the two uses:

```js
import React from 'react';

import { SLOTS_PER_DAY, hourLabels } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';

// The backdrop of one day: an hour gutter down the side and a half-hour rule
// across it, exactly one day tall — at whatever scale the window gave it.
//
// [keep the rest of the existing comment unchanged]

const DayGrid = ({ children }) => {
    const geometry = useDayGeometry();

    return (
        <div className="day-grid" style={{ height: `${geometry.dayHeightPx}px` }}>
            <div className="day-grid-gutter" aria-hidden="true">
                {hourLabels().map(({ minutes, label }) => (
                    <div
                        key={minutes}
                        className="day-grid-hour"
                        style={{ top: `${geometry.minutesToPx(minutes)}px` }}
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
};

export default DayGrid;
```

- [ ] **Step 4: Read the scale in `DayItemCard`**

In `src/client/src/components/Calendar/DayItemCard.js`, change the import:

```js
import { formatTime } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';
```

Add the hook call beside the existing `useBookingDrag` call:

```js
    const geometry = useDayGeometry();
```

and change the inline style to:

```js
            style={{
                top: `${geometry.minutesToPx(item.startMinutes)}px`,
                height: `${geometry.minutesToPx(item.durationMinutes)}px`,
            }}
```

- [ ] **Step 5: Register the viewport and scroll at the live scale in `DayColumn`**

In `src/client/src/components/Calendar/DayColumn.js`, change the import:

```js
import { INITIAL_SCROLL_MINUTES } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';
```

Accept a new prop and use it. Change the signature to add `registerViewport = null`, then:

```js
    const { deleteDay, completeTodo, isUnsavedDay } = useCalendarContext();
    const geometry = useDayGeometry();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const scrollRef = useRef(null);

    const label = `Day ${index + 1}`;

    /**
     * The scroll element does two jobs, so it takes two refs.
     *
     * `scrollRef` is this column's own, for the opening scroll below.
     * `registerViewport` hands the same node to `useDayScale`, which measures it
     * to decide the scale — it measures the viewport and never the grid, because
     * the grid's height is derived from the scale and measuring it would be a
     * loop (see that hook's header).
     */
    const attachScroll = useCallback(
        (node) => {
            scrollRef.current = node;
            registerViewport?.(node);
        },
        [registerViewport]
    );

    // Once, on mount. Re-applying it on every render would yank the column back
    // to 06:00 every time a booking moved.
    //
    // A no-op once the scale has grown enough for all 24 hours to fit: there is
    // then nothing to scroll, and `scrollTop` on a viewport with no overflow
    // stays 0 on its own. No branch needed.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = geometry.minutesToPx(INITIAL_SCROLL_MINUTES);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
```

> No unregister call is needed here: `useDayScale` prunes a detached viewport lazily, inside
> `remeasure`, the next time anything else registers or resizes — `DayColumn` only ever needs to
> hand a node over, never take one back. See `pruneDetached` in Task 9.

Add `useCallback` to the `react` import. Change the scroll div to use the combined ref:

```js
            <div className="day-column-scroll" ref={attachScroll}>
```

- [ ] **Step 6: Provide the scale from `CalendarDragArea`**

In `src/client/src/components/Calendar/CalendarDragArea.js`:

Add the imports:

```js
import useDayScale from '../../hooks/useDayScale';
import { DayScaleProvider } from '../../state/DayScaleContext';
```

Call the hook near the top of the component, beside the other hooks:

```js
    // The scale every column, card and ribbon draws at. Held here rather than on
    // the page because this is the component that renders the strip, and the
    // columns that register their viewports are its children.
    const { geometry, registerViewport } = useDayScale();
```

Pass `geometry` into `useResizeEdge`:

```js
    const { startResize } = useResizeEdge({
        geometry,
        resolve: resolveEdge,
        onPreview: handleResizePreview,
        onCommit: handleResizeCommit,
        onCancel: handleResizeCancel,
    });
```

Wrap the returned tree — put `DayScaleProvider` directly inside `DndContext`, around the existing `<div className="calendar-body">` and the `DragOverlay`:

```jsx
        <DndContext ...>
            <DayScaleProvider value={geometry}>
                <div className="calendar-body">
                    ...
                </div>

                <DragOverlay dropAnimation={null}>
                    {active && <div className="calendar-drag-ghost">{labelOf(active)}</div>}
                </DragOverlay>
            </DayScaleProvider>
        </DndContext>
```

Pass `registerViewport` down through `DroppableDayColumn`. Add it to that component's props and forward it to `DayColumn`, and add `registerViewport={registerViewport}` to the `<DroppableDayColumn .../>` in `columnFor`.

- [ ] **Step 7: Fix the drop geometry**

`minutesAtRect` is a module-level export that calls `pxToMinutes`. Change it to take the geometry:

```js
/**
 * The minute a card's top edge is over, snapped to the grid.
 *
 * The top edge rather than the pointer: it is the edge the user is lining up
 * against the rule, and for a booking being moved it is literally the value being
 * set. `getBoundingClientRect` already accounts for the column's inner scroll,
 * so no scroll offset is added here.
 *
 * `geometry` is the live scale — the column is no longer a fixed 24px a slot, so
 * how many minutes a pixel offset is worth depends on how tall the window let
 * the column be.
 */
export const minutesAtRect = (geometry, activeRect, gridRect) =>
    clampStart(geometry.pxToMinutes(activeRect.top - gridRect.top));
```

Remove `pxToMinutes` from the `scheduleGeometry` import, leaving `clampStart`. Update the one call inside `targetFrom`:

```js
                startMinutes: minutesAtRect(geometry, activeRect, grid.getBoundingClientRect()),
```

and add `geometry` to `targetFrom`'s dependency array, which is currently `[]`:

```js
        [geometry]
```

Then update `CalendarDragArea.test.js` wherever it calls `minutesAtRect` directly, passing `createDayGeometry(PX_PER_SLOT_MIN)` as the first argument.

- [ ] **Step 8: Rewrite the layout CSS**

In `src/client/src/components/Styling/Calendar.css`:

Replace the `--cal-column-width` and `--cal-column-max-height` declarations in `.calendar-page` with:

```css
    /* Wide enough that exactly two days fill the strip, whatever the window
     * (design 2026-09-16, decision 11). The percentage resolves against
     * `.calendar-strip`'s content box — its visible width, not its scroll width
     * — so two columns and the one gap between them are precisely what fits, and
     * the third day sits just off the edge inviting the sideways scroll that
     * already exists.
     *
     * The floor is what stops it collapsing on a narrow window: below roughly
     * 560px of strip the columns stop shrinking and even the second one scrolls,
     * because two unreadable days are worth less than one readable one. */
    --cal-column-min-width: 260px;
    --cal-column-width: max(
        var(--cal-column-min-width),
        calc((100% - var(--space-sm)) / 2)
    );
```

Make the page a full-height flex column:

```css
.calendar-page {
    /* ...the tokens above... */

    /* The calendar is the whole page — there is no global nav above it (see
     * `routes.js`), so the viewport is all of it. `dvh` rather than `vh` so a
     * mobile browser's collapsing toolbar does not leave the strip cut off. */
    height: 100dvh;
    display: flex;
    flex-direction: column;
    /* The strip owns the sideways overflow; the page must never scroll with it. */
    overflow: hidden;

    padding: var(--page-pad) var(--page-pad) var(--space-xl);
    padding-right: max(var(--page-pad), env(safe-area-inset-right));
    padding-left: max(var(--page-pad), env(safe-area-inset-left));
}
```

Give the body the remaining height:

```css
.calendar-body {
    display: flex;
    gap: var(--space-md);
    align-items: stretch;
    /* Takes what the header leaves. `min-height: 0` is what actually lets the
     * columns inside scroll: without it a flex item refuses to shrink below its
     * content, the columns grow to their full 24 hours, and the page scrolls
     * instead of the column. */
    flex: 1;
    min-height: 0;
}
```

Let the column fill it and its scroll area take the slack:

```css
.day-column {
    flex: 0 0 var(--cal-column-width);
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    /* Fills the body rather than capping at 70vh. How much of the day that
     * reveals is `useDayScale`'s answer, not this file's: more hours first, and
     * a stretched scale only once all 24 fit (decision 10). */
    height: 100%;
    min-height: 0;
}

.day-column-scroll {
    /* Everything the header leaves. The height of this box is what the scale is
     * derived from, which is why it must come from flex layout and not from its
     * contents — see `useDayScale`. */
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    position: relative;
}
```

Keep `.calendar-strip` as it is but stop it stretching its columns taller than itself:

```css
.calendar-strip {
    flex: 1;
    display: flex;
    gap: var(--space-sm);
    overflow-x: auto;
    /* Was `flex-start`, which let a column size to its content. The columns are
     * now told to fill the strip's height, so they must be stretched to it. */
    align-items: stretch;
    min-width: 0;
}
```

The `+` button must not stretch with them:

```css
.calendar-strip-add {
    flex: 0 0 auto;
    /* The columns stretch now, so this has to opt out: it adds a day, it is not
     * one. */
    align-self: flex-start;
    font-size: var(--font-lg);
    line-height: 1;
}
```

- [ ] **Step 9: Run the whole client suite**

```bash
npm run test:client
```

Expected: PASS. Several existing calendar tests will need updating:

- anything importing `DAY_HEIGHT_PX`, `minutesToPx` or `pxToMinutes` from
  `scheduleGeometry` — build a geometry with `createDayGeometry(PX_PER_SLOT_MIN)`;
- `CalendarDragArea.test.js`'s `minutesAtRect` calls — pass the geometry first;
- any assertion on a card's `top`/`height` — the values are unchanged at the
  floor scale, so these should pass as they are. If one fails, the component is
  reading a stale geometry.

- [ ] **Step 10: Look at it**

```bash
npm run dev
```

Open `http://localhost:3000/calendar`. Check, in order:

1. The day columns run to the bottom of the window with no gap below them.
2. Exactly two columns fit across, with the third cut off at the right edge.
3. The strip scrolls sideways to reach the third.
4. Each column opens showing 06:00 near the top.
5. Resize the window taller — more hours appear rather than the same hours
   stretching, until the whole day fits and then it stretches.
6. Drag a booking; it still lands on the rule you aimed at.
7. Drag a booking's bottom edge; it still resizes to the half hour.

> If a drop lands at the wrong minute after the scale stretches, `targetFrom` is
> closing over a stale `geometry` — check it is in the dependency array.

- [ ] **Step 11: Commit**

```bash
git add src/client/src/components/Calendar/ src/client/src/components/Styling/Calendar.css
git commit -m "feat: fill the page vertically and fit two days across the strip"
```

---

## Task 12: The notes reducer

**Files:**
- Create: `src/client/src/state/notesReducer.js`
- Create: `src/client/src/state/notesActions.js`
- Test: `src/client/src/state/notesReducer.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/state/notesReducer.test.js`:

```js
import {
    NOTES_STATUS,
    initialNotesState,
    notesOf,
    notesReducer,
} from './notesReducer';
import {
    actionErrorCleared,
    actionErrorRaised,
    loadFailed,
    loadStarted,
    loadSucceeded,
    notesReplaced,
    rolledBack,
} from './notesActions';
import { DAY_MINUTES } from '../lib/schedule';

const note = (id, dayId = 1) => ({
    id,
    dayId,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
});

describe('loading', () => {
    test('loadStarted clears a previous load error', () => {
        // Arrange
        const errored = notesReducer(initialNotesState, loadFailed('nope'));

        // Act
        const state = notesReducer(errored, loadStarted());

        // Assert
        expect(state.status).toBe(NOTES_STATUS.loading);
        expect(state.loadError).toBeNull();
    });

    test('loadSucceeded installs the notes and becomes ready', () => {
        // Act
        const state = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Assert
        expect(state.status).toBe(NOTES_STATUS.ready);
        expect(state.notes).toEqual([note(1)]);
    });

    test('loadFailed keeps the notes it already had', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act
        const state = notesReducer(ready, loadFailed('nope'));

        // Assert
        expect(state.notes).toEqual([note(1)]);
        expect(state.loadError).toBe('nope');
    });

    test('loadSucceeded refuses a note that is not a legal booking of time', () => {
        // Arrange
        const broken = [{ ...note(1), startMinutes: undefined }];

        // Act & Assert
        expect(() => notesReducer(initialNotesState, loadSucceeded(broken))).toThrow(
            /startMinutes/
        );
    });
});

describe('notesReplaced', () => {
    test('swaps the list wholesale', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act
        const state = notesReducer(ready, notesReplaced([note(2)]));

        // Assert
        expect(state.notes).toEqual([note(2)]);
    });

    test('installs the array by reference, so a mutation can tell what it did', () => {
        // Arrange — `useCalendarNotes` compares by identity to decide whether
        // its snapshot is still an undo. A defensive copy here would break that.
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const next = [note(1)];

        // Act
        const state = notesReducer(ready, notesReplaced(next));

        // Assert
        expect(state.notes).toBe(next);
    });

    test('refuses a note that is not a legal booking of time', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const broken = [{ ...note(1), startMinutes: undefined }];

        // Act & Assert
        expect(() => notesReducer(ready, notesReplaced(broken))).toThrow(/startMinutes/);
    });

    test('refuses a note running past midnight', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const broken = [
            { ...note(1), startMinutes: DAY_MINUTES - 30, durationMinutes: 60 },
        ];

        // Act & Assert
        expect(() => notesReducer(ready, notesReplaced(broken))).toThrow(/end of its day/);
    });

    test('refuses a note with a non-positive duration', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const broken = [{ ...note(1), durationMinutes: 0 }];

        // Act & Assert
        expect(() => notesReducer(ready, notesReplaced(broken))).toThrow(/positive/);
    });

    test('refuses a note starting before its day', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([]));
        const broken = [{ ...note(1), startMinutes: -30 }];

        // Act & Assert
        expect(() => notesReducer(ready, notesReplaced(broken))).toThrow(/end of its day/);
    });
});

describe('rolledBack', () => {
    test('restores the snapshot and raises the message', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));
        const optimistic = notesReducer(ready, notesReplaced([note(1), note(2)]));

        // Act
        const state = notesReducer(optimistic, rolledBack([note(1)], 'nope'));

        // Assert
        expect(state.notes).toEqual([note(1)]);
        expect(state.actionError).toBe('nope');
    });
});

describe('action errors', () => {
    test('actionErrorRaised leaves the notes alone', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act
        const state = notesReducer(ready, actionErrorRaised('nope'));

        // Assert
        expect(state.notes).toEqual([note(1)]);
        expect(state.actionError).toBe('nope');
    });

    test('actionErrorCleared clears it', () => {
        // Arrange
        const raised = notesReducer(initialNotesState, actionErrorRaised('nope'));

        // Act & Assert
        expect(notesReducer(raised, actionErrorCleared()).actionError).toBeNull();
    });
});

describe('notesOf', () => {
    test('is the slice a mutation snapshots', () => {
        // Arrange
        const ready = notesReducer(initialNotesState, loadSucceeded([note(1)]));

        // Act & Assert
        expect(notesOf(ready)).toBe(ready.notes);
    });
});

describe('an unknown action', () => {
    test('throws rather than passing the state through', () => {
        // Act & Assert
        expect(() => notesReducer(initialNotesState, { type: 'nonsense' })).toThrow(
            /nonsense/
        );
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=notesReducer
```

Expected: FAIL — `Cannot find module './notesReducer'`.

- [ ] **Step 3: Write the actions**

Create `src/client/src/state/notesActions.js`:

```js
// Action creators for `notesReducer`. Components and hooks dispatch these rather
// than object literals, so the payload shape lives in one place — the same
// division `calendarActions.js` makes.

import { NOTES_ACTIONS } from './notesReducer';

export const loadStarted = () => ({ type: NOTES_ACTIONS.loadStarted });

export const loadSucceeded = (notes) => ({ type: NOTES_ACTIONS.loadSucceeded, notes });

export const loadFailed = (error) => ({ type: NOTES_ACTIONS.loadFailed, error });

/** The whole list after one change — a create, a rename, a move, a delete. */
export const notesReplaced = (notes) => ({ type: NOTES_ACTIONS.notesReplaced, notes });

export const rolledBack = (snapshot, error) => ({
    type: NOTES_ACTIONS.rolledBack,
    snapshot,
    error,
});

/**
 * Raises a failure's message without touching the notes — for a failure whose
 * rollback would do more harm than the failure did.
 */
export const actionErrorRaised = (error) => ({
    type: NOTES_ACTIONS.actionErrorRaised,
    error,
});

export const actionErrorCleared = () => ({ type: NOTES_ACTIONS.actionErrorCleared });
```

- [ ] **Step 4: Write the reducer**

Create `src/client/src/state/notesReducer.js`:

```js
// The notes plane, as state (design 2026-09-16, section 7.1).
//
// A flat list, like `calendarReducer`'s and for the same reason: a day's notes
// are read as a group and `lib/noteLanes` works on arrays, so keying them by id
// would mean converting both ways on every pointer move of a gesture.
//
// Much smaller than `calendarReducer`, though, and the difference is decision 2.
// A booking gesture is one arithmetic result over the whole schedule, so the
// calendar replaces days and items together and snapshots both. A note gesture
// changes one row and moves nothing else, so there is no cascade to fold, no
// spill to reconcile, and no temporary day to re-key. The list is still replaced
// wholesale rather than patched, because that makes a rollback a plain
// assignment — but it is the only thing this file borrows.
//
// Notes arrays are values: `notesReplaced`, `rolledBack` and `notesOf` all pass
// one by reference rather than copying it, and that is only safe because
// nobody mutates a notes array in place, ever. Every change is a new array
// installed wholesale (immutability is CRITICAL project-wide; here it is also
// what lets `useCalendarNotes` tell a fresh array from the one it handed out
// by comparing identity, not contents).

import { DAY_MINUTES } from '../lib/schedule';

export const NOTES_STATUS = {
    idle: 'idle',
    loading: 'loading',
    ready: 'ready',
    error: 'error',
};

export const NOTES_ACTIONS = {
    loadStarted: 'loadStarted',
    loadSucceeded: 'loadSucceeded',
    loadFailed: 'loadFailed',
    notesReplaced: 'notesReplaced',
    rolledBack: 'rolledBack',
    actionErrorRaised: 'actionErrorRaised',
    actionErrorCleared: 'actionErrorCleared',
};

export const initialNotesState = {
    status: NOTES_STATUS.idle,
    // The load failed and there are no notes to show — the plane offers a retry.
    loadError: null,
    // A write failed and was rolled back — the page raises a toast.
    actionError: null,
    notes: [],
};

/** The slice a mutation snapshots and a rollback restores. */
export const notesOf = (state) => state.notes;

/** `JSON.stringify(NaN)` is the string "null"; a number should say what it is. */
const describeValue = (value) =>
    typeof value === 'number' ? String(value) : JSON.stringify(value);

/**
 * Every note must carry a real start and a real length that lands inside its
 * day, because everything downstream assumes it.
 *
 * `assignLanes` compares starts and ends to decide what overlaps; one `undefined`
 * makes every comparison false, so a broken note would appear to overlap nothing
 * and be drawn in lane 0 on top of whatever is already there. And a ribbon
 * positioned from `NaN` simply does not paint, so the note would vanish with no
 * error anywhere. Cheaper to refuse it here than to explain it later.
 *
 * This is the calendar's `assertIngestible` for the other plane, and it is
 * called at both points data enters this tree: the server's answer on load
 * (`loadSucceeded`), and a note gesture's settled result on commit
 * (`notesReplaced`), which covers an optimistic row and the real thing landing
 * after a save alike. A rollback restores a snapshot that was already checked
 * on its way in, so it needs no second check.
 */
const assertIngestible = (note) => {
    if (!Number.isFinite(note.startMinutes) || !Number.isFinite(note.durationMinutes)) {
        throw new Error(
            `Note ${note.id} needs a number for both startMinutes and ` +
                `durationMinutes, got ${describeValue(note.startMinutes)} ` +
                `and ${describeValue(note.durationMinutes)}`
        );
    }

    if (note.durationMinutes <= 0) {
        throw new Error(
            `Note ${note.id} has a duration of ${note.durationMinutes}; it must be positive`
        );
    }

    if (note.startMinutes < 0 || note.startMinutes + note.durationMinutes > DAY_MINUTES) {
        throw new Error(
            `Note ${note.id} must end by the end of its day; it runs from ` +
                `${note.startMinutes} to ${note.startMinutes + note.durationMinutes}`
        );
    }
};

const handlers = {
    [NOTES_ACTIONS.loadStarted]: (state) => ({
        ...state,
        status: NOTES_STATUS.loading,
        loadError: null,
    }),

    [NOTES_ACTIONS.loadSucceeded]: (state, { notes }) => {
        notes.forEach(assertIngestible);

        return { ...state, status: NOTES_STATUS.ready, loadError: null, notes };
    },

    // The notes already on screen are kept. A failed re-read is a notice above
    // the plane, not a reason to blank a day that is still perfectly readable.
    [NOTES_ACTIONS.loadFailed]: (state, { error }) => ({
        ...state,
        status: NOTES_STATUS.error,
        loadError: error,
    }),

    [NOTES_ACTIONS.notesReplaced]: (state, { notes }) => {
        notes.forEach(assertIngestible);

        // Installed by reference. `useCalendarNotes` compares the array it put
        // here against the one that is here now to decide whether its snapshot
        // is still an undo; a copy would make that always false.
        return { ...state, notes };
    },

    [NOTES_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        notes: snapshot,
        actionError: error,
    }),

    [NOTES_ACTIONS.actionErrorRaised]: (state, { error }) => ({ ...state, actionError: error }),

    [NOTES_ACTIONS.actionErrorCleared]: (state) => ({ ...state, actionError: null }),
};

export const notesReducer = (state, action) => {
    const handler = handlers[action.type];

    if (!handler) throw new Error(`Unknown notes action "${action.type}"`);

    return handler(state, action);
};
```

- [ ] **Step 5: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=notesReducer
```

Expected: PASS, 15 tests — the original 12 plus `loadSucceeded refuses a note
that is not a legal booking of time`, `refuses a note with a non-positive
duration`, and `refuses a note starting before its day`, added in a follow-up
commit once review found `loadSucceeded`'s own validation, and two of
`assertIngestible`'s branches, were only exercised indirectly through
`notesReplaced`.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/state/notesReducer.js src/client/src/state/notesActions.js src/client/src/state/notesReducer.test.js
git commit -m "feat: add the notes reducer"
```

---

## Task 13: `useCalendarNotes`

**Files:**
- Create: `src/client/src/hooks/useCalendarNotes.js`
- Test: `src/client/src/hooks/useCalendarNotes.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/hooks/useCalendarNotes.test.js`:

The list below is what shipped, and it is longer than this plan first called for. The original fourteen left eleven of the hook's behaviours unprotected — each could be deleted from `useCalendarNotes.js` with every test still green: the `installed` null-guard, the `stateRef` snapshot on the write path and in `pruneDay`, the resync branch itself, the rebase onto the list as it is now, `deleteNote`'s not-found guard, the true/false return contract, the `GENERIC_FAILURE` fallback, the resync being a refetch rather than a full load, `dispatch(loadStarted())`, and the memoised return. Each of the tests below was checked by deleting the thing it names and confirming it fails.

```js
import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendarNotes from './useCalendarNotes';
import { NOTES_STATUS } from '../state/notesReducer';
import { ApiError, api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            delete: jest.fn(),
        },
    };
});

const note = (id, overrides = {}) => ({
    id,
    dayId: 1,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const draft = (overrides = {}) => ({
    dayId: 1,
    text: 'on call',
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

/** A promise the test settles by hand, so mid-flight state can be asserted. */
const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

/** Renders the hook with the notes already loaded. */
const renderReady = async (notes = []) => {
    api.get.mockResolvedValue({ notes });

    const view = renderHook(() => useCalendarNotes());
    await waitFor(() => expect(view.result.current.state.status).toBe(NOTES_STATUS.ready));

    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    // Only the `console.error` spies below; the `api` doubles are module mocks,
    // which this does not touch.
    jest.restoreAllMocks();
});

describe('loading', () => {
    test('reads the notes on mount', async () => {
        // Act
        const { result } = await renderReady([note(1)]);

        // Assert
        expect(api.get).toHaveBeenCalledWith('/calendar/notes');
        expect(result.current.state.notes).toEqual([note(1)]);
    });

    test('reports a failed load without throwing', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('the server is down'));

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toBe('the server is down');
    });

    test('says it is loading until the notes land', async () => {
        // Arrange
        const pending = deferred();
        api.get.mockReturnValue(pending.promise);

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — the skeleton, not an empty plane pretending to be ready.
        expect(result.current.state.status).toBe(NOTES_STATUS.loading);

        // Act — the notes land
        await act(async () => {
            pending.resolve({ notes: [note(1)] });
            await pending.promise;
        });

        // Assert
        expect(result.current.state.status).toBe(NOTES_STATUS.ready);
    });

    test('reports a malformed note from the server rather than ingesting it', async () => {
        // Arrange — a note the reducer's ingest guard refuses.
        api.get.mockResolvedValue({ notes: [note(1, { durationMinutes: 0 })] });

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — the refusal lands on the retry screen rather than throwing
        // during a render, where the page's error boundary would take the plane.
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toMatch(/duration/);
        expect(result.current.state.notes).toEqual([]);
    });

    test.each([
        ['a body with no notes in it', {}],
        ['a body that is not an object at all', null],
        ['a notes key that is not a list', { notes: 'nope' }],
    ])('reports %s rather than reading through it', async (_label, payload) => {
        // Arrange — `api` guarantees a parsed body and nothing about its shape.
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        api.get.mockResolvedValue(payload);

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — a sentence about the server rather than `undefined.forEach`
        // beside the retry button …
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toMatch(/unreadable/);
        expect(result.current.state.notes).toEqual([]);
        // … and the body itself where a developer will find it.
        expect(logged).toHaveBeenCalledWith(expect.any(String), payload);
    });

    test('reload asks again', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.get.mockResolvedValue({ notes: [note(1)] });

        // Act
        await act(() => result.current.reload());

        // Assert
        expect(result.current.state.notes).toEqual([note(1)]);
    });
});

describe('failure diagnostics', () => {
    test('records a refused gesture without changing a word of what is on screen', async () => {
        // Arrange
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = await renderReady([]);

        // Act — a write aimed at a note that is not there.
        await act(() => result.current.updateNote(99, { text: 'ghost' }));

        // Assert — the reason still names the note on screen …
        expect(result.current.state.actionError).toMatch(/99/);
        // … and the error itself, stack and all, is on the record. A string in
        // a toast cannot carry one.
        expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    });

    test('records a load that failed on this side of the wire', async () => {
        // Arrange — a note the reducer's ingest guard refuses.
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        api.get.mockResolvedValue({ notes: [note(1, { durationMinutes: 0 })] });

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toMatch(/duration/);
        expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    });

    test('says nothing to the console about an ordinary wire failure', async () => {
        // Arrange
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new ApiError('Could not reach the server.', 0));

        // Act
        await act(() => result.current.createNote(draft()));

        // Assert — the user is already being told; offline and 500 are the wire
        // working as designed, and logging them would bury the defects.
        expect(result.current.state.actionError).toBe('Could not reach the server.');
        expect(logged).not.toHaveBeenCalled();
    });

    test('records an unreadable body once, not twice', async () => {
        // Arrange
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        api.get.mockResolvedValue({});

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — the guard already put the body on the record; repeating it
        // with a stack pointing at the guard adds nothing.
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(logged).toHaveBeenCalledTimes(1);
    });
});

describe('createNote', () => {
    test('shows the note before the save lands, then takes the server’s id', async () => {
        // Arrange
        const { result } = await renderReady([]);
        let resolveSave;
        api.post.mockReturnValue(new Promise((resolve) => {
            resolveSave = resolve;
        }));

        // Act — optimistic
        let pending;
        act(() => {
            pending = result.current.createNote(draft());
        });

        // Assert — a temporary row is on screen with a negative id
        expect(result.current.state.notes).toHaveLength(1);
        expect(result.current.state.notes[0].id).toBeLessThan(0);
        expect(result.current.state.notes[0].text).toBe('on call');

        // Act — the save lands
        let landed;
        await act(async () => {
            resolveSave(note(7, { text: 'on call' }));
            landed = await pending;
        });

        // Assert
        expect(result.current.state.notes).toEqual([note(7, { text: 'on call' })]);
        expect(api.post).toHaveBeenCalledWith('/calendar/notes', draft());
        // Whether the write landed, for the caller with something to do about it.
        expect(landed).toBe(true);
    });

    test('rolls the note away when the save fails', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error('a day may hold at most 4 notes'));

        // Act
        let landed;
        await act(async () => {
            landed = await result.current.createNote(draft());
        });

        // Assert
        expect(result.current.state.notes).toEqual([]);
        expect(result.current.state.actionError).toBe('a day may hold at most 4 notes');
        expect(landed).toBe(false);
        // The load is the one from `renderReady` and no other: a rollback that
        // resynced instead would refetch, and that tells the two paths apart.
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('says something rather than nothing when the failure carries no message', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error());

        // Act
        await act(() => result.current.createNote(draft()));

        // Assert — an empty toast would tell the user less than the failure did.
        expect(result.current.state.actionError).toBe('Something went wrong. Please try again.');
    });

    test('refuses a malformed note without sending it', async () => {
        // Arrange — a gesture that produced an impossible length. The reducer's
        // ingest guard refuses it, and because the fold runs inside `dispatch`
        // the refusal lands in `mutate`'s own `try` rather than in a render.
        const { result } = await renderReady([]);

        // Act
        await act(() => result.current.createNote(draft({ durationMinutes: 0 })));

        // Assert — rolled back with a message, and the server never heard of it.
        expect(result.current.state.notes).toEqual([]);
        expect(result.current.state.actionError).toMatch(/duration/);
        expect(api.post).not.toHaveBeenCalled();
    });

    test('does not resurrect a note deleted while the new note’s save is in flight', async () => {
        // Arrange — a create still out, and the × on a real note still live.
        const { result } = await renderReady([note(1)]);
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        api.delete.mockResolvedValue({ id: 1 });

        let creation;
        act(() => {
            creation = result.current.createNote(draft());
        });

        // Act — the stored note goes while the new note's POST is still out.
        await act(() => result.current.deleteNote(1));
        const saved = note(7, { text: 'on call' });
        await act(async () => {
            pending.resolve(saved);
            await creation;
        });

        // Assert — the server's id is swapped in on the list as it now is,
        // rather than on the pre-delete one the create was applied to.
        expect(result.current.state.notes).toEqual([saved]);
    });

    test('re-syncs rather than rolling back when the list moved on beneath it', async () => {
        // Arrange — the interleaving a snapshot cannot undo: a create in flight,
        // a stored note deleted for good while it is out, and only then the POST
        // failing. Rolling back would put the deleted note back on screen.
        const { result } = await renderReady([note(1)]);
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        api.delete.mockResolvedValue({ id: 1 });

        let creation;
        act(() => {
            creation = result.current.createNote(draft());
        });
        await act(() => result.current.deleteNote(1));

        const resynced = [note(9)];
        const resync = deferred();
        api.get.mockReturnValue(resync.promise);

        // Act
        await act(async () => {
            pending.reject(new Error('nope'));
            await creation;
        });

        // Assert — the resync is out, and the plane stays readable while it is:
        // a failure that merely interleaved is no reason to blank the day back
        // to its loading state, which is what asking for a full `load` would do.
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.state.status).toBe(NOTES_STATUS.ready);

        // Act — the server says what is actually true
        await act(async () => {
            resync.resolve({ notes: resynced });
            await resync.promise;
        });

        // Assert — the server's own answer replaces the guesswork, and the
        // message survives the refetch so the failure is still on screen.
        await waitFor(() => expect(result.current.state.notes).toEqual(resynced));
        expect(result.current.state.actionError).toBe('nope');
    });
});

describe('updateNote', () => {
    test('applies the change at once and keeps the server’s answer', async () => {
        // Arrange
        const { result } = await renderReady([note(1)]);
        api.patch.mockResolvedValue(note(1, { startMinutes: 600 }));

        // Act
        await act(() => result.current.updateNote(1, { startMinutes: 600 }));

        // Assert
        expect(result.current.state.notes).toEqual([note(1, { startMinutes: 600 })]);
        expect(api.patch).toHaveBeenCalledWith('/calendar/notes/1', { startMinutes: 600 });
    });

    test('restores the note when the save fails', async () => {
        // Arrange
        const { result } = await renderReady([note(1)]);
        api.patch.mockRejectedValue(new Error('nope'));

        // Act
        await act(() => result.current.updateNote(1, { startMinutes: 600 }));

        // Assert
        expect(result.current.state.notes).toEqual([note(1)]);
        expect(result.current.state.actionError).toBe('nope');
    });

    test('refuses to address a note that is not there', async () => {
        // Arrange
        const { result } = await renderReady([]);

        // Act
        await act(() => result.current.updateNote(99, { text: 'ghost' }));

        // Assert — reported, not thrown out of a click handler
        expect(result.current.state.actionError).toMatch(/99/);
        expect(api.patch).not.toHaveBeenCalled();
        // A refusal changed nothing, so there is nothing to resync from: this is
        // still the one load `renderReady` did.
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('rolls back to the list as it is now, not as the last render saw it', async () => {
        // Arrange — two changes inside one tick, so no render lands between
        // them: a day is pruned, then a note in another day is dragged.
        const { result } = await renderReady([note(1, { dayId: 1 }), note(2, { dayId: 2 })]);
        api.patch.mockRejectedValue(new Error('nope'));

        // Act
        await act(async () => {
            result.current.pruneDay(1);
            await result.current.updateNote(2, { startMinutes: 600 });
        });

        // Assert — the rollback restores the snapshot the update itself took, so
        // the pruned day stays pruned. A snapshot read from the render's `state`
        // would be the pre-prune list and would put day 1's note back.
        expect(result.current.state.notes).toEqual([note(2, { dayId: 2 })]);
    });
});

describe('deleteNote', () => {
    test('removes it at once and leaves it gone', async () => {
        // Arrange
        const { result } = await renderReady([note(1), note(2)]);
        api.delete.mockResolvedValue({ id: 1 });

        // Act
        await act(() => result.current.deleteNote(1));

        // Assert
        expect(result.current.state.notes).toEqual([note(2)]);
        expect(api.delete).toHaveBeenCalledWith('/calendar/notes/1');
    });

    test('puts it back when the delete fails', async () => {
        // Arrange
        const { result } = await renderReady([note(1)]);
        api.delete.mockRejectedValue(new Error('nope'));

        // Act
        await act(() => result.current.deleteNote(1));

        // Assert
        expect(result.current.state.notes).toEqual([note(1)]);
    });

    test('refuses to delete a note that is not there', async () => {
        // Arrange
        const { result } = await renderReady([]);

        // Act
        await act(() => result.current.deleteNote(99));

        // Assert — reported, not thrown out of a click handler
        expect(result.current.state.actionError).toMatch(/99/);
        expect(api.delete).not.toHaveBeenCalled();
        expect(api.get).toHaveBeenCalledTimes(1);
    });
});

describe('pruneDay', () => {
    test('drops the notes of a day that has gone, and asks the server nothing', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 }), note(2, { dayId: 2 })]);

        // Act
        act(() => result.current.pruneDay(1));

        // Assert — the server already cascaded them; this is hygiene
        expect(result.current.state.notes).toEqual([note(2, { dayId: 2 })]);
        expect(api.delete).not.toHaveBeenCalled();
    });

    test('prunes a second day from the list the first prune left', async () => {
        // Arrange — two days deleted inside one tick, so no render lands between
        // them.
        const { result } = await renderReady([
            note(1, { dayId: 1 }),
            note(2, { dayId: 2 }),
            note(3, { dayId: 3 }),
        ]);

        // Act
        act(() => {
            result.current.pruneDay(1);
            result.current.pruneDay(2);
        });

        // Assert — neither prune undoes the other.
        expect(result.current.state.notes).toEqual([note(3, { dayId: 3 })]);
    });

    test('says nothing about a day that held no notes', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 })]);
        const before = result.current.state.notes;

        // Act
        act(() => result.current.pruneDay(99));

        // Assert — the same array, so nothing re-renders
        expect(result.current.state.notes).toBe(before);
    });
});

describe('notesForDay', () => {
    test('returns just that day’s notes', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 }), note(2, { dayId: 2 })]);

        // Act & Assert
        expect(result.current.notesForDay(2)).toEqual([note(2, { dayId: 2 })]);
    });

    test('hands back the same array for a day until the notes change', async () => {
        // Arrange
        const { result, rerender } = await renderReady([
            note(1, { dayId: 1 }),
            note(2, { dayId: 1 }),
            note(3, { dayId: 2 }),
        ]);

        // Act & Assert — twice in one render, and again across the next one.
        // `NotePlane` takes this array as a prop, so a fresh one per call would
        // re-render every lane whenever anything on the page moved.
        const before = result.current.notesForDay(1);
        expect(result.current.notesForDay(1)).toBe(before);

        rerender();

        expect(result.current.notesForDay(1)).toBe(before);
        expect(before).toEqual([note(1, { dayId: 1 }), note(2, { dayId: 1 })]);
    });

    test('hands back one shared empty list for every day that holds nothing', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 })]);

        // Act & Assert — an empty day is the common case in a fresh strip.
        expect(result.current.notesForDay(98)).toBe(result.current.notesForDay(99));
        expect(result.current.notesForDay(98)).toEqual([]);
    });

    test('regroups once the notes have changed', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 })]);
        const before = result.current.notesForDay(1);
        api.patch.mockResolvedValue(note(1, { dayId: 1, startMinutes: 600 }));

        // Act
        await act(() => result.current.updateNote(1, { startMinutes: 600 }));

        // Assert — held identity is not a stale answer.
        expect(result.current.notesForDay(1)).not.toBe(before);
        expect(result.current.notesForDay(1)).toEqual([note(1, { dayId: 1, startMinutes: 600 })]);
    });
});

describe('dismissActionError', () => {
    test('clears the message', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error('nope'));
        await act(() => result.current.createNote(draft()));

        // Act
        act(() => result.current.dismissActionError());

        // Assert
        expect(result.current.state.actionError).toBeNull();
    });
});

describe('the hook’s value', () => {
    test('hands back the same object across a render that changed nothing', async () => {
        // Arrange
        const { result, rerender } = await renderReady([note(1)]);
        const before = result.current;

        // Act — the kind of render the independently-loaded calendar and pool
        // cause, which the notes plane has no stake in.
        rerender();

        // Assert — a fresh object every render would re-render every ribbon.
        expect(result.current).toBe(before);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useCalendarNotes
```

Expected: FAIL — `Cannot find module './useCalendarNotes'`.

- [ ] **Step 3: Write the hook**

Create `src/client/src/hooks/useCalendarNotes.js`:

Three things below depart from what this plan originally specified, all three on the user's ruling after the Task 13 review — keep them:

1. **The response body is checked at the boundary.** `fetchNotes` reads it through `readNotes` rather than destructuring it, because `api` guarantees a parsed body and nothing about its shape, and a missing key reached the reducer as `undefined.forEach` — a stack trace's wording beside the retry button with nothing logged. `useCalendar.fetchCalendar` got the same treatment in the same commit, which is why that hook now appears in the Modified table.
2. **`notesForDay` groups once per change instead of filtering per call**, with a module-level `EMPTY_NOTES` for days that hold nothing, so a day's array keeps its identity for as long as its notes do. Filtering per call handed `NotePlane` a fresh prop on every render of the page.
3. **Failures are logged as well as shown — `logFailure`, on the load and write paths of both hooks.** The review proposed going further and replacing the message the user sees with a generic one whenever the error was not an `ApiError`. **The user ruled against that, and the verbatim wording is deliberate: do not “fix” it into a generic toast later.** A refused gesture names the note or the day on screen — *“refuses an unbookable item before it reaches the wire, and says why”* in `useCalendar.test.js` is one of seven tests across the two hooks that pin that wording, and the split would have reversed all seven. What was missing was the developer's half, not the user's, so the error object is written to the console alongside — for everything except an `ApiError` (ordinary offline/500 noise the user is already shown) and a body the envelope guard has already reported.

```js
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { ApiError, api } from '../lib/api';
import { createTempId } from '../lib/tempIds';
import { notesReducer, initialNotesState, notesOf } from '../state/notesReducer';
import {
    actionErrorCleared,
    actionErrorRaised,
    loadFailed,
    loadStarted,
    loadSucceeded,
    notesReplaced,
    rolledBack,
} from '../state/notesActions';

// Loads the notes and changes them optimistically, mirroring `useCalendar` —
// apply at once, send, then either keep the server's answer or roll back and
// raise a message. Nothing fails quietly.
//
// A sibling hook rather than part of `useCalendar` (design section 7.1). The
// page already runs `usePool` and `useCalendar` independently, each with its own
// failure state, because a calendar you cannot schedule into is still worth
// reading. Notes are a third plane of the same kind, and keeping them out of
// `useCalendar` is also what keeps `scheduleOf`, `toBulkRequest` and the bulk
// endpoint free of a notes dimension the cascade would never read.
//
// Simpler than `useCalendar` in one way that matters: the unit of change is one
// row. There is no cascade to fold, no spill to reconcile, no temporary day to
// re-key — so a mutation is "replace the list" and a rollback is "put the old
// list back".

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

// One shared empty list, so every day that holds nothing hands back the same
// array rather than a new one per call — the common case in a fresh strip.
const EMPTY_NOTES = [];

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/**
 * Records a failure for whoever has to work out why, without changing a word of
 * what the user is told.
 *
 * Both halves on purpose. A refused gesture or a payload the reducer would not
 * ingest says why on screen — that wording is deliberate and pinned by tests —
 * while the error itself, stack and all, goes where a string in a toast could
 * never carry it.
 *
 * An `ApiError` is not recorded. That class is the wire saying one of the things
 * the wire says: offline, 500, 409. The user is already being shown it, the
 * server has its own log of it, and repeating every one here would bury the
 * entries that mean a defect on this side under the ones that do not. What is
 * left is exactly that: an error this code did not expect to be possible.
 */
const logFailure = (context, error) => {
    if (error instanceof ApiError || error?.alreadyLogged) return;

    console.error(`[calendar notes] ${context}`, error);
};


const UNREADABLE_NOTES = 'The server sent an unreadable notes list.';

/**
 * The wire is a boundary, and `api` guarantees a parsed body and nothing at all
 * about its shape.
 *
 * Handed on unchecked, a body missing the key reaches `loadSucceeded` as
 * `undefined.forEach` — which lands in the `catch` below and puts a stack
 * trace's wording beside the retry button, with nothing anywhere saying what the
 * server actually sent. So the shape is checked where it enters, the user is
 * told something about the server, and the body goes to the console for whoever
 * has to work out why.
 */
const readNotes = (payload) => {
    if (!Array.isArray(payload?.notes)) {
        console.error('[calendar notes] unreadable response body:', payload);

        // The body is the diagnostic here, and it is already on the record, so
        // `logFailure` does not repeat it with a stack pointing at this line.
        const error = new Error(UNREADABLE_NOTES);
        error.alreadyLogged = true;

        throw error;
    }

    return payload.notes;
};

/**
 * Whether anything has settled into the list since `installed` was put there.
 *
 * Exact rather than a heuristic: `notesReducer` installs the array by reference,
 * so its identity survives until something replaces it. The same contract
 * `useCalendar` relies on, for the same purpose — a snapshot stops being an undo
 * the moment something else has changed the list, and restoring it then would
 * resurrect whatever settled in between.
 */
const hasSettledSince = (state, installed) => state.notes !== installed;

const useCalendarNotes = () => {
    const [state, rawDispatch] = useReducer(notesReducer, initialNotesState);

    // The state as the reducer has already been told to make it. A response can
    // beat the re-render that a dispatch schedules, so a mutation reading
    // `state` from its closure would rebase the server's answer onto a list that
    // is already stale. Folded through the same reducer so there is one
    // definition of what an action does.
    const stateRef = useRef(initialNotesState);

    /**
     * The only dispatcher this hook uses.
     *
     * Because the fold runs here, a reducer that refuses an action — the ingest
     * guard on a malformed note — throws in the caller's own frame rather than
     * during the next render, which is what lets `mutate` catch it and roll back
     * instead of the page's error boundary swallowing the plane.
     */
    const dispatch = useCallback((action) => {
        stateRef.current = notesReducer(stateRef.current, action);

        rawDispatch(action);
    }, []);

    const fetchNotes = useCallback(async () => {
        try {
            const notes = readNotes(await api.get('/calendar/notes'));

            dispatch(loadSucceeded(notes));
        } catch (err) {
            logFailure('load failed', err);

            dispatch(loadFailed(messageOf(err)));
        }
    }, [dispatch]);

    const load = useCallback(async () => {
        dispatch(loadStarted());

        await fetchNotes();
    }, [dispatch, fetchNotes]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * One optimistic write: apply, send, settle.
     *
     * `apply(notes)` returns the list as it should look at once. `onSuccess(notes,
     * saved)` returns it as it should look afterwards, rebased on the list as it
     * is *now* rather than on the optimistic one — the two differ whenever
     * something settled during the round trip.
     */
    const mutate = useCallback(
        async ({ apply, send, onSuccess }) => {
            const previous = notesOf(stateRef.current);

            // What this mutation put on screen, compared by reference at the end
            // and nothing else.
            let installed = null;

            try {
                // Inside the `try`, not in front of it. This function is
                // `async`, so a throw out here would reject the returned promise
                // rather than reaching the caller — and a popover's Save fires a
                // mutation without awaiting it. A write aimed at a note that is
                // no longer there would then be an unhandled rejection with
                // nothing on screen. Caught here it is a visible `actionError`,
                // and the request is never sent.
                const optimistic = apply(previous);

                dispatch(notesReplaced(optimistic));
                installed = optimistic;

                const saved = await send();

                if (onSuccess) {
                    dispatch(notesReplaced(onSuccess(notesOf(stateRef.current), saved)));
                }

                return true;
            } catch (err) {
                logFailure('write failed', err);

                // `previous` is an undo only while this mutation's change is
                // still the last thing that happened. Once something else has
                // settled, restoring it would wind that away too — so the
                // message is raised without touching the list, and the server is
                // asked what is actually true.
                if (installed && hasSettledSince(stateRef.current, installed)) {
                    dispatch(actionErrorRaised(messageOf(err)));

                    // `fetchNotes` rather than `load`: nothing about this asked
                    // the user to wait, and emptying the plane would be a bigger
                    // interruption than the failure was.
                    fetchNotes();

                    return false;
                }

                dispatch(rolledBack(previous, messageOf(err)));

                return false;
            }
        },
        [dispatch, fetchNotes]
    );

    /**
     * A note the server has not stored yet is drawn immediately under a negative
     * id — the same optimistic pattern every other row in this app uses — and
     * re-keyed when the answer arrives.
     *
     * The temp id is captured from `apply`, which `mutate` calls once and
     * synchronously, before the request it is reconciled by can possibly answer.
     */
    const createNote = useCallback(
        ({ dayId, text, startMinutes, durationMinutes }) => {
            let tempId = null;

            return mutate({
                apply: (notes) => {
                    tempId = createTempId();

                    return [
                        ...notes,
                        { id: tempId, dayId, text, startMinutes, durationMinutes },
                    ];
                },
                send: () =>
                    api.post('/calendar/notes', { dayId, text, startMinutes, durationMinutes }),
                onSuccess: (notes, saved) =>
                    notes.map((note) => (note.id === tempId ? saved : note)),
            });
        },
        [mutate]
    );

    /**
     * Rename, move or resize — one row write, whichever fields the gesture sent.
     *
     * Refuses a note that is not in the list rather than quietly producing no
     * change, which would look like a save that silently did nothing. The refusal
     * is thrown from `apply`, so `mutate` turns it into a visible message and
     * sends no request.
     */
    const updateNote = useCallback(
        (id, fields) =>
            mutate({
                apply: (notes) => {
                    if (!notes.some((note) => note.id === id)) {
                        throw new Error(`Note ${id} is no longer there`);
                    }

                    return notes.map((note) =>
                        note.id === id ? { ...note, ...fields } : note
                    );
                },
                send: () => api.patch(`/calendar/notes/${id}`, fields),
                onSuccess: (notes, saved) =>
                    notes.map((note) => (note.id === id ? saved : note)),
            }),
        [mutate]
    );

    const deleteNote = useCallback(
        (id) =>
            mutate({
                apply: (notes) => {
                    if (!notes.some((note) => note.id === id)) {
                        throw new Error(`Note ${id} is no longer there`);
                    }

                    return notes.filter((note) => note.id !== id);
                },
                send: () => api.delete(`/calendar/notes/${id}`),
            }),
        [mutate]
    );

    /**
     * Drops the notes of a day that has been deleted.
     *
     * No request: the schema cascaded them away the moment the day went (decision
     * 9). This is local hygiene, and the page calls it only after the delete the
     * server accepted.
     *
     * It is not load-bearing either, which is why a rolled-back day deletion
     * needs no undo here. Notes are rendered inside a column, so a day removed
     * optimistically stops drawing its notes for free — and if that deletion
     * rolls back, the column returns with its notes still in state.
     *
     * Returns the same array when the day held nothing, so an unrelated deletion
     * re-renders no ribbons.
     */
    const pruneDay = useCallback(
        (dayId) => {
            const notes = notesOf(stateRef.current);
            const kept = notes.filter((note) => note.dayId !== dayId);

            if (kept.length === notes.length) return;

            dispatch(notesReplaced(kept));
        },
        [dispatch]
    );

    // Grouped once per change rather than filtered once per call, so a day's
    // array keeps its identity for as long as its notes do.
    //
    // `NotePlane` takes that array as a prop. Filtering per call would hand it a
    // fresh one on every render the page has — including the ones the
    // independently-loaded calendar and pool cause — and re-render every lane in
    // every column over notes that did not move, which is the memoised return
    // above being undone one prop at a time.
    const notesByDay = useMemo(() => {
        const byDay = new Map();

        state.notes.forEach((note) =>
            byDay.set(note.dayId, [...(byDay.get(note.dayId) ?? []), note])
        );

        return byDay;
    }, [state.notes]);

    /** One day's notes, in the order they arrived, for the plane in its column. */
    const notesForDay = useCallback(
        (dayId) => notesByDay.get(dayId) ?? EMPTY_NOTES,
        [notesByDay]
    );

    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), [dispatch]);

    // Memoised for the same reason `useCalendar`'s return is: the page holds it
    // across renders that the independently-loaded calendar and pool cause, and
    // a fresh object each time would re-render every ribbon for nothing.
    return useMemo(
        () => ({
            state,
            reload: load,
            createNote,
            updateNote,
            deleteNote,
            pruneDay,
            notesForDay,
            dismissActionError,
        }),
        [
            state,
            load,
            createNote,
            updateNote,
            deleteNote,
            pruneDay,
            notesForDay,
            dismissActionError,
        ]
    );
};

export default useCalendarNotes;
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useCalendarNotes
```

Expected: PASS, 34 tests.

The count grew twice over the original fourteen: once to protect eleven behaviours that were deletable while green (see Step 1), and once for the boundary guard and the grouping identity above.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/hooks/useCalendarNotes.js src/client/src/hooks/useCalendarNotes.test.js
git commit -m "feat: add the notes hook"
```

---

## Task 14: `NoteRibbon`

**Files:**
- Create: `src/client/src/components/Calendar/NoteRibbon.js`
- Modify: `src/client/src/hooks/useCalendarDrag.js`
- Test: `src/client/src/components/Calendar/NoteRibbon.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/components/Calendar/NoteRibbon.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NoteRibbon from './NoteRibbon';
import { MAX_NOTE_LANES } from '../../lib/noteLanes';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';

const note = (overrides = {}) => ({
    id: 1,
    dayId: 1,
    text: 'train to Leeds',
    startMinutes: 540,
    durationMinutes: 120,
    ...overrides,
});

const renderRibbon = (props = {}) =>
    render(
        <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
            <NoteRibbon note={note()} lane={0} {...props} />
        </DayScaleProvider>
    );

const ribbonOf = (container) => container.querySelector('.note-ribbon');

describe('NoteRibbon', () => {
    test('shows the note’s text', () => {
        // Act
        renderRibbon();

        // Assert
        expect(screen.getByText('train to Leeds')).toBeInTheDocument();
    });

    test('is drawn at the minute it starts and as tall as it lasts', () => {
        // Arrange
        const geometry = createDayGeometry(PX_PER_SLOT_MIN);

        // Act
        const { container } = renderRibbon();

        // Assert
        expect(ribbonOf(container)).toHaveStyle({
            top: `${geometry.minutesToPx(540)}px`,
            height: `${geometry.minutesToPx(120)}px`,
        });
    });

    test('lane 0 sits at the right-hand edge of the plane', () => {
        // Act
        const { container } = renderRibbon({ lane: 0 });

        // Assert
        expect(ribbonOf(container)).toHaveStyle({
            right: '0%',
            width: `${100 / MAX_NOTE_LANES}%`,
        });
    });

    test('each further lane steps leftward by one lane width', () => {
        // Act
        const { container } = renderRibbon({ lane: 2 });

        // Assert
        expect(ribbonOf(container)).toHaveStyle({
            right: `${(2 * 100) / MAX_NOTE_LANES}%`,
        });
    });

    test('a note with no free lane is marked rather than hidden', () => {
        // Act
        const { container } = renderRibbon({ lane: null });

        // Assert
        expect(ribbonOf(container)).toHaveClass('note-ribbon--unplaceable');
        expect(screen.getByText('train to Leeds')).toBeInTheDocument();
    });

    test('opens the note when clicked', async () => {
        // Arrange
        const onOpen = jest.fn();
        renderRibbon({ onOpen });

        // Act
        await userEvent.click(screen.getByRole('button', { name: /train to Leeds/ }));

        // Assert
        expect(onOpen).toHaveBeenCalledWith(1);
    });

    test('is plain text when there is nowhere to open', () => {
        // Act
        renderRibbon({ onOpen: null });

        // Assert
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('has no resize edges until it is given some', () => {
        // Act
        renderRibbon();

        // Assert
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    test('draws both edges when it is given them', () => {
        // Arrange
        const resize = { top: { handleProps: {} }, bottom: { handleProps: {} } };

        // Act
        renderRibbon({ resize });

        // Assert
        expect(screen.getAllByRole('separator')).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NoteRibbon
```

Expected: FAIL — `Cannot find module './NoteRibbon'`.

- [ ] **Step 3: Add the note draggable**

In `src/client/src/hooks/useCalendarDrag.js`, add after `useBookingDrag` and update the header's first paragraph to say three things can be lifted rather than two:

```js
/**
 * A note ribbon. A third thing this page can lift, and the one that lands in the
 * other plane: `dragKindOf` reads this to know a drop belongs to the notes
 * droppable rather than to a day's to-do plane.
 */
export const useNoteDrag = (noteId) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: `note-${noteId}`,
        data: { noteId },
    });

    return { setNodeRef, handleProps: { ...attributes, ...listeners } };
};
```

- [ ] **Step 4: Write the component**

Create `src/client/src/components/Calendar/NoteRibbon.js`:

```js
import React from 'react';

import { MAX_NOTE_LANES } from '../../lib/noteLanes';
import { formatTime } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';
import { useNoteDrag } from '../../hooks/useCalendarDrag';

// One note, drawn over the grid at the minute it starts and as tall as it lasts.
//
// A narrow vertical bar rather than a card, and the text is rotated to read
// bottom-to-top (decision 3). That is what makes overlap affordable: a
// horizontal card needs ~120px to carry a readable label, so four overlapping
// notes would want 480px of plane; a ribbon carries the same label in ~20px and
// grows along the axis a time block already has to spare.
//
// The whole ribbon is one target. There is no separate drag handle and no hover
// ×, because at this width there is no room for either — the body is the button
// that opens the popover, and the dnd sensor's activation distance is what keeps
// a click from being swallowed by a drag. Deleting happens in the popover.
//
// Two edges, and unlike a booking's they are symmetric: notes may overlap, so a
// top edge has nothing above it to clamp against. What they may not do is leave
// the day, which `canPlace` enforces on the caller's side.

/** Lane 0 is the rightmost, so the two planes build out from the boundary. */
const laneStyle = (lane) => ({
    right: `${(lane * 100) / MAX_NOTE_LANES}%`,
    width: `${100 / MAX_NOTE_LANES}%`,
});

/**
 * `lane` is the index from `assignLanes`, or null for a note it could not place.
 * An unplaceable note is still drawn — in lane 0, marked — rather than dropped:
 * every client gesture is refused before it can make one, so this only arises
 * from data that got past the server, and a ribbon that silently vanished would
 * be much harder to explain than one that looks wrong.
 *
 * Anything that is not a lane index counts as unplaceable, not just the null
 * `assignLanes` returns, and `Number.isInteger` rather than `== null` is what
 * says so. The caller reads its lane out of a `Map`, and a `Map.get` that misses
 * returns `undefined` — which `laneStyle` would turn into `right: NaN%`, a
 * declaration the CSSOM drops on the floor. The ribbon would then inherit
 * whatever the stylesheet defaults to, unmarked, and a note drawn in the wrong
 * lane with no sign of it is the one outcome this component's whole null branch
 * exists to avoid. Treating every non-index the same way keeps that promise
 * whatever shape the miss arrives in.
 *
 * `resize` is `{ top, bottom }` and `onOpen` is optional, both for the same
 * reasons `DayItemCard`'s are: a ribbon rendered bare in a test is the plain
 * graphic below.
 */
const NoteRibbon = ({ note, lane, onOpen = null, isDraggable = false, resize = null }) => {
    const geometry = useDayGeometry();

    // Unconditional, like `DayItemCard`'s: `isDraggable` decides what is
    // rendered, never whether the hook runs. Inert outside a `DndContext`.
    const drag = useNoteDrag(note.id);

    const isUnplaceable = !Number.isInteger(lane);

    const className = ['note-ribbon', isUnplaceable ? 'note-ribbon--unplaceable' : '']
        .filter(Boolean)
        .join(' ');

    const range = `${formatTime(note.startMinutes)}–${formatTime(
        note.startMinutes + note.durationMinutes
    )}`;

    return (
        <div
            className={className}
            style={{
                top: `${geometry.minutesToPx(note.startMinutes)}px`,
                height: `${geometry.minutesToPx(note.durationMinutes)}px`,
                ...laneStyle(isUnplaceable ? 0 : lane),
            }}
            ref={isDraggable ? drag.setNodeRef : undefined}
        >
            {resize && (
                <span
                    className="note-ribbon-edge note-ribbon-edge--top"
                    role="separator"
                    aria-label={`Change when “${note.text}” starts`}
                    {...resize.top.handleProps}
                />
            )}

            {onOpen ? (
                <button
                    type="button"
                    className="note-ribbon-body"
                    // The time is in the label rather than printed: a ribbon has
                    // no room for a second line, but a screen reader has no
                    // reason to go without it.
                    aria-label={`${note.text}, ${range}`}
                    onClick={() => onOpen(note.id)}
                    {...(isDraggable ? drag.handleProps : {})}
                >
                    <span className="note-ribbon-text">{note.text}</span>
                </button>
            ) : (
                // Labelled like the button above it, because the reason the
                // time is not printed does not change when the ribbon stops
                // being a control: there is still no room for a second line.
                <span className="note-ribbon-body" aria-label={`${note.text}, ${range}`}>
                    <span className="note-ribbon-text">{note.text}</span>
                </span>
            )}

            {resize && (
                <span
                    className="note-ribbon-edge note-ribbon-edge--bottom"
                    role="separator"
                    aria-label={`Change how long “${note.text}” lasts`}
                    {...resize.bottom.handleProps}
                />
            )}
        </div>
    );
};

export default NoteRibbon;
```

- [ ] **Step 5: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NoteRibbon
```

Expected: PASS. The nine tests above pass as written; what shipped is 23,
because the nine leave most of this component deletable (see the note below).

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Calendar/NoteRibbon.js src/client/src/components/Calendar/NoteRibbon.test.js src/client/src/hooks/useCalendarDrag.js
git commit -m "feat: add the note ribbon"
```

### As built

Two deliberate departures from the task as written. Both were found by mutation
testing the shipped component against the nine tests above; neither should be
reverted.

1. **`isUnplaceable` is `!Number.isInteger(lane)`, not `lane === null`.** Task 15
   passes `lane` from `assignLanes(notes).get(note.id)`, and a `Map.get` that
   misses returns `undefined`, which the narrow check let through to
   `laneStyle(undefined)` → `right: NaN%`. The CSSOM discards that declaration
   silently, so the ribbon rendered with no `right` at all and *without* the
   `--unplaceable` class: mispositioned, unmarked, and indistinguishable from a
   correct one. The widened check routes every non-index down the branch this
   component already has for exactly that case. Out-of-range integers are
   deliberately *not* clamped — `assignLanes` cannot produce one.

2. **The non-interactive `<span>` body carries the same `aria-label` as the
   button**, so the time range a ribbon has no room to print is announced whether
   or not there is anywhere to open. `range` was already computed on both
   branches.

The suite is 23 tests rather than 9. The extra fourteen pin what the nine left
untested, all of it confirmed by mutation: both edges' `handleProps` and their
`aria-label`s and class names, the lane width outside lane 0, the
`note-ribbon-body` and `note-ribbon-text` class names the stylesheet needs, the
range in both labels, `onOpen` and `useNoteDrag` receiving the note's *own* id
(the task's fixture has `id === dayId`, which hid both), and — through a real
`DndContext` and keyboard lift — the drag id, the `{ noteId }` payload,
dnd-kit's `attributes`, and the node ref without which a drop has no rect to
measure.

Not addressed here: the resize edges have no keyboard path, being non-focusable
`role="separator"` spans with no key handler. That is inherited from
`DayItemCard` and is project-wide, not introduced by this task.

**Known accessibility debt, accepted deliberately.** There is no keyboard path
to resize a note or a booking at all (WCAG 2.1.1), and the edges the stylesheet
draws are around 6px tall where WCAG 2.5.8 asks for 24px. Task 17's popover is
*not* the keyboard equivalent: it renders the time range as display text, and
its only input is the note's text. Closing this properly would mean focusable
edges with arrow-key resize in the shared `useResizeEdge`, reaching both planes.

The user was asked and chose to ship as planned and document the gap rather
than expand the plan mid-flight. Task 21 records it in the README so it is a
tracked decision rather than something rediscovered later. Do not treat the
absence as an oversight to be quietly "fixed" by a later task.

---

## Task 15: `NotePlane`, wired into the column

At the end of this task notes seeded by hand appear in their lanes. Nothing creates one yet.

**Files:**
- Create: `src/client/src/components/Calendar/NotePlane.js`
- Modify: `src/client/src/components/Calendar/DayColumn.js`
- Modify: `src/client/src/components/Styling/Calendar.css`
- Test: `src/client/src/components/Calendar/NotePlane.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/components/Calendar/NotePlane.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';

import NotePlane from './NotePlane';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';

const note = (id, overrides = {}) => ({
    id,
    dayId: 1,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const renderPlane = (props = {}) =>
    render(
        <DayScaleProvider value={createDayGeometry(PX_PER_SLOT_MIN)}>
            <NotePlane dayId={1} notes={[]} {...props} />
        </DayScaleProvider>
    );

describe('NotePlane', () => {
    test('draws every note it is given', () => {
        // Act
        renderPlane({ notes: [note(1), note(2, { startMinutes: 700 })] });

        // Assert
        expect(screen.getByText('note 1')).toBeInTheDocument();
        expect(screen.getByText('note 2')).toBeInTheDocument();
    });

    test('puts a lone note in lane 0', () => {
        // Act
        const { container } = renderPlane({ notes: [note(1)] });

        // Assert
        expect(container.querySelector('.note-ribbon')).toHaveStyle({ right: '0%' });
    });

    test('steps overlapping notes leftward', () => {
        // Arrange — two notes covering the same hour
        const notes = [note(1), note(2)];

        // Act
        const { container } = renderPlane({ notes });

        // Assert
        const ribbons = [...container.querySelectorAll('.note-ribbon')];
        expect(ribbons.map((ribbon) => ribbon.style.right)).toEqual(['0%', '25%']);
    });

    test('is labelled for the day it belongs to', () => {
        // Act
        renderPlane({ label: 'Notes for Day 1' });

        // Assert
        expect(screen.getByRole('group', { name: 'Notes for Day 1' })).toBeInTheDocument();
    });

    test('hands the render over when a caller takes it', () => {
        // Arrange — the wrapper that owns the gestures supplies its own ribbons
        const ribbonFor = (aNote, lane) => (
            <div key={aNote.id} data-testid="custom">{`${aNote.text} @ ${lane}`}</div>
        );

        // Act
        renderPlane({ notes: [note(1)], ribbonFor });

        // Assert
        expect(screen.getByTestId('custom')).toHaveTextContent('note 1 @ 0');
    });

    test('renders a draft ghost when one is in flight', () => {
        // Arrange
        const draft = { startMinutes: 600, durationMinutes: 30, isAllowed: true };

        // Act
        const { container } = renderPlane({ draft });

        // Assert
        expect(container.querySelector('.note-draft')).toBeInTheDocument();
        expect(container.querySelector('.note-draft--refused')).not.toBeInTheDocument();
    });

    test('marks a draft that cannot be placed', () => {
        // Arrange
        const draft = { startMinutes: 600, durationMinutes: 30, isAllowed: false };

        // Act
        const { container } = renderPlane({ draft });

        // Assert
        expect(container.querySelector('.note-draft--refused')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NotePlane
```

Expected: FAIL — `Cannot find module './NotePlane'`.

- [ ] **Step 3: Write the component**

Create `src/client/src/components/Calendar/NotePlane.js`:

```js
import React, { useMemo } from 'react';

import NoteRibbon from './NoteRibbon';
import { assignLanes } from '../../lib/noteLanes';
import { useDayGeometry } from '../../state/DayScaleContext';

// The left half of a day column: four lanes of free-floating context
// (design 2026-09-16, section 8.1).
//
// The lanes are not elements. A ribbon is positioned from its lane index, the
// way a booking is positioned from its start time, so there is nothing here for
// four empty tracks to be — and nothing for a screen reader to wade through
// either. The plane is one group holding however many notes there are.
//
// Nothing in here settles anything. That is the whole difference between this
// and the to-do plane: notes overlap rather than push (decision 2), so the only
// question a note asks is which lane it is drawn in, and `assignLanes` answers
// it from the day's notes alone.
//
// `ribbonFor` exists for the same reason `DayColumn`'s `cardFor` does: a
// resizable, draggable ribbon needs a hook per edge, and hooks cannot be called
// from a loop in here. The wrapper that owns the gestures supplies them; absent,
// the plane draws plain ribbons. A caller that takes the render over owns the
// key.

/**
 * `draft` is the create gesture in flight — `{ startMinutes, durationMinutes,
 * isAllowed }` — drawn as a ghost so the user can see the range they are
 * describing, and see it refused before they let go (design section 8.4).
 */
const NotePlane = ({
    dayId,
    notes,
    label = 'Notes',
    onOpenNote = null,
    droppable = null,
    ribbonFor = null,
    draft = null,
    surfaceProps = null,
}) => {
    const geometry = useDayGeometry();

    // Recomputed whenever the day's notes change, and only then. Every ribbon
    // reads it, and it is a sort plus a scan — cheap, but not free on a drag
    // that re-renders the strip on every pointer move.
    const lanes = useMemo(() => assignLanes(notes), [notes]);

    return (
        <div
            // The droppable contributes the "--over" class, so the plane has to
            // compose rather than own its className.
            className={`note-plane${droppable ? ` ${droppable.className}` : ""}`}
            role="group"
            aria-label={label}
            data-day-id={dayId}
            ref={droppable?.setNodeRef}
        >
            {/* The surface the create gesture is pressed on. A sibling behind
                the ribbons rather than the plane itself, so a press that lands
                on an existing note opens it instead of starting a new one —
                which is what the user meant by pressing on it. */}
            <div className="note-plane-surface" {...(surfaceProps ?? {})} />

            {notes.map((note) =>
                ribbonFor ? (
                    ribbonFor(note, lanes.get(note.id))
                ) : (
                    <NoteRibbon
                        key={note.id}
                        note={note}
                        lane={lanes.get(note.id)}
                        onOpen={onOpenNote}
                    />
                )
            )}

            {draft && (
                <div
                    className={`note-draft${draft.isAllowed ? '' : ' note-draft--refused'}`}
                    aria-hidden="true"
                    style={{
                        top: `${geometry.minutesToPx(draft.startMinutes)}px`,
                        height: `${geometry.minutesToPx(draft.durationMinutes)}px`,
                    }}
                />
            )}
        </div>
    );
};

export default NotePlane;
```

- [ ] **Step 4: Render it from `DayColumn`**

In `src/client/src/components/Calendar/DayColumn.js`:

Add the import:

```js
import NotePlane from './NotePlane';
```

Add props to the signature — `notes = []`, `notePlane = null` — and render the plane inside `DayGrid`, before the bookings:

```jsx
                    <DayGrid>
                        {/* The notes plane is drawn inside the same grid as the
                            bookings so the two planes share one clock face and
                            cannot drift apart by a pixel. It is a sibling of the
                            cards, not a container for them: they are independent
                            (decision 1). */}
                        {notePlane ? (
                            notePlane
                        ) : (
                            <NotePlane dayId={day.id} notes={notes} label={`Notes for ${label}`} />
                        )}

                        {items.map((item) => ...)}
                        {children}
                    </DayGrid>
```

Update the component's header comment — after the paragraph about the inner scroll, add:

```
// The column is split down the middle: notes on the left, bookings on the right
// (design 2026-09-16, section 8.1). The hour gutter sits outside that split, so
// it is the gutter, then two equal halves. Both planes are absolutely positioned
// over the same `DayGrid`, which is what keeps one clock face for both.
```

- [ ] **Step 5: Style the plane**

In `src/client/src/components/Styling/Calendar.css`, add to the `.calendar-page` token block:

```css
    /* The column splits in half after the gutter: notes left, to-dos right
     * (design 2026-09-16, section 8.1). One number, used by both halves, so they
     * cannot disagree about where the boundary is. */
    --cal-note-plane-width: 50%;
    /* The grab strips on a ribbon's ends. Same depth as a booking's, so the two
     * planes feel the same under the pointer. */
    --cal-note-edge-depth: var(--cal-resize-depth);
```

Then add a section before "The pool":

```css
/* ─── The notes plane ────────────────────────────────────────────────────── */

/* The left half of the grid, from the end of the gutter to the middle of the
 * column. Absolutely positioned over `.day-grid`, like the bookings on the other
 * side — the two planes share one clock face and never interact. */
.note-plane {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--cal-gutter-width);
    /* Half of what is left after the gutter, so the two planes are equal. */
    width: calc((100% - var(--cal-gutter-width)) * 0.5);
    border-right: 1px dashed var(--border);
}

/* The press-to-create surface, behind every ribbon. Stretched over the plane so
 * a press anywhere empty starts a draft, and underneath the ribbons so a press
 * on one opens it instead. */
.note-plane-surface {
    position: absolute;
    inset: 0;
    cursor: crosshair;
}

/* A ribbon is positioned in two dimensions at once: `top`/`height` are its time,
 * `right`/`width` are its lane, and both arrive as inline styles. `right` rather
 * than `left` is decision 6 — lane 0 is the one against the to-do plane, so the
 * notes build outward from the boundary between the two halves. */
.note-ribbon {
    position: absolute;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--bg-alt);
    border-left: var(--cal-item-edge-width) solid var(--color-primary);
}

/* A note the picker could not place — five overlapping, which no gesture here
 * can produce. It is drawn in lane 0 and marked, rather than dropped, because a
 * ribbon that silently vanished would be far harder to explain. */
.note-ribbon--unplaceable {
    border-left-color: var(--color-danger);
    opacity: 0.7;
}

/* The whole ribbon is the button: there is no room at this width for a separate
 * handle, so one target does both jobs and the drag sensor's activation distance
 * keeps a click from being swallowed. */
.note-ribbon-body {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: var(--space-xs) 0;
    background: none;
    border: 0;
    color: var(--text-secondary);
    cursor: grab;
}

/* Rotated to read bottom-to-top, which is what lets a ribbon be ~20px wide and
 * still carry a legible label (decision 3).
 *
 * `vertical-rl` plus a half turn rather than `sideways-lr`, which only Firefox
 * implements. Clipped rather than wrapped: the ribbon's height is the note's
 * duration and a long name must not be able to argue with it. */
.note-ribbon-text {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    max-height: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-sm);
}

button.note-ribbon-body:hover .note-ribbon-text {
    color: var(--color-accent);
}

/* Grab strips, like a booking's. Symmetric, unlike a booking's, because notes
 * may overlap: a note's top edge has nothing above it to clamp against. */
.note-ribbon-edge {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--cal-note-edge-depth);
    z-index: 1;
    cursor: ns-resize;
}

.note-ribbon-edge--top {
    top: 0;
}

.note-ribbon-edge--bottom {
    bottom: 0;
}

.note-ribbon-edge:hover {
    background: var(--color-accent);
    opacity: 0.2;
}

/* The range being described by a press-and-drag, before it is a note. Drawn
 * across the whole plane rather than in a lane: which lane it would land in is
 * not settled until the gesture ends. */
.note-draft {
    position: absolute;
    left: 0;
    right: 0;
    border: 1px dashed var(--color-accent);
    border-radius: var(--radius-sm);
    background: var(--color-warning-light);
    pointer-events: none;
}

/* The refusal, shown while it is happening rather than reported afterwards
 * (design section 8.4). A release here does nothing at all. */
.note-draft--refused {
    border-color: var(--color-danger);
    background: none;
}
```

Also constrain the bookings to the right half — in the existing `.day-item-card` rule, change `left`:

```css
.day-item-card {
    position: absolute;
    /* The gutter, plus the notes plane. The to-do plane is the right half. */
    left: calc(var(--cal-gutter-width) + (100% - var(--cal-gutter-width)) * 0.5);
    right: var(--space-xs);
    /* ...the rest unchanged... */
}
```

- [ ] **Step 6: Run the client suite**

```bash
npm run test:client
```

Expected: PASS, including `DayColumn.test.js` unchanged.

- [ ] **Step 7: See it with real data**

```bash
npm run dev
```

Insert a few notes by hand against a day you own, then reload `/calendar`:

```sql
INSERT INTO calendar_notes (day_id, text, start_minutes, duration_minutes) VALUES
  (<dayId>, 'train to Leeds', 540, 150),
  (<dayId>, 'on call',        600,  90),
  (<dayId>, 'kids at home',   630, 210);
```

Expected: three ribbons in the left half, the first hard against the to-do boundary and the others stepping leftward, text reading bottom-to-top.

- [ ] **Step 8: Commit**

```bash
git add src/client/src/components/Calendar/ src/client/src/components/Styling/Calendar.css
git commit -m "feat: draw the notes plane inside each day column"
```

---

## Task 16: `useNoteDraft`

**Files:**
- Create: `src/client/src/hooks/useNoteDraft.js`
- Test: `src/client/src/hooks/useNoteDraft.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/hooks/useNoteDraft.test.js`:

```js
import { act, renderHook } from '@testing-library/react';

import useNoteDraft, { rangeFor } from './useNoteDraft';
import { MIN_DURATION } from '../lib/schedule';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../lib/scheduleGeometry';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);

/** A plane 1152px tall whose top edge is at y=0, which is what a day is at the floor. */
const planeRect = { top: 0, height: geometry.dayHeightPx };

const stubSurface = () => ({ getBoundingClientRect: () => planeRect });

const press = (result, clientY, options = {}) =>
    act(() =>
        result.current.startDraft(1, {
            clientY,
            currentTarget: stubSurface(),
            preventDefault: () => {},
            stopPropagation: () => {},
            ...options,
        })
    );

const movePointer = (clientY) =>
    act(() => {
        document.dispatchEvent(new MouseEvent('pointermove', { clientY }));
    });

const release = () =>
    act(() => {
        document.dispatchEvent(new MouseEvent('pointerup', {}));
    });

const renderDraft = (overrides = {}) => {
    const onCommit = jest.fn();

    const view = renderHook(() =>
        useNoteDraft({
            geometry,
            canPlaceAt: () => true,
            onCommit,
            ...overrides,
        })
    );

    return { ...view, onCommit };
};

describe('rangeFor', () => {
    test('a press with no movement is one default block', () => {
        // Act & Assert
        expect(rangeFor(540, 540)).toEqual({ startMinutes: 540, durationMinutes: 30 });
    });

    test('a downward drag runs from the press to the release', () => {
        // Act & Assert
        expect(rangeFor(540, 660)).toEqual({ startMinutes: 540, durationMinutes: 120 });
    });

    test('an upward drag is the same gesture, the other way round', () => {
        // Act & Assert
        expect(rangeFor(660, 540)).toEqual({ startMinutes: 540, durationMinutes: 120 });
    });

    test('never returns less than one slot', () => {
        // Act & Assert
        expect(rangeFor(540, 545).durationMinutes).toBe(MIN_DURATION);
    });

    test('is held inside the day at the bottom', () => {
        // Act & Assert — a press at 23:30 can only be half an hour long
        expect(rangeFor(1410, 1440)).toEqual({ startMinutes: 1410, durationMinutes: 30 });
    });
});

describe('useNoteDraft', () => {
    test('has no draft until something is pressed', () => {
        // Act
        const { result } = renderDraft();

        // Assert
        expect(result.current.draft).toBeNull();
    });

    test('a press starts a default-length draft at that minute', () => {
        // Arrange
        const { result } = renderDraft();

        // Act — 09:00 is 540 minutes down
        press(result, geometry.minutesToPx(540));

        // Assert
        expect(result.current.draft).toMatchObject({
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 30,
            isAllowed: true,
        });
    });

    test('dragging extends it, snapped to the grid', () => {
        // Arrange
        const { result } = renderDraft();
        press(result, geometry.minutesToPx(540));

        // Act
        movePointer(geometry.minutesToPx(660));

        // Assert
        expect(result.current.draft).toMatchObject({
            startMinutes: 540,
            durationMinutes: 120,
        });
    });

    test('marks a draft the day has no room for', () => {
        // Arrange
        const { result } = renderDraft({ canPlaceAt: () => false });

        // Act
        press(result, geometry.minutesToPx(540));

        // Assert
        expect(result.current.draft.isAllowed).toBe(false);
    });

    test('commits the range on release', () => {
        // Arrange
        const { result, onCommit } = renderDraft();
        press(result, geometry.minutesToPx(540));
        movePointer(geometry.minutesToPx(660));

        // Act
        release();

        // Assert
        expect(onCommit).toHaveBeenCalledWith({
            dayId: 1,
            startMinutes: 540,
            durationMinutes: 120,
        });
        expect(result.current.draft).toBeNull();
    });

    test('commits nothing when the day has no room', () => {
        // Arrange
        const { result, onCommit } = renderDraft({ canPlaceAt: () => false });
        press(result, geometry.minutesToPx(540));

        // Act
        release();

        // Assert — the refusal is the ghost; the release is simply ignored
        expect(onCommit).not.toHaveBeenCalled();
        expect(result.current.draft).toBeNull();
    });

    test('Escape abandons it', () => {
        // Arrange
        const { result, onCommit } = renderDraft();
        press(result, geometry.minutesToPx(540));

        // Act
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });

        // Assert
        expect(result.current.draft).toBeNull();
        expect(onCommit).not.toHaveBeenCalled();
    });

    test('ignores a press that is not the primary button', () => {
        // Arrange
        const { result } = renderDraft();

        // Act
        press(result, geometry.minutesToPx(540), { button: 2 });

        // Assert
        expect(result.current.draft).toBeNull();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useNoteDraft
```

Expected: FAIL — `Cannot find module './useNoteDraft'`.

- [ ] **Step 3: Write the hook**

Create `src/client/src/hooks/useNoteDraft.js`:

```js
import { useCallback, useEffect, useState } from 'react';

import { DAY_MINUTES, MIN_DURATION } from '../lib/schedule';
import { clampStart, snapToSlot } from '../lib/scheduleGeometry';

// Pressing and dragging on empty notes background to describe a new note
// (design 2026-09-16, section 8.2).
//
// Raw pointer events rather than a dnd-kit sensor, for the same reason
// `useResizeEdge` uses them: the sensor's activation distance exists so a click
// on a button is not swallowed by a drag, and it is exactly wrong for a gesture
// whose first pixel of movement *is* the gesture. Here it would also swallow the
// press-with-no-movement case, which is half the feature.
//
// One draft at a time, and that is not a simplification: there is one pointer.
//
// Nothing is created until the release, and nothing at all if the day has no
// room. The refusal is the ghost itself (section 8.4) — shown while the user is
// still describing the range, rather than reported as an error afterwards.

/** What a press with no movement books, before any dragging. */
export const DEFAULT_NOTE_DURATION = 30;

/**
 * The range between two minutes on the grid.
 *
 * Dragging upward is the same gesture as dragging down: the earlier of the two
 * is the start. A press that never moved has both the same, and gets the default
 * block rather than a zero-length note.
 *
 * Held inside the day at the bottom (decision 8) — a note may not cross
 * midnight, so a press at 23:30 can only ever be half an hour. `clampStart`
 * already keeps the start itself inside.
 */
export const rangeFor = (pressedAt, releasedAt) => {
    const from = Math.min(pressedAt, releasedAt);
    const to = Math.max(pressedAt, releasedAt);

    const wanted = to === from ? DEFAULT_NOTE_DURATION : to - from;
    const roomLeft = DAY_MINUTES - from;

    return {
        startMinutes: from,
        durationMinutes: Math.max(MIN_DURATION, Math.min(wanted, roomLeft)),
    };
};

/**
 * `geometry` is the live scale — where a pointer is in minutes depends on how
 * tall the window let the column be.
 *
 * `canPlaceAt(dayId, range)` is the live refusal, asked on every frame. The
 * caller answers it from `lib/noteLanes`' `canPlace` against that day's notes.
 *
 * `onCommit({ dayId, startMinutes, durationMinutes })` runs once, on a release
 * the day had room for.
 */
const useNoteDraft = ({ geometry, canPlaceAt, onCommit }) => {
    const [gesture, setGesture] = useState(null);

    /**
     * The minute a client Y coordinate is over, within the plane that was
     * pressed.
     *
     * The plane's own rect rather than the column's: `getBoundingClientRect`
     * already accounts for the column's inner scroll, so no scroll offset is
     * added — the same reasoning `minutesAtRect` records for a drop.
     */
    const minuteAt = useCallback(
        (clientY, planeTop) => clampStart(snapToSlot(geometry.pxToMinutes(clientY - planeTop))),
        [geometry]
    );

    const startDraft = useCallback(
        (dayId, event) => {
            // Only the primary button. A right-click on the plane belongs to the
            // browser, and a middle-click must not leave a draft stuck down.
            if (event.button !== undefined && event.button !== 0) return;

            event.preventDefault();
            event.stopPropagation();

            const planeTop = event.currentTarget.getBoundingClientRect().top;
            const pressedAt = minuteAt(event.clientY, planeTop);

            setGesture({ dayId, planeTop, pressedAt, at: pressedAt });
        },
        [minuteAt]
    );

    useEffect(() => {
        if (!gesture) return undefined;

        const onPointerMove = (event) => {
            const at = minuteAt(event.clientY, gesture.planeTop);

            // Held rather than replaced when the minute has not changed, so a
            // pointer moving within one slot re-renders no ribbons.
            setGesture((current) =>
                current && current.at !== at ? { ...current, at } : current
            );
        };

        const onPointerUp = () => {
            const range = rangeFor(gesture.pressedAt, gesture.at);

            setGesture(null);

            // A release the day has no room for does nothing at all — no
            // request, no message. The ghost already said so.
            if (!canPlaceAt(gesture.dayId, range)) return;

            onCommit({ dayId: gesture.dayId, ...range });
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);

        return () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        };
    }, [gesture, minuteAt, canPlaceAt, onCommit]);

    // Escape abandons a draft, matching what it does to a drag and to a resize.
    useEffect(() => {
        if (!gesture) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') setGesture(null);
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [gesture]);

    const draft = gesture
        ? (() => {
              const range = rangeFor(gesture.pressedAt, gesture.at);

              return {
                  dayId: gesture.dayId,
                  ...range,
                  isAllowed: canPlaceAt(gesture.dayId, range),
              };
          })()
        : null;

    return { draft, startDraft };
};

export default useNoteDraft;
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=useNoteDraft
```

Expected: PASS, 14 tests.

> `MouseEvent` is used for `pointermove`/`pointerup` because jsdom has no
> `PointerEvent` constructor. The listeners only read `clientY`, which
> `MouseEvent` carries.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/hooks/useNoteDraft.js src/client/src/hooks/useNoteDraft.test.js
git commit -m "feat: add the note draft gesture"
```

---

## Task 17: `NotePopover`

**Files:**
- Create: `src/client/src/components/Calendar/NotePopover.js`
- Modify: `src/client/src/components/Styling/Calendar.css`
- Test: `src/client/src/components/Calendar/NotePopover.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/components/Calendar/NotePopover.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NotePopover from './NotePopover';

const draft = { startMinutes: 540, durationMinutes: 60 };

const renderPopover = (props = {}) => {
    const handlers = {
        onSave: jest.fn(),
        onCancel: jest.fn(),
        onDelete: jest.fn(),
    };

    render(<NotePopover range={draft} {...handlers} {...props} />);

    return handlers;
};

describe('NotePopover', () => {
    test('opens focused, so you can just type', () => {
        // Act
        renderPopover();

        // Assert
        expect(screen.getByLabelText('Note')).toHaveFocus();
    });

    test('shows the range the note will cover', () => {
        // Act
        renderPopover();

        // Assert
        expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
    });

    test('saves the typed text', async () => {
        // Arrange
        const { onSave } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        // Assert
        expect(onSave).toHaveBeenCalledWith('on call');
    });

    test('Enter saves without reaching for the button', async () => {
        // Arrange
        const { onSave } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call{Enter}');

        // Assert
        expect(onSave).toHaveBeenCalledWith('on call');
    });

    test('trims what it saves', async () => {
        // Arrange
        const { onSave } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), '  on call  {Enter}');

        // Assert
        expect(onSave).toHaveBeenCalledWith('on call');
    });

    test('saving nothing cancels instead', async () => {
        // Arrange — an empty save creates no note at all (design section 8.2)
        const { onSave, onCancel } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), '   {Enter}');

        // Assert
        expect(onSave).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalled();
    });

    test('Escape cancels', async () => {
        // Arrange
        const { onSave, onCancel } = renderPopover();

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call{Escape}');

        // Assert
        expect(onSave).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalled();
    });

    test('a click outside cancels', async () => {
        // Arrange
        const { onCancel } = renderPopover();

        // Act
        await userEvent.click(document.body);

        // Assert
        expect(onCancel).toHaveBeenCalled();
    });

    test('has no Delete when the note does not exist yet', () => {
        // Act
        renderPopover({ onDelete: null });

        // Assert
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    test('deletes an existing note', async () => {
        // Arrange
        const { onDelete } = renderPopover({ text: 'on call' });

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Assert
        expect(onDelete).toHaveBeenCalled();
    });

    test('starts with the existing text when there is one', () => {
        // Act
        renderPopover({ text: 'kids at home' });

        // Assert
        expect(screen.getByLabelText('Note')).toHaveValue('kids at home');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NotePopover
```

Expected: FAIL — `Cannot find module './NotePopover'`.

- [ ] **Step 3: Write the component**

Create `src/client/src/components/Calendar/NotePopover.js`:

```js
import React, { useEffect, useRef, useState } from 'react';

import { formatTime } from '../../lib/scheduleGeometry';

// Where a note is written, and the only place it can be (design section 8.2).
//
// A ribbon is ~20px wide with its text on its side, so there is nowhere in it to
// put a usable input. The popover is a horizontal field beside the ribbon
// instead — and since it has to exist anyway, it is also where Delete lives,
// which keeps the ribbon free of a hover × it has no room for.
//
// It does double duty: the same surface names a note that does not exist yet and
// renames one that does. `onDelete` is what tells them apart — a note with no
// row behind it has nothing to delete.
//
// An empty save creates nothing. That is what makes a stray press on the plane
// harmless: press, see the field, press Escape or Enter, and the calendar is
// exactly as it was, with no row written and no litter to tidy up.

const NotePopover = ({ range, text = '', onSave, onCancel, onDelete = null, style = null }) => {
    const [value, setValue] = useState(text);
    const inputRef = useRef(null);
    const rootRef = useRef(null);

    // Focused on open so the common case is press-and-type. Selected as well, so
    // renaming an existing note is one gesture rather than a select-all first.
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    // A click anywhere else is a cancel, which is what makes this feel like a
    // popover rather than a dialog. `mousedown` rather than `click`: a press that
    // starts outside must not also land as a press on the plane underneath and
    // begin a second draft.
    useEffect(() => {
        const onPointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) onCancel();
        };

        document.addEventListener('mousedown', onPointerDown);

        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [onCancel]);

    /** Trimmed, and an empty note is a cancel rather than a save of nothing. */
    const save = () => {
        const trimmed = value.trim();

        if (trimmed.length === 0) {
            onCancel();
            return;
        }

        onSave(trimmed);
    };

    const onKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            save();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="note-popover" ref={rootRef} style={style ?? undefined}>
            <span className="note-popover-range">
                {formatTime(range.startMinutes)}–
                {formatTime(range.startMinutes + range.durationMinutes)}
            </span>

            <label className="note-popover-field">
                <span className="note-popover-label">Note</span>
                <input
                    ref={inputRef}
                    type="text"
                    maxLength={500}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={onKeyDown}
                />
            </label>

            <div className="note-popover-actions">
                <button type="button" className="note-popover-save" onClick={save}>
                    Save
                </button>

                {onDelete && (
                    <button type="button" className="note-popover-delete" onClick={onDelete}>
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
};

export default NotePopover;
```

> The `<label>` wraps the input, so `getByLabelText('Note')` finds it through the
> `<span>` text without needing an explicit `htmlFor`/`id` pair.

- [ ] **Step 4: Style it**

Append to the notes section of `src/client/src/components/Styling/Calendar.css`:

```css
/* Floats over the column it belongs to, wide enough for a real sentence — which
 * is the whole reason it exists rather than an input inside the ribbon. */
.note-popover {
    position: absolute;
    /* Positioned against `.day-grid`, so it clears the hour gutter and floats
     * over both planes. `top` is set inline from the note it belongs to. */
    left: var(--cal-gutter-width);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 240px;
    padding: var(--space-sm);
    border: 1px solid var(--border-alt);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-lg);
}

.note-popover-range {
    font-size: var(--font-sm);
    color: var(--text-muted);
}

.note-popover-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
}

.note-popover-label {
    font-size: var(--font-sm);
    color: var(--text-secondary);
}

.note-popover-field input {
    width: 100%;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-alt);
    color: inherit;
    font-size: var(--font-base);
}

.note-popover-actions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
}

.note-popover-save {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    color: var(--text-white);
}

.note-popover-delete {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-danger);
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NotePopover
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/client/src/components/Calendar/NotePopover.js src/client/src/components/Calendar/NotePopover.test.js src/client/src/components/Styling/Calendar.css
git commit -m "feat: add the note popover"
```

---

## Task 18: `NoteLayer` — create, open, delete

The notes plane with its gestures wired. One per day column.

The gestures live here rather than above the strip, which is the opposite of where the booking gestures live — and the reason is decision 8. A booking's bottom edge dragged past midnight spills into the next day, so React unmounts its card mid-gesture and the gesture has to outlive it. **A note cannot leave its day**, so its ribbon never unmounts mid-resize and the gesture is safe one level down. That keeps `CalendarDragArea` from growing a second gesture system.

**Files:**
- Create: `src/client/src/components/Calendar/NoteLayer.js`
- Test: `src/client/src/components/Calendar/NoteLayer.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/client/src/components/Calendar/NoteLayer.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NoteLayer from './NoteLayer';
import { PX_PER_SLOT_MIN, createDayGeometry } from '../../lib/scheduleGeometry';
import { DayScaleProvider } from '../../state/DayScaleContext';

const geometry = createDayGeometry(PX_PER_SLOT_MIN);

const note = (id, overrides = {}) => ({
    id,
    dayId: 1,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const renderLayer = (props = {}) => {
    const handlers = {
        onCreate: jest.fn(),
        onUpdate: jest.fn(),
        onDelete: jest.fn(),
    };

    const view = render(
        <DayScaleProvider value={geometry}>
            <NoteLayer dayId={1} label="Notes for Day 1" notes={[]} {...handlers} {...props} />
        </DayScaleProvider>
    );

    return { ...view, ...handlers };
};

/** jsdom gives every element a zero rect, so the plane's top is 0 throughout. */
const pressPlane = (container, clientY) => {
    const surface = container.querySelector('.note-plane-surface');

    // `pointerdown` is what the surface listens for; jsdom has no PointerEvent.
    const event = new MouseEvent('pointerdown', { bubbles: true, clientY, button: 0 });

    surface.dispatchEvent(event);
};

const releasePointer = () => {
    document.dispatchEvent(new MouseEvent('pointerup', {}));
};

describe('creating a note', () => {
    test('a press opens the popover for a default block', async () => {
        // Arrange
        const { container } = renderLayer();

        // Act
        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
            releasePointer();
        });

        // Assert
        expect(screen.getByLabelText('Note')).toBeInTheDocument();
        expect(screen.getByText('09:00–09:30')).toBeInTheDocument();
    });

    test('saving writes the note', async () => {
        // Arrange
        const { container, onCreate } = renderLayer();

        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
            releasePointer();
        });

        // Act
        await userEvent.type(screen.getByLabelText('Note'), 'on call{Enter}');

        // Assert
        expect(onCreate).toHaveBeenCalledWith({
            dayId: 1,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 30,
        });
    });

    test('cancelling writes nothing and closes', async () => {
        // Arrange
        const { container, onCreate } = renderLayer();

        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
            releasePointer();
        });

        // Act
        await userEvent.type(screen.getByLabelText('Note'), '{Escape}');

        // Assert
        expect(onCreate).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
    });

    test('a press on a full stretch of day opens nothing', async () => {
        // Arrange — four notes already covering 09:00
        const notes = [1, 2, 3, 4].map((id) => note(id));
        const { container, onCreate } = renderLayer({ notes });

        // Act
        await act(async () => {
            pressPlane(container, geometry.minutesToPx(540));
            releasePointer();
        });

        // Assert
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
        expect(onCreate).not.toHaveBeenCalled();
    });
});

describe('opening an existing note', () => {
    test('clicking a ribbon opens it with its text', async () => {
        // Arrange
        renderLayer({ notes: [note(1, { text: 'kids at home' })] });

        // Act
        await userEvent.click(screen.getByRole('button', { name: /kids at home/ }));

        // Assert
        expect(screen.getByLabelText('Note')).toHaveValue('kids at home');
    });

    test('renaming it updates rather than creating', async () => {
        // Arrange
        const { onUpdate, onCreate } = renderLayer({ notes: [note(1)] });
        await userEvent.click(screen.getByRole('button', { name: /note 1/ }));

        // Act
        await userEvent.clear(screen.getByLabelText('Note'));
        await userEvent.type(screen.getByLabelText('Note'), 'renamed{Enter}');

        // Assert
        expect(onUpdate).toHaveBeenCalledWith(1, { text: 'renamed' });
        expect(onCreate).not.toHaveBeenCalled();
    });

    test('deleting it closes the popover', async () => {
        // Arrange
        const { onDelete } = renderLayer({ notes: [note(1)] });
        await userEvent.click(screen.getByRole('button', { name: /note 1/ }));

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Assert
        expect(onDelete).toHaveBeenCalledWith(1);
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
    });

    test('a note that has gone while open closes the popover', async () => {
        // Arrange — a failed save rolls the note away underneath the popover
        const { rerender } = renderLayer({ notes: [note(1)] });
        await userEvent.click(screen.getByRole('button', { name: /note 1/ }));

        // Act
        rerender(
            <DayScaleProvider value={geometry}>
                <NoteLayer
                    dayId={1}
                    label="Notes for Day 1"
                    notes={[]}
                    onCreate={jest.fn()}
                    onUpdate={jest.fn()}
                    onDelete={jest.fn()}
                />
            </DayScaleProvider>
        );

        // Assert
        expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
    });
});
```

Add `act` to the `@testing-library/react` import at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NoteLayer
```

Expected: FAIL — `Cannot find module './NoteLayer'`.

- [ ] **Step 3: Write the component**

Create `src/client/src/components/Calendar/NoteLayer.js`:

```js
import React, { useCallback, useMemo, useState } from 'react';

import NotePlane from './NotePlane';
import NotePopover from './NotePopover';
import NoteRibbon from './NoteRibbon';
import useNoteDraft from '../../hooks/useNoteDraft';
import useResizeEdge, { EDGE } from '../../hooks/useResizeEdge';
import { canPlace } from '../../lib/noteLanes';
import { DAY_MINUTES, MIN_DURATION } from '../../lib/schedule';
import { useDayGeometry } from '../../state/DayScaleContext';

// One day's notes plane with all of its gestures wired: press to create, click
// to open, drag an edge to resize, Delete in the popover.
//
// WHY THE GESTURES LIVE HERE and not above the strip, which is where the booking
// gestures had to go. A booking's bottom edge dragged past midnight spills into
// the next day, so React unmounts its card mid-drag and the gesture would die
// with it — `useResizeEdge`'s header records that at length. A note cannot leave
// its day (decision 8), so its ribbon is never unmounted by its own resize, and
// the gesture is safe one level down. That is worth taking: it keeps
// `CalendarDragArea` from growing a second gesture system beside the one it has.
//
// The popover is the one piece of state that is genuinely this layer's. Which
// note is open is a property of this column — clicking a ribbon in another one
// opens that column's popover and this one's outside-click closes ours.

/** A note being written but not yet saved: the range, and no row behind it. */
const NEW_NOTE = 'new';

const NoteLayer = ({
    dayId,
    label,
    notes,
    onCreate,
    onUpdate,
    onDelete,
    droppable = null,
    isDraggable = false,
}) => {
    const geometry = useDayGeometry();

    // Either `{ kind: NEW_NOTE, range }` or `{ kind: 'existing', note }`.
    const [open, setOpen] = useState(null);

    const close = useCallback(() => setOpen(null), []);

    /**
     * Whether this day has a free lane for a range — the live refusal behind both
     * the draft ghost and the resize preview.
     *
     * `id` is passed through so a note being resized is tested against its
     * siblings rather than against the row it is about to replace; a draft has no
     * id and is tested against everything.
     */
    const canPlaceAt = useCallback(
        (unusedDayId, range) => canPlace(notes, range),
        [notes]
    );

    const commitDraft = useCallback(
        (range) => setOpen({ kind: NEW_NOTE, range }),
        []
    );

    const { draft, startDraft } = useNoteDraft({
        geometry,
        canPlaceAt,
        onCommit: commitDraft,
    });

    const surfaceProps = useMemo(
        () => ({ onPointerDown: (event) => startDraft(dayId, event) }),
        [dayId, startDraft]
    );

    // ─── Resizing ──────────────────────────────────────────────────────────

    const [preview, setPreview] = useState(null);

    /**
     * What a pressed edge may do. Both edges resolve with a floor of 0: notes may
     * overlap, so a note's top edge has nothing above it to clamp against — the
     * asymmetry a booking has does not exist here.
     */
    const resolveEdge = useCallback(
        (noteId) => {
            const note = notes.find((other) => other.id === noteId);
            if (!note) return null;

            // `useResizeEdge` works on `{ startMinutes, durationMinutes }` and
            // keys its callbacks by whatever id it was handed, so a note is the
            // same shape to it as a booking.
            return { item: note, floor: 0 };
        },
        [notes]
    );

    /**
     * Holds a resized note inside its day (decision 8).
     *
     * `useResizeEdge` bounds a duration to at most a whole day but deliberately
     * does not stop it running past midnight — for a booking, overrunning is the
     * input to the spill. Notes have no spill, so the clamp belongs here, on the
     * one caller that needs it, rather than as a flag on the shared hook.
     *
     * Clamped rather than refused, because the gesture is unambiguous: dragging
     * the bottom edge downward at 23:00 plainly means "as long as it can be".
     */
    const holdInsideDay = useCallback(
        (rect) => ({
            startMinutes: rect.startMinutes,
            durationMinutes: Math.max(
                MIN_DURATION,
                Math.min(rect.durationMinutes, DAY_MINUTES - rect.startMinutes)
            ),
        }),
        []
    );

    const handlePreview = useCallback(
        (noteId, rect) => {
            const held = holdInsideDay(rect);

            // A refused preview is still drawn, in the refused style, so the
            // user sees the limit while the pointer is still down (section 8.4).
            setPreview({
                noteId,
                ...held,
                isAllowed: canPlace(notes, { id: noteId, ...held }),
            });
        },
        [holdInsideDay, notes]
    );

    const handleCommit = useCallback(
        (noteId, rect) => {
            const held = holdInsideDay(rect);

            setPreview(null);

            if (!canPlace(notes, { id: noteId, ...held })) return;

            onUpdate(noteId, held);
        },
        [holdInsideDay, notes, onUpdate]
    );

    const handleCancel = useCallback(() => setPreview(null), []);

    const { startResize } = useResizeEdge({
        geometry,
        resolve: resolveEdge,
        onPreview: handlePreview,
        onCommit: handleCommit,
        onCancel: handleCancel,
    });

    // The notes as they would be if the resize in flight were released. Drawn
    // instead of the real ones, so the ghost is the same arithmetic the save will
    // use rather than a separate "what it would look like".
    const shown = useMemo(() => {
        if (!preview) return notes;

        return notes.map((note) =>
            note.id === preview.noteId
                ? {
                      ...note,
                      startMinutes: preview.startMinutes,
                      durationMinutes: preview.durationMinutes,
                  }
                : note
        );
    }, [notes, preview]);

    // ─── The popover ───────────────────────────────────────────────────────

    // A note open when its row goes — a failed save rolled it away, or a resync
    // answered — has nothing left to edit, so the popover closes rather than
    // saving into a hole.
    const openNote =
        open?.kind === NEW_NOTE
            ? null
            : notes.find((note) => note.id === open?.note.id) ?? null;

    const isPopoverOpen = open?.kind === NEW_NOTE || openNote !== null;

    const popoverRange = open?.kind === NEW_NOTE ? open.range : openNote;

    const save = useCallback(
        (text) => {
            if (open?.kind === NEW_NOTE) onCreate({ dayId, text, ...open.range });
            else onUpdate(openNote.id, { text });

            close();
        },
        [close, dayId, onCreate, onUpdate, open, openNote]
    );

    const remove = useCallback(() => {
        onDelete(openNote.id);
        close();
    }, [close, onDelete, openNote]);

    const openExisting = useCallback(
        (noteId) => {
            const note = notes.find((other) => other.id === noteId);

            if (note) setOpen({ kind: 'existing', note });
        },
        [notes]
    );

    return (
        <>
            <NotePlane
                dayId={dayId}
                label={label}
                notes={shown}
                droppable={droppable}
                draft={draft}
                surfaceProps={surfaceProps}
                ribbonFor={(note, lane) => (
                    <NoteRibbon
                        key={note.id}
                        note={note}
                        lane={lane}
                        onOpen={openExisting}
                        isDraggable={isDraggable}
                        resize={{
                            top: {
                                handleProps: {
                                    onPointerDown: (event) =>
                                        startResize(note.id, EDGE.top, event),
                                },
                            },
                            bottom: {
                                handleProps: {
                                    onPointerDown: (event) =>
                                        startResize(note.id, EDGE.bottom, event),
                                },
                            },
                        }}
                    />
                )}
            />

            {isPopoverOpen && (
                <NotePopover
                    range={popoverRange}
                    text={openNote?.text ?? ''}
                    onSave={save}
                    onCancel={close}
                    onDelete={openNote ? remove : null}
                    style={{ top: `${geometry.minutesToPx(popoverRange.startMinutes)}px` }}
                />
            )}
        </>
    );
};

export default NoteLayer;
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=NoteLayer
```

Expected: PASS, 8 tests.

> If the popover never appears, check that `NotePlane`'s surface is receiving
> `onPointerDown` through `surfaceProps` — the press listener is on the surface,
> not on the plane.

- [ ] **Step 5: Commit**

```bash
git add src/client/src/components/Calendar/NoteLayer.js src/client/src/components/Calendar/NoteLayer.test.js
git commit -m "feat: wire creating, opening and deleting notes"
```

---

## Task 19: Notes on the page

Connects everything to `CalendarPage` and `CalendarDragArea`. At the end of this task notes work end to end apart from dragging between days.

**Files:**
- Modify: `src/client/src/components/Calendar/CalendarPage.js`
- Modify: `src/client/src/components/Calendar/CalendarDragArea.js`
- Modify: `src/client/src/hooks/useCalendar.js`
- Test: `src/client/src/components/Calendar/CalendarPage.test.js`
- Test: `src/client/src/hooks/useCalendar.test.js`

- [ ] **Step 1: Write the failing test for the day-deletion hook**

Append to `src/client/src/hooks/useCalendar.test.js`, following the file's existing setup:

```js
describe('onDayDeleted', () => {
    test('is called after a deletion the server took', async () => {
        // Arrange
        const onDayDeleted = jest.fn();
        const { result } = await renderReady({ onDayDeleted });
        api.delete.mockResolvedValue({ id: 1 });

        // Act
        await act(() => result.current.deleteDay(1));

        // Assert
        expect(onDayDeleted).toHaveBeenCalledWith(1);
    });

    test('is not called when the deletion failed', async () => {
        // Arrange — a rolled-back deletion put the day back, notes and all
        const onDayDeleted = jest.fn();
        const { result } = await renderReady({ onDayDeleted });
        api.delete.mockRejectedValue(new Error('nope'));

        // Act
        await act(() => result.current.deleteDay(1));

        // Assert
        expect(onDayDeleted).not.toHaveBeenCalled();
    });
});
```

Adjust `renderReady` in that file to forward options into `useCalendar` if it does not already.

- [ ] **Step 2: Add the callback to `useCalendar`**

In `src/client/src/hooks/useCalendar.js`, change the signature and `deleteDay`:

```js
const useCalendar = ({ onTodoCompleted = null, onDayDeleted = null } = {}) => {
```

```js
    /**
     * Deletes a day. Its bookings are released rather than pushed forward — the
     * container goes, the work does not (design decision 6) — and the to-dos
     * behind them reappear in the pool.
     *
     * Its notes go with it and do not come back. That is the schema's
     * `ON DELETE CASCADE` rather than anything here (design 2026-09-16, decision
     * 9); `onDayDeleted` only lets the notes plane drop rows the server has
     * already destroyed. On success only — a rolled-back deletion put the day
     * back, and its notes are still in the notes hook's state ready to be drawn
     * again.
     */
    const deleteDay = useCallback(
        async (dayId) => {
            const didDelete = await mutate({
                apply: (previous) => removeDay(previous, dayId),
                send: () => api.delete(`/calendar/days/${dayId}`),
            });

            if (didDelete) onDayDeleted?.(dayId);

            return didDelete;
        },
        [mutate, onDayDeleted]
    );
```

- [ ] **Step 3: Write the failing page test**

Append to `src/client/src/components/Calendar/CalendarPage.test.js`, matching the file's existing mocking of `api`:

```js
describe('notes on the page', () => {
    test('draws the notes it loaded into their day', async () => {
        // Arrange
        mockCalendar({ days: [day(1)], items: [] });
        mockNotes([{ id: 5, dayId: 1, text: 'on call', startMinutes: 540, durationMinutes: 60 }]);

        // Act
        render(<CalendarPage />);

        // Assert
        expect(await screen.findByText('on call')).toBeInTheDocument();
    });

    test('reports a failed notes load without losing the calendar', async () => {
        // Arrange
        mockCalendar({ days: [day(1)], items: [] });
        mockNotesFailure('the server is down');

        // Act
        render(<CalendarPage />);

        // Assert — the day is still there, and the notice says what failed
        expect(await screen.findByRole('region', { name: 'Day 1' })).toBeInTheDocument();
        expect(screen.getByText(/the server is down/)).toBeInTheDocument();
    });

    test('shows a note write failure in the page toast', async () => {
        // Arrange
        mockCalendar({ days: [day(1)], items: [] });
        mockNotes([{ id: 5, dayId: 1, text: 'on call', startMinutes: 540, durationMinutes: 60 }]);
        api.delete.mockRejectedValue(new Error('could not delete that note'));

        render(<CalendarPage />);
        await userEvent.click(await screen.findByRole('button', { name: /on call/ }));

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Assert
        expect(await screen.findByText('could not delete that note')).toBeInTheDocument();
    });
});
```

The page now makes three `GET`s, so `api.get` has to answer by path rather than
with one blanket `mockResolvedValue`. Add these helpers near the file's existing
ones and call `routeGet()` in its `beforeEach`:

```js
/**
 * `api.get` answers by path. The page loads the calendar, the pool and the notes
 * independently, and each test wants to set them — or fail them — separately.
 */
let calendarAnswer = { days: [], items: [] };
let poolAnswer = [];
let notesAnswer = { notes: [] };
let notesError = null;

const routeGet = () => {
    api.get.mockImplementation((path) => {
        if (path === '/calendar/notes') {
            return notesError ? Promise.reject(new Error(notesError)) : Promise.resolve(notesAnswer);
        }

        if (path === '/calendar') return Promise.resolve(calendarAnswer);

        return Promise.resolve(poolAnswer);
    });
};

const mockCalendar = (calendar) => {
    calendarAnswer = calendar;
};

const mockNotes = (notes) => {
    notesAnswer = { notes };
    notesError = null;
};

const mockNotesFailure = (message) => {
    notesError = message;
};

/** One day, in the shape `GET /api/calendar` answers with. */
const day = (id) => ({ id, position: id - 1, createdAt: '2026-09-16T08:00:00.000Z' });
```

Reset the four module-level answers in `beforeEach` alongside `routeGet()`, so
one test's failure does not leak into the next:

```js
beforeEach(() => {
    jest.clearAllMocks();
    calendarAnswer = { days: [], items: [] };
    poolAnswer = [];
    notesAnswer = { notes: [] };
    notesError = null;
    routeGet();
});
```

Any existing `api.get.mockResolvedValue(...)` calls in this file must be replaced
with the matching helper, or they will override `routeGet` and answer every path
with the same body.

- [ ] **Step 4: Wire the page**

In `src/client/src/components/Calendar/CalendarPage.js`:

```js
import useCalendarNotes from '../../hooks/useCalendarNotes';
```

```js
    const pool = usePool();
    const notes = useCalendarNotes();
    const calendar = useCalendar({
        onTodoCompleted: pool.refresh,
        // The server has already destroyed them through the schema's cascade
        // (design 2026-09-16, decision 9); this only drops the rows this tab is
        // still holding. On success only, so a rolled-back deletion brings the
        // column back with its notes intact.
        onDayDeleted: notes.pruneDay,
    });
```

Replace the toast's contents so it carries whichever plane raised something:

```js
    // One alert region for three hooks. Two live regions stacked above the strip
    // would be noise on a page that raises an error roughly never, and the
    // calendar's own message is the more urgent of the two when both are set.
    const actionError = state.actionError ?? notes.state.actionError;

    const dismissError = useCallback(() => {
        if (state.actionError) dismissActionError();
        else notes.dismissActionError();
    }, [dismissActionError, notes, state.actionError]);
```

and use `actionError` / `dismissError` in the existing toast markup in place of `state.actionError` / `dismissActionError`.

Pass `notes` into `CalendarDragArea`:

```jsx
                    <CalendarDragArea
                        pool={pool}
                        notes={notes}
                        onOpenSource={openSource}
                        expandedProjectIds={expandedProjectIds}
                        onToggleProject={toggleProject}
                    />
```

- [ ] **Step 5: Wire the drag area**

In `src/client/src/components/Calendar/CalendarDragArea.js`:

```js
import NoteLayer from './NoteLayer';
```

Take `notes` in the props, and hand a layer to every column through `DayColumn`'s `notePlane`. In `DroppableDayColumn`, add a `notes` prop and:

```jsx
        <DayColumn
            day={day}
            index={index}
            items={items}
            onOpenSource={onOpenSource}
            droppable={droppable}
            notePlane={
                <NoteLayer
                    dayId={day.id}
                    label={`Notes for Day ${index + 1}`}
                    notes={notes.notesForDay(day.id)}
                    onCreate={notes.createNote}
                    onUpdate={notes.updateNote}
                    onDelete={notes.deleteNote}
                />
            }
            cardFor={...}
        />
```

and pass `notes={notes}` down from `columnFor`.

Add the failed-load notice beside the strip, inside `.calendar-body`:

```jsx
                {/* A failed notes read sits above the strip rather than replacing
                    it: the days and their bookings are fine, and only the context
                    is missing. The same shape `pool-notice` already has. */}
                <div className="notes-notice" role="alert" hidden={!notes.state.loadError}>
                    <p>{notes.state.loadError}</p>
                    <button type="button" onClick={notes.reload}>
                        Try again
                    </button>
                </div>
```

- [ ] **Step 6: Style the notice**

```css
/* Same tie-break as `.calendar-toast[hidden]`: an author rule beats a user-agent
 * rule at equal specificity, so without the `[hidden]` rule this paints empty. */
.notes-notice {
    position: absolute;
    top: var(--space-sm);
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--color-danger);
    font-size: var(--font-sm);
}

.notes-notice[hidden] {
    display: none;
}

.notes-notice p {
    margin: 0;
}
```

`.calendar-body` needs `position: relative` for that to pin to it — add it to the existing rule.

- [ ] **Step 7: Run the whole client suite**

```bash
npm run test:client
```

Expected: PASS.

- [ ] **Step 8: Use it**

```bash
npm run dev
```

At `/calendar`: press an empty spot in the left half of a column — a popover opens, type a name, press Enter, a ribbon appears. Press and drag across two hours — the ghost follows, and the popover reports that range. Click a ribbon to rename it. Delete it. Drag a ribbon's bottom edge to lengthen it. Create four overlapping notes and check that a press inside the fifth's span shows a red ghost and creates nothing on release. Delete a day that has notes — it goes with no mention of them.

- [ ] **Step 9: Commit**

```bash
git add src/client/src/components/Calendar/ src/client/src/hooks/useCalendar.js src/client/src/components/Styling/Calendar.css
git commit -m "feat: put notes on the calendar page"
```

---

## Task 20: Dragging a note into another day

**Files:**
- Modify: `src/client/src/components/Calendar/CalendarDragArea.js`
- Test: `src/client/src/components/Calendar/CalendarDragArea.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/client/src/components/Calendar/CalendarDragArea.test.js`:

```js
describe('dragKindOf', () => {
    test('reads a note drag', () => {
        // Act & Assert
        expect(dragKindOf({ noteId: 5 })).toBe(DRAG_KIND.note);
    });

    test('still tells a pool row from a booking', () => {
        // Act & Assert
        expect(dragKindOf({ poolTodo: { todoId: 1 } })).toBe(DRAG_KIND.pool);
        expect(dragKindOf({ bookingTodoId: 1 })).toBe(DRAG_KIND.booking);
    });

    test('is null for a drag it does not recognise', () => {
        // Act & Assert
        expect(dragKindOf({})).toBeNull();
    });
});

describe('noteMoveFor', () => {
    const note = { id: 5, dayId: 1, text: 'on call', startMinutes: 540, durationMinutes: 60 };

    test('names the day and the minute the ribbon landed on', () => {
        // Act
        const move = noteMoveFor(note, { dayId: 2, startMinutes: 600 });

        // Assert
        expect(move).toEqual({ dayId: 2, startMinutes: 600 });
    });

    test('is null when nothing would change', () => {
        // Arrange — dropped exactly where it started; no request is worth sending
        // Act & Assert
        expect(noteMoveFor(note, { dayId: 1, startMinutes: 540 })).toBeNull();
    });

    test('is null when the note would run past midnight', () => {
        // Act & Assert
        expect(noteMoveFor(note, { dayId: 1, startMinutes: 1410 })).toBeNull();
    });
});
```

Add `noteMoveFor` to the file's import from `./CalendarDragArea`.

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true npm test --prefix src/client -- --testPathPattern=CalendarDragArea
```

Expected: FAIL — `DRAG_KIND.note` is undefined and `noteMoveFor` is not exported.

- [ ] **Step 3: Teach the drag area about notes**

In `src/client/src/components/Calendar/CalendarDragArea.js`:

Extend the kinds and the reader:

```js
export const DRAG_KIND = { pool: 'pool', booking: 'booking', note: 'note' };

/** What was lifted, read off the data the draggable carries. */
export const dragKindOf = (activeData) => {
    if (activeData?.poolTodo !== undefined) return DRAG_KIND.pool;
    if (activeData?.bookingTodoId !== undefined) return DRAG_KIND.booking;
    if (activeData?.noteId !== undefined) return DRAG_KIND.note;

    return null;
};
```

Add the move helper beside `previewFor`:

```js
/**
 * What moving a note to a drop target would change, or null when it would change
 * nothing legal.
 *
 * Deliberately not a preview. A booking's drop is previewed because it cascades
 * — half a day moves with it, and the only way to show that truthfully is to
 * compute the whole settled schedule. A note moves alone (decision 1), so the
 * dnd overlay under the pointer is already an honest picture of the result and
 * there is nothing else to draw.
 *
 * A drop that would push the note past midnight is refused rather than clamped.
 * Clamping would silently save a different note from the one the gesture
 * described, and a note at 23:00 dropped where it cannot fit is a miss, not a
 * request to shorten it.
 */
export const noteMoveFor = (note, target) => {
    if (!target) return null;

    const { dayId, startMinutes } = target;

    if (dayId === note.dayId && startMinutes === note.startMinutes) return null;
    if (startMinutes + note.durationMinutes > DAY_MINUTES) return null;

    return { dayId, startMinutes };
};
```

Add `DAY_MINUTES` to the import from `../../lib/schedule`.

Add a droppable for the notes plane, beside `useDayDroppable`:

```js
/**
 * The notes plane's droppable.
 *
 * A second target per column rather than one shared with the bookings, because
 * the two planes must not catch each other's drags: a to-do released over the
 * notes half would otherwise book itself, and a note released over the to-do
 * half would jump the boundary. Each is disabled while the other kind is in the
 * air, which is also what stops `pointerWithin` having to choose between two
 * overlapping targets.
 */
const useNoteDroppable = (dayId, registerPlane, isDisabled) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `notes-${dayId}`,
        disabled: isDisabled,
        data: { noteDropTarget: { dayId } },
    });

    const ref = useCallback(
        (node) => {
            setNodeRef(node);
            registerPlane(dayId, node);
        },
        [dayId, setNodeRef, registerPlane]
    );

    return {
        setNodeRef: ref,
        className: `note-plane-drop${isOver ? ' note-plane-drop--over' : ''}`,
    };
};
```

In the component, add a second registry and a target reader:

```js
    // dayId → the notes plane element, for measuring a note drop.
    const planesRef = useRef(new Map());

    const registerPlane = useCallback((dayId, node) => {
        if (node) planesRef.current.set(dayId, node);
        else planesRef.current.delete(dayId);
    }, []);

    /** Where a note drag would land, or null when it is over no plane. */
    const noteTargetFrom = useCallback(
        (event) => {
            const dropTarget = event.over?.data.current?.noteDropTarget ?? null;
            if (!dropTarget) return null;

            const plane = planesRef.current.get(dropTarget.dayId);
            const activeRect = event.active.rect.current.translated;

            if (!plane || !activeRect) return null;

            return {
                dayId: dropTarget.dayId,
                startMinutes: minutesAtRect(
                    geometry,
                    activeRect,
                    plane.getBoundingClientRect()
                ),
            };
        },
        [geometry]
    );
```

In `handleDragEnd`, branch on the kind before the booking logic:

```js
            if (dragKindOf(data) === DRAG_KIND.note) {
                const note = notes.state.notes.find((other) => other.id === data.noteId);
                const move = note && noteMoveFor(note, noteTargetFrom(event));

                // A drop over nothing, back where it started, or somewhere it
                // will not fit: the gesture simply ends. Not a failure, so
                // nothing is said.
                if (move) notes.updateNote(note.id, move);

                return;
            }
```

Add `notes` and `noteTargetFrom` to that callback's dependency array.

Make the two planes exclusive. In `DroppableDayColumn`, pass down the active kind and compute both:

```js
    const isNoteDrag = activeKind === DRAG_KIND.note;

    const droppable = useDayDroppable(day.id, registerGrid, isDropDisabled || isNoteDrag);
    const noteDroppable = useNoteDroppable(day.id, registerPlane, isDropDisabled || !isNoteDrag);
```

and hand `noteDroppable` to the `NoteLayer` as its `droppable`, with `isDraggable`:

```jsx
            notePlane={
                <NoteLayer
                    dayId={day.id}
                    label={`Notes for Day ${index + 1}`}
                    notes={notes.notesForDay(day.id)}
                    onCreate={notes.createNote}
                    onUpdate={notes.updateNote}
                    onDelete={notes.deleteNote}
                    droppable={noteDroppable}
                    isDraggable
                />
            }
```

Pass `activeKind={active?.kind ?? null}` and `registerPlane={registerPlane}` from `columnFor`.

Finally, give the overlay a label for a note. In `labelOf`:

```js
const labelOf = (active) => {
    if (active.kind === DRAG_KIND.pool) return active.data.poolTodo.text;
    if (active.kind === DRAG_KIND.note) return 'Moving note…';

    return 'Moving…';
};
```

- [ ] **Step 4: Style the drop feedback**

```css
/* The whole plane tints, like a day column does for a booking — it says "this
 * day's notes" without pretending to know the minute or the lane. */
.note-plane-drop--over {
    background: var(--color-warning-light);
}
```

- [ ] **Step 5: Run the client suite**

```bash
npm run test:client
```

Expected: PASS.

- [ ] **Step 6: Try it**

```bash
npm run dev
```

Drag a ribbon into the next day's notes half — it lands at the minute you aimed at. Drag a booking over the notes half — nothing happens; it does not book there. Drag a note over the to-do half — nothing happens.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/components/Calendar/ src/client/src/components/Styling/Calendar.css
git commit -m "feat: drag notes between days"
```

---

## Task 21: End to end, and the README

**Files:**
- Modify: `tests/e2e/calendar.spec.js`
- Modify: `README.md`

- [ ] **Step 1: Read the existing E2E helpers**

```bash
sed -n '1,60p' tests/e2e/calendar.spec.js && cat tests/e2e/helpers.js
```

Match whatever that file already does for signing in and seeding a day — do not invent a second way.

- [ ] **Step 2: Add the note journeys**

Append to `tests/e2e/calendar.spec.js`, adapting the setup helpers to the ones the file already defines:

```js
test.describe('calendar notes', () => {
    test('a press on the notes plane creates a note', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        const plane = page.locator('.note-plane-surface').first();

        // Act — press and release without moving: a default 30-minute block
        const box = await plane.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();
        await page.mouse.up();

        await page.getByLabel('Note').fill('train to Leeds');
        await page.getByRole('button', { name: 'Save' }).click();

        // Assert
        await expect(page.getByText('train to Leeds')).toBeVisible();
    });

    test('a press and drag covers the range it was dragged over', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        const plane = page.locator('.note-plane-surface').first();
        const box = await plane.boundingBox();

        // Act
        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 400, { steps: 10 });
        await page.mouse.up();

        // Assert — the popover reports a range longer than the default block
        await expect(page.locator('.note-popover-range')).not.toHaveText(/:00–.*:30$/);

        await page.getByLabel('Note').fill('deep work');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText('deep work')).toBeVisible();
    });

    test('a note survives a reload', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        await createNote(page, 'on call');

        // Act
        await page.reload();

        // Assert
        await expect(page.getByText('on call')).toBeVisible();
    });

    test('a note can be renamed and deleted', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        await createNote(page, 'on call');

        // Act — rename
        await page.getByRole('button', { name: /on call/ }).click();
        await page.getByLabel('Note').fill('on call (swapped)');
        await page.getByRole('button', { name: 'Save' }).click();

        // Assert
        await expect(page.getByText('on call (swapped)')).toBeVisible();

        // Act — delete
        await page.getByRole('button', { name: /on call \(swapped\)/ }).click();
        await page.getByRole('button', { name: 'Delete' }).click();

        // Assert
        await expect(page.getByText('on call (swapped)')).toHaveCount(0);
    });

    test('deleting a day takes its notes with no prompt about them', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });
        await createNote(page, 'context');

        // Act
        await page.getByRole('button', { name: 'Delete Day 1' }).click();

        // Assert — an empty day deletes outright; no dialog mentions notes
        await expect(page.getByText('context')).toHaveCount(0);
        await expect(page.getByText(/note/i)).toHaveCount(0);
    });

    test('the fifth overlapping note is refused', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 1 });

        for (const name of ['one', 'two', 'three', 'four']) {
            // eslint-disable-next-line no-await-in-loop
            await createNote(page, name);
        }

        // Act — a fifth press over the same minute
        const plane = page.locator('.note-plane-surface').first();
        const box = await plane.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();

        // Assert — refused while the pointer is still down
        await expect(page.locator('.note-draft--refused')).toBeVisible();

        await page.mouse.up();
        await expect(page.getByLabel('Note')).toHaveCount(0);
    });

    test('two days fit and the third scrolls', async ({ page }) => {
        // Arrange
        await signInWithCalendar(page, { days: 3 });
        const strip = page.locator('.calendar-strip');

        // Assert — there is more strip than there is room for it
        const overflow = await strip.evaluate(
            (node) => node.scrollWidth > node.clientWidth + 1
        );
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
```

Add a `createNote` helper near the file's other helpers:

```js
/** Presses the notes plane, names the note, and saves it. */
const createNote = async (page, text) => {
    const plane = page.locator('.note-plane-surface').first();
    const box = await plane.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.up();

    await page.getByLabel('Note').fill(text);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(text)).toBeVisible();
};
```

- [ ] **Step 3: Run the E2E suite**

```bash
npm run test:e2e
```

Expected: PASS. The `planapp_test` database must have `calendar_notes` — Task 1 applied it.

- [ ] **Step 4: Update the README**

In `README.md`, replace the Calendar bullet with:

```markdown
- **Calendar** — a strip of 24-hour day columns beside a pool of every project's
  startable to-dos. Each column is split in two: to-dos on the right, where a
  booking can be dragged in from the pool, moved between days, resized by either
  edge, and dropped back on the pool to unschedule it; and **notes** on the left,
  free-floating blocks of context that never move the work. Click a time to add a
  30-minute note or drag across a range to fit one, up to four overlapping at
  once. Columns fill the page and are sized so two days read comfortably side by
  side, with a third reachable by scrolling.
```

- [ ] **Step 5: Run everything**

```bash
DB_NAME=planapp_test npm run test:all
```

Expected: PASS across the server, client and E2E suites.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/calendar.spec.js README.md
git commit -m "test: cover calendar notes end to end"
```

---

## Done

Check each against the spec before opening a PR:

- [ ] A press on the notes plane makes a 30-minute note; a drag makes the range dragged, either direction (§8.2)
- [ ] Escape, or an empty save, creates nothing at all (§8.2)
- [ ] Notes overlap without moving each other, and never move a booking (decisions 1, 2)
- [ ] Ribbons read bottom-to-top, centred (decision 3)
- [ ] Lanes fill right to left from the to-do boundary (decision 6)
- [ ] The fifth overlapping note is refused live, with no toast, and the server refuses it too (decision 4, §8.4)
- [ ] A note can be moved within a day, dragged into another day, resized from either edge, and deleted from the popover (§8.3)
- [ ] A note cannot cross midnight (decision 8)
- [ ] Deleting a day deletes its notes and says nothing about them (decision 9)
- [ ] Columns run to the bottom of the page; a taller window shows more hours before it stretches the scale (decision 10)
- [ ] Exactly two days fill the strip; the third scrolls (decision 11)
- [ ] `lib/schedule.js`, `lib/calendarRequest.js` and `PUT /calendar/items` are untouched by every commit in this branch:

```bash
git diff main --stat -- src/client/src/lib/schedule.js src/client/src/lib/calendarRequest.js src/routes/calendar.js
```

Expected: no output. If `routes/calendar.js` shows a change, check it is not the bulk endpoint.
