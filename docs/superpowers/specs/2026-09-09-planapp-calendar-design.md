# PlanApp — Calendar Page Design Spec

**Date:** 2026-09-09
**Status:** Approved, ready for implementation planning
**Extends:** `2026-08-27-planapp-design.md`, `2026-09-07-planapp-ui-changes-design.md`

---

## 1. Purpose

A new page, `/calendar`, where the work a project says is startable becomes work
with a time on it.

The project page answers "what can I do next"; it has no opinion about *when*.
The calendar is the other half: a pool of startable to-dos on the right, a strip
of days on the left, and a drag between them. Nothing here changes what a to-do
or a sequence means — the calendar only books them.

This is the first pass. It is deliberately small in scope (section 11), because
the interaction at its centre — a resize that shoves a whole stack down and over
a midnight boundary — is the part worth getting right before anything is built
on top of it.

| # | Concern | Section |
|---|---------|---------|
| 1 | Data model | 4 |
| 2 | API | 5 |
| 3 | The cascade | 6 |
| 4 | Client structure | 7 |
| 5 | Interactions | 8 |
| 6 | Geometry and rendering | 9 |
| 7 | Error handling | 10 |
| 8 | Scope boundaries | 11 |
| 9 | Testing | 12 |
| 10 | Build order | 13 |

## 2. Vocabulary

- **Day** — an ordered container spanning a full 24 hours, 00:00 to 24:00. It is
  *not* a calendar date (section 3, decision 2).
- **Item** — one booking: a to-do placed in a day at a start time for a duration.
- **Pool** — the right panel's supply of schedulable to-dos, grouped by project.
- **Anchor** — the item a gesture is directly acting on. Everything the cascade
  does, it does to the items below the anchor.
- **Settle** — resolve one day's items so none overlaps, pushing downward only.
- **Spill** — move the items a settle pushed past 24:00 into the next day.

## 3. Decisions

Recorded because each was a real fork, and the reasoning is worth more later than
the answer.

1. **The calendar is server-backed, not browser-local.** Two new tables and a
   route, following every convention the rest of the app already uses. A
   localStorage calendar would be free to build and would lose a day's planning
   on a different machine.

2. **A day is an ordered container, not a date.** "+" appends the next one, the
   way a sequence is appended to a layer; its header carries its creation
   timestamp. This avoids date pickers, gaps in the sequence, past days, and
   timezones — none of which the first pass needs. A day still spans a real
   24-hour clock *internally*, so an item can read "09:00–10:00"; what it lacks
   is a date to hang that clock on.

3. **The pool is each ready sequence's next step, not every open to-do in it.**
   One to-do per frontier sequence — exactly what `GET /api/projects` already
   returns. This keeps the calendar honest to the app's central idea: the
   frontier is what you may start, and within a sequence that is one thing. It
   also means the pool refills as you tick items off, which makes the completion
   bubble part of the planning loop rather than a dead end.

4. **A scheduled to-do stays listed in the pool, but is inert.** It is shown
   dimmed with the day it went to, so the panel remains a complete answer to
   "where did this go". It cannot be dragged a second time: the booking is moved
   by grabbing it in the day, which keeps exactly one gesture per outcome.

5. **The collapsed card's count is unscheduled work only.** It measures planning
   progress — how much startable work is still unbooked — and ticks down as days
   fill. A count that included scheduled items would be stable and useless.

6. **Deleting a day unschedules its items; it does not push them forward.** The
   same spirit as deleting a sequence returning its to-dos to the unorganized
   panel: the container goes, the work does not. Pushing a full day's contents
   into the next one would reshuffle the entire tail of a plan as a side effect
   of a delete.

7. **The push is downward-only and destructive.** Growing an item rewrites the
   stored starts of the items below it. Shrinking it again leaves the gap rather
   than pulling the stack back up, and nothing above the anchor ever moves. The
   alternative — storing a "desired" start per item and recomputing — makes
   shrinking feel magical at the cost of a second, invisible copy of every
   position. What is drawn is what is stored.

8. **The cascade lives on the client; the server validates the result.** The
   arithmetic has to run on every pointer move to draw the ghost, so it must be
   local. Duplicating it server-side would mean two implementations of the most
   intricate logic in the feature — the drift `lib/frontier.js` warns about in
   its own mirror comment, over several times as much code. The server instead
   refuses any layout that is not well-formed (section 5), which is what actually
   protects the data.

9. **Days are side-by-side columns, each scrolling its own 24 hours.** Stacking
   full-height days vertically, like layers, would put ~1150px between one day
   and the next — unworkable when the overflow rule constantly moves work across
   that boundary. Columns keep adjacent days adjacent.

10. **Overflow is silent.** A spill that creates a day simply shows the new
    column. This is the one place the app does not report a cascade it performed
    on its own (contrast the sequence-move notice, 2026-09-07 spec decision 2),
    because a spill is visible in a way a dropped edge is not: the item is right
    there, in the next column.

## 4. Data model

Two tables. Both are owned by the user rather than by a project — the calendar's
whole point is that it draws from every project at once.

```sql
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

`position` is dense 0..n-1, left to right, like `layers.position`.

Three things are load-bearing here:

- **`uq_calendar_items_todo`** makes "a to-do is booked at most once" a database
  fact rather than a client convention. Decision 4 rests on it entirely.
- **`fk_calendar_items_day ... ON DELETE CASCADE`** is how decision 6 is
  implemented: deleting a day drops its bookings and touches no to-do.
- **`fk_calendar_items_todo ... ON DELETE CASCADE`** means deleting a to-do on
  the project page unschedules it here, with no cross-page bookkeeping.

Times are integer minutes from midnight, never strings. `start_minutes` is
0..1410 and `duration_minutes` is 30..1440, both multiples of 30, and
`start_minutes + duration_minutes <= 1440`. MySQL is not asked to enforce these;
the route validator is (section 5), so that a violation answers 400 with a
readable message instead of a driver error.

### Schema migration

`src/db/schema.sql` gains both tables and its teardown block gains the two
matching `DROP TABLE` lines, in reverse dependency order — `calendar_items`
before `calendar_days`, both before `todos` and `users`. As with the previous
two additions, the file's header comment gains an in-place `CREATE TABLE` note
for a database that already holds data, so an existing install is not asked to
re-run a destructive file.

## 5. API

### The pool needs no new endpoint

`GET /api/projects` already answers with, per project, `id`, `title`, and
`frontier: [{ sequenceId, sequenceTitle, nextTodo: { id, text }, isStalled }]`.
That is precisely decision 3's pool. The right panel is built from the response
the projects home page already consumes; no serializer or query changes.

Frontier entries with `nextTodo: null` — a stalled sequence, or an empty one —
are not schedulable and are omitted from both the list and the count.

### New endpoints

All mounted at `/api/calendar` behind `isAuth` and `respond`, above the static
catch-all in `server.js`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/calendar` | `{ days, items }` for the signed-in owner |
| `POST` | `/api/calendar/days` | append a day; returns it |
| `DELETE` | `/api/calendar/days/:id` | delete it and its items; reindexes positions |
| `PUT` | `/api/calendar/items` | bulk: the settled result of one gesture |
| `DELETE` | `/api/calendar/items/:todoId` | unschedule one to-do |

`GET /api/calendar` returns both collections in one request, the way
`GET /api/projects/:id` returns a whole graph: the page has one loading state and
one failure state rather than one per collection.

### A booked item carries its own display data

`calendar_items` stores only `todo_id`, but a day column has to draw a name, tick
a bubble, and link to a project and a sequence. Reading those from the pool would
work only while the to-do is still on the frontier — and it stops being on the
frontier the moment its bubble is ticked, which is precisely when the item is
specified to stay on screen (section 8). An item would lose its own name as a
result of being completed.

So `GET /api/calendar` joins and denormalises, and each item is serialized as:

```json
{
  "id": 7,
  "dayId": 4,
  "todoId": 12,
  "text": "Wire up the token refresh",
  "status": "incomplete",
  "projectId": 2,
  "projectTitle": "Auth rewrite",
  "sequenceId": 9,
  "sequenceTitle": "Session handling",
  "startMinutes": 540,
  "durationMinutes": 60
}
```

This makes the calendar self-sufficient: it renders fully from its own request,
and the pool is needed only to decide which rows are draggable. `sequenceId` and
`sequenceTitle` are null when the to-do has since been returned to the
unorganized panel — `todos.sequence_id` is nullable, and nothing stops a to-do
being unfiled on the project page after it was booked here.

The join is `calendar_items → todos → projects`, with a `LEFT JOIN` to
`sequences` so an unfiled to-do still comes back. It is one query for the owner's
whole calendar, not one per item.

### The bulk endpoint

One gesture can move many items across several days and create days that did not
exist. Sending that as N requests would let a cascade half-apply. So:

```
PUT /api/calendar/items
{
  "appendDays": 1,
  "placements": [
    { "todoId": 12, "dayId": 4,    "startMinutes": 540, "durationMinutes": 90 },
    { "todoId": 19, "dayId": 4,    "startMinutes": 630, "durationMinutes": 60 },
    { "todoId": 23, "dayIndex": 3, "startMinutes": 0,   "durationMinutes": 60 }
  ],
  "unschedule": [31]
}
```

- `appendDays` is how many days to create before applying placements. Days
  created here take the next positions.
- A placement names its day by `dayId` (an existing day) **or** `dayIndex` (an
  index into the day list *after* the appends), never both. `dayIndex` is what
  lets a spill that creates a day be one atomic request.
- `unschedule` removes bookings in the same transaction — needed when an item
  moves out of a day and something else moves in.

The whole call runs inside `withTransaction`, so a cascade that cannot be fully
applied leaves nothing behind, including no stray empty day.

**Validation, in order.** Every failure is a 400 with a message naming the field,
except ownership failures, which follow the existing `assertOwnership` behaviour:

1. `appendDays` is an integer 0..(number of placements).
2. Every `todoId` resolves to a to-do the caller owns.
3. Every `dayId` resolves to a day the caller owns; every `dayIndex` is within
   the day list after appends.
4. `startMinutes` and `durationMinutes` are integers, multiples of 30.
5. `durationMinutes` is 30..1440; `startMinutes` is 0..1410.
6. `startMinutes + durationMinutes <= 1440`.
7. Within each day, no two resulting items overlap.

Rule 7 is what makes decision 8 safe. The server does not recompute the cascade
and does not check that the client's arithmetic followed the rules; it checks
that the *result* is a legal calendar. A client that computes wrongly can produce
a layout the user did not intend, but not a corrupt one.

Serializers follow `src/lib/serializers.js`: `toCalendarDay` and
`toCalendarItem`, snake_case to camelCase at the boundary, `owner_id` never
leaving the server.

## 6. The cascade

Lives in `src/client/src/lib/schedule.js`. Pure functions over plain data — no
React, no DOM, no measurement — so the hardest logic in the feature is testable
without a layout jsdom cannot provide. This is the same division `lib/dragDrop.js`
already makes: the drag library answers "where did the pointer land", and
everything after that is arithmetic.

### Constants

```
DAY_MINUTES      = 1440    a day is 00:00 to 24:00
SLOT_MINUTES     = 30      the grid, and the snap
MIN_DURATION     = 30      one slot
MAX_DURATION     = 1440    a full day; guarantees the spill terminates
DEFAULT_DURATION = 60      what a drop from the pool books
```

### Step 1 — settle one day

Apply the gesture to the anchor, then sort the day's items by `startMinutes`,
with the anchor first on a tie. Then fold:

```
cursor = 0
for item in ordered:
    start  = max(item.startMinutes, cursor)
    cursor = start + item.durationMinutes
```

That single line is the whole of the stated rule. Because a start is only ever
raised and never lowered, a gap survives when the item above still fits above it,
and is squeezed exactly when the item above grows into it — after which the stack
pushes. Nothing above the anchor can move, because nothing above it is ever
raised past its own start.

The anchor-first tie-break is what makes "drop between two items" work: releasing
exactly on an existing item's start places the anchor above it and pushes it
down.

### Step 2 — spill past midnight

After settling, the items whose `start + duration > DAY_MINUTES` are a contiguous
tail of the ordered list. They move **whole** — an item is never split across a
midnight boundary — to the next day, rebased so the first of them starts at 00:00
with the group's relative gaps preserved. There they become the anchors, and the
next day is settled with them, pushing its existing contents down.

Recurse. If there is no next day, one is appended.

This terminates: every pass moves at least one item strictly forward, item count
is finite, and `MAX_DURATION` guarantees a single item always fits in an empty
day. The number of days a gesture can create is bounded by the number of items
it moves.

### Step 3 — the source day

An item leaving a day — moved to another column, or dragged back to the pool —
leaves a gap. The source day is not re-settled. This is decision 7 seen from the
other side: positions are what they are drawn as.

### Public surface

```
settleDay(items, anchor)          → items, no overlaps, downward-only
spill(days, dayIndex, anchors)    → { days, items }, creating days as needed
placeFromPool(state, todoId, dayId, startMinutes)
moveItem(state, todoId, dayId, startMinutes)
resizeItem(state, todoId, edge, startMinutes, durationMinutes)
unscheduleItem(state, todoId)
```

Each returns a new state; none mutates its input. Each is also what the preview
during a drag is computed from, so what the ghost shows and what is saved come
from the same function called with the same arguments.

## 7. Client structure

```
src/client/src/
  components/Calendar/
    CalendarPage.js           page shell: load, error, ready; one DndContext
    DayStrip.js               horizontally-scrolling row of columns; "add day"
    DayColumn.js              header, delete, inner 24h scroll
    DayGrid.js                48 half-hour droppable slots + hour labels
    DayItemCard.js            bubble · drag graphic · name; two resize handles
    ProjectPanel.js           the pool; hosts the remove overlay
    ProjectAccordionCard.js   collapsed (name + count) / expanded (+ rows)
    PanelTodoRow.js           draggable, or inert with a day badge
    RemoveOverlay.js          "Drag here to remove from day"
  components/Styling/
    Calendar.css
  lib/
    schedule.js               section 6
    scheduleGeometry.js       minutes ↔ pixels, snapping, clamping
  state/
    calendarReducer.js
    CalendarContext.js
  hooks/
    useCalendar.js            load + optimistic mutations
```

`useCalendar` mirrors `useProjectGraph`: one request for the page, a reducer over
normalised collections, optimistic mutations that roll back on failure. The
existing `clientKeyOf` convention for optimistic rows applies unchanged.

`routes.js` gains
`{ path: '/calendar', element: <ProtectedRoute><CalendarPage /></ProtectedRoute> }`,
and `Navbar.js` gains a link to it alongside the existing Dashboard button.

Every file stays well under the 800-line ceiling; the largest are expected to be
`schedule.js` and `DayItemCard.js`.

## 8. Interactions

### The pool (right panel)

Accordion cards, one per project. Collapsed: project name and the count of
unscheduled schedulable to-dos. Expanded: the same header plus the rows. A click
anywhere on a collapsed card expands it; there is no hover behaviour. Expansion
state is browser-local and not persisted — unlike a sequence card's
`is_collapsed`, nothing here is worth a column.

A row is draggable when unscheduled. When scheduled it is dimmed, carries the day
it went to, and does not respond to a drag (decision 4).

### Pool → day

A drop books the to-do at the pointer's 30-minute slot for `DEFAULT_DURATION`,
then settles and spills. A drop at 23:30 books an item that immediately spills —
handled by the same code path, not a special case.

### Resize

- **Bottom edge** changes `durationMinutes` and cascades downward.
- **Top edge** changes `startMinutes` and keeps the end fixed, so it changes
  duration too. It clamps at the end of the item above, or at 00:00. It never
  pushes: the cascade is downward-only (decision 7).

Both snap to 30 minutes and stop at `MIN_DURATION`.

### Reorder and cross-day move

The drag graphic moves an item to any slot in any day, including another column.
The target day settles and spills; the source day keeps its gaps.

### The ghost

Every gesture recomputes the cascade into a preview state on each pointer move
and renders the affected items at their preview positions, behind a ghost of the
thing being dragged. Release commits — one `PUT /api/calendar/items` carrying the
whole settled result. Escape, or returning the pointer to the origin, discards
the preview and sends nothing.

### Removing from a day

While an item that originated in a day is in the air, the right panel is covered
by a droppable overlay reading "Drag here to remove from day". Dropping on it
unschedules the item; its row in the pool becomes draggable again and the
project's count goes back up. The overlay appears only for day-originated drags —
never while dragging out of the pool.

### The bubble

`PATCH /api/todos/:id { status: 'complete' }`, the same call the project page
makes. The item does not move; it is struck through in place. The pool refetches,
and because the pool is "each ready sequence's next step", that sequence's *next*
to-do appears — completing work is how the pool refills.

### The name

Clicking an item's name navigates to `/projects/:projectId?sequence=<sequenceId>`,
both read off the item itself rather than looked up in the pool. After a short
delay the project page flashes that sequence card, then clears the query
parameter so a reload or a back-navigation does not flash it again.

When `sequenceId` is null — the to-do was returned to the unorganized panel after
being booked — the link goes to the project page with no parameter, and nothing
flashes. There is no sequence to point at, and inventing one would be worse than
simply arriving at the project.

This is the one change outside `components/Calendar/`: `ProjectPage` reads the
parameter and passes a highlighted id down through `Canvas` to `SequenceCard`,
which is already given per-card state this way for `isActive`. The delay exists
because the card is not on screen at navigation time — the graph has to load
first.

### Days

"+" at the end of the strip appends a day. Each day's header carries its ordinal
and its creation timestamp, and a delete control following the existing
`DeleteBubble` pattern. Deleting a day with items in it prompts through
`ConfirmDialog`, saying how many bookings will be released; deleting an empty day
does not prompt, matching `LayerRow`.

## 9. Geometry and rendering

In `scheduleGeometry.js`, never inline:

```
SLOT_MINUTES      = 30
PX_PER_SLOT       = 24        → 48px per hour, 1152px per day
INITIAL_SCROLL_AT = 360       06:00 at the top of the column
```

A column renders 48 slot rows and positions items absolutely from
`startMinutes` and `durationMinutes`. It opens scrolled so 06:00 is at the top;
the user can scroll to any hour, and that scroll is per column.

The strip scrolls horizontally as days are added, following the pattern the
2026-09-07 spec established for layers.

All colour, spacing, radius and type values come from the `:root` tokens in
`index.css`. No hardcoded values in `Calendar.css`.

## 10. Error handling

Every mutation is optimistic and rolls back on failure, surfacing the message
through the same dismissible toast pattern `ProjectPage` uses — a `role="alert"`
region that stays mounted and toggles `hidden`, so the message is announced.

A failed load keeps a retry on screen rather than rendering an empty strip, which
would be indistinguishable from a calendar with no days in it.

The pool and the calendar are two requests. Either can fail alone, and each
reports its own failure in its own panel rather than failing the whole page: a
calendar you cannot add to is still worth reading, and a pool you cannot schedule
from is still worth seeing.

## 11. Not in this pass

Named or renamable days. Reordering days. Multi-select. Undo. Recurring items.
Any real calendar date. Sub-30-minute precision. Splitting one item across a
midnight boundary. Scheduling anything that is not a frontier sequence's next
step.

## 12. Testing

Four tiers, matching the existing layout.

**Unit — `src/client/src/lib/schedule.test.js`.** The bulk of the value.
Table-driven over the cascade:

- a grown item squeezes the gap below it before pushing anything
- a grown item pushes a touching stack, all of it, by the right amount
- a shrunk item leaves a gap and pulls nothing up (decision 7)
- an item ending exactly at 24:00 does not spill
- an item ending one slot past 24:00 spills whole, not split
- several items spill together, keeping their relative gaps
- a spill into a populated day pushes that day's contents down
- a spill with no next day appends one
- a spill that cascades across three days
- the top edge clamps at the item above and never pushes upward
- a cross-day move leaves the source day's gap intact
- dropping onto an existing item's exact start goes above it

**Unit — `src/client/src/lib/scheduleGeometry.test.js`.** Snapping, clamping, and
the minutes↔pixels round trip.

**Integration — `tests/integration/calendarRoutes.test.js`.** The five endpoints;
`assertOwnership` on every one; day-position reindexing after a delete; the
bulk endpoint's atomicity, including that a rejected call creates no day; and
each of the seven validation failures from section 5.

Two of these guard the denormalised payload specifically, because the failure it
prevents is invisible until the exact moment a user completes something:

- a completed to-do's item still comes back with its text, project title and
  sequence title — it must not go blank as a result of leaving the frontier
- an item whose to-do has been returned to the unorganized panel comes back with
  `sequenceId` and `sequenceTitle` null, and is not dropped from the response by
  the join

**Component — beside each component.** Accordion collapse and expand; the count
excluding scheduled items; a scheduled row being inert; the remove overlay
appearing for day-originated drags and not for pool drags; the bubble striking an
item through without moving it.

**E2E — `tests/e2e/calendar.spec.js`.** One critical flow: drag from the pool into
a day, resize it until it spills, and see the item land in a day that was created
for it.

## 13. Build order

Each step leaves the app working.

1. Schema: both tables, teardown lines, and the in-place migration note.
2. Repositories and serializers for days and items.
3. The five routes, with validation and ownership guards. Integration tests.
4. `schedule.js` and `scheduleGeometry.js`, test-first. No UI yet.
5. `useCalendar`, the reducer, and the context.
6. Static rendering: the page, the strip, a column, the grid, an item card, the
   pool. No dragging — days can be added and deleted, items only render.
7. Pool → day dragging, with the ghost.
8. Resize, both edges.
9. Reorder and cross-day move.
10. The remove overlay.
11. The bubble and the name link, including the project-page highlight.
12. E2E.

Steps 1–3 and step 4 are independent and may be built in either order or in
parallel. Everything from 5 onwards is sequential.
