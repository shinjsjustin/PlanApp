# PlanApp — Calendar Notes and Column Sizing Design Spec

Date: 2026-09-16
Status: agreed
Supersedes nothing. Extends the 2026-09-09 calendar design; every section number
referenced as "calendar §N" or "decision N" belongs to that document.

---

## 1. Purpose

The calendar schedules *planned* work: a to-do dragged out of the pool into a
day. It has nowhere to record the things that shaped a day but were never
planned — a train journey, being on call, the kids being home, running on four
hours' sleep.

This pass adds **notes**: free-floating time blocks that live in a day, carry a
line of text, and explain the shape of that day without pretending to be work.

It also resizes the calendar. A day column is currently capped at `70vh` and
220px wide, which was right when the strip was meant to hold "several days at
once". It no longer is: the column now has two planes to draw, and reading two
days properly beats glimpsing four.

Three things are therefore in scope:

1. Notes — a new plane inside every day column.
2. A day column that fills the page vertically.
3. A day column wide enough that exactly two fit across the strip.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **note** | A block of time in a day carrying one line of text. Not work; context. |
| **ribbon** | How a note is drawn: a narrow vertical bar with its text rotated to read bottom-to-top. |
| **plane** | One of the two independent layers inside a day column. The *notes plane* is the left half, the *to-do plane* the right. |
| **lane** | One of four vertical tracks inside the notes plane. Lane 0 is rightmost. |
| **booking** | Unchanged from the calendar spec: a to-do placed in a day. |
| **scale** | Pixels per half-hour slot. Formerly a constant; now derived from the window. |

---

## 3. Decisions

Numbered independently of the calendar spec's decisions.

### Decision 1 — Notes are a second plane, not a second kind of booking

Notes and bookings never interact. A note does not move a booking and a booking
does not move a note. They share a day, a clock and a grid, and nothing else.

This is a decision about the *code* as much as the UI. `lib/schedule.js`,
`lib/calendarRequest.js` and `PUT /api/calendar/items` are the cascade, and the
cascade is the most intricate thing in the app. Notes do not participate in it,
so those three files are not touched by this pass. Anything that would require
touching them is a signal that the two planes have been conflated.

### Decision 2 — Notes are free-floating and may overlap

A note does not push another note down and is not pushed. Two notes covering the
same hours simply sit side by side.

This was reversed during design. The first instinct was full parity with
bookings — push-down and spill — and it is wrong for what a note *is*. "On call"
and "kids at home" are simultaneously true; a rule that shoved one below the
other would be asserting a sequence that does not exist. Context overlaps;
work does not.

Everything else in this spec follows from that sentence. No cascade means no
spill, which means notes cannot invent a day, which means a note gesture touches
exactly one row, which is why §5 is plain REST rather than the bulk endpoint.

### Decision 3 — A ribbon reads bottom-to-top

A note's text is rotated 90° counter-clockwise (`writing-mode: vertical-rl` plus
`rotate(180deg)`), centred along the ribbon.

Rotation is what makes overlap affordable. A horizontal card needs ~120px to
carry a readable label, so four overlapping notes would need 480px of the notes
plane. A ribbon carries the same label in ~20px and grows *downwards* with the
note's duration, which is the axis a time block already has to spare.

### Decision 4 — Four lanes, and the fifth is refused

At most four notes may overlap at any minute. A gesture that would produce a
fifth is refused.

Refused rather than accommodated: lanes that subdivide indefinitely reach a
width where the rotated text stops being readable, and a calendar that silently
becomes illegible is worse than one that says no. Four is enough for the cases
that motivated the feature and is revisitable — it is one constant.

### Decision 5 — The lane is derived, never stored

A note's lane is computed from the day's notes on every render. It is not a
column in the database, is not sent over the wire, and cannot be dragged.

Storing it would make two things true at once — the note's own lane, and the set
of notes actually overlapping it — with nothing keeping them honest. Deleting a
note would leave a hole that no other note could fill until something rewrote
every sibling's lane. Derived, the arrangement is always a function of the notes
themselves.

The cost is that a user cannot choose which lane a note occupies. That is
accepted: the lane carries no meaning, only separation.

### Decision 6 — Lanes fill right to left

Lane 0 is the lane adjacent to the to-do plane, and the picker takes the
lowest-numbered free lane. A day with one note draws it hard against the to-do
boundary; a day with four fills the notes plane.

So the two planes build outward from the boundary between them, and the reading
order across a column stays "the day's context, then the day's work" with no gap
opening in the middle.

### Decision 7 — Greedy right-to-left assignment is exactly the cap

The picker walks a day's notes in `(startMinutes, id)` order and gives each the
lowest-numbered lane that is free for its whole span.

This is greedy colouring of an interval graph, which is optimal: it uses exactly
as many lanes as the maximum number of notes overlapping at any one minute. So
"the picker found no free lane" and "five notes overlap somewhere" are the *same
condition*, not two conditions that happen to agree today.

That is what lets the client refuse a gesture pre-emptively and the server
enforce the cap by a completely different method (a sweep over the day's rows,
§5) without the two ever disagreeing.

### Decision 8 — Notes are contained by their day

A note may not start before 00:00 or end after 24:00. The bottom edge clamps at
midnight rather than spilling.

A spill exists to rehouse work that no longer fits, and it appends a day when it
runs out. Neither makes sense for context: a note describes *this* day, and a
note that manufactured tomorrow in order to finish describing today would be
absurd.

### Decision 9 — Deleting a day deletes its notes, with no prompt

`ON DELETE CASCADE` from `calendar_days`. No confirmation, no mention in the
existing confirm dialog.

The existing dialog warns about *bookings* because deleting a day releases
to-dos that continue to exist elsewhere — the warning is about the to-dos, not
the day. A note exists only as part of its day and has nowhere to be released
to, so there is nothing to warn about. The dialog's copy and its "only prompt
when there is something to release" rule are unchanged.

### Decision 10 — The scale is derived from the window

`PX_PER_SLOT` stops being a constant:

```
pxPerSlot = max(PX_PER_SLOT_MIN, availableHeightPx / SLOTS_PER_DAY)
```

with `PX_PER_SLOT_MIN = 24`, today's value.

One formula covers both of the behaviours asked for. On a short window the
column fills the page at 24px/slot, so more hours are visible than the old
`70vh` allowed and the rest still scrolls inside. On a window tall enough for
all 24 hours, the division wins and the scale grows so the day exactly fills the
column, stretching every booking and ribbon with it.

Showing more hours is the priority and the floor is what encodes that: the scale
never drops below 24px/slot to squeeze a whole day into a short window, because
a compressed day is less readable than a scrolled one.

### Decision 11 — Exactly two days fill the strip

```css
--cal-column-width: max(260px, calc((100% - var(--space-sm)) / 2));
```

Two columns plus the one gap between them are the strip's visible width, so the
third day is always just off the edge, inviting the sideways scroll that already
exists. Below ~560px of strip the floor takes over and even the second day
scrolls.

Fluid rather than a fixed generous width, because "two days on screen" is the
requirement and a fixed width only satisfies it at one window size.

---

## 4. Data model

### 4.1 `calendar_notes`

```sql
CREATE TABLE `calendar_notes` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `text`             varchar(500) NOT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_notes_day_start` (`day_id`, `start_minutes`),
  CONSTRAINT `fk_calendar_notes_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
```

What is deliberately absent is as important as what is there:

- **No `lane` column** — decision 5.
- **No `owner_id`** — a note reaches its owner through its day, the way a to-do
  reaches its owner through its project. One join, in `assertOwnership`.
- **No unique key** — `calendar_items` has `uq_calendar_items_todo` because a
  to-do may be booked at most once. A day may hold any number of notes.
- **No `position`** — display order is `start_minutes` then `id`, which is a
  total order over any set of notes and needs no stored rank.

`text` is `varchar(500)`, matching `todos.text`. A ribbon shows one clipped
line; the full text is visible in the popover.

The `ON DELETE CASCADE` is decision 9 in the schema rather than in code.

### 4.2 Schema migration

An existing database gains the table without a teardown — run the
`CREATE TABLE` above on its own, and add the matching `DROP TABLE IF EXISTS
calendar_notes;` to the top of `schema.sql`'s teardown block, before
`calendar_days` so the reverse-dependency order holds.

Recorded in `schema.sql`'s header comment beside the existing calendar note, in
the same form.

### 4.3 Ownership

`assertOwnership` gains a `calendarNote` resource type:

```sql
SELECT d.id, d.owner_id FROM calendar_notes n
JOIN calendar_days d ON d.id = n.day_id
WHERE n.id = ?
```

Like `calendarDay`, it returns a row whose `owner_id` is the user's directly and
which is **not** a project row — the same caveat the existing `calendarDay`
entry carries, for the same reason.

---

## 5. API

### 5.1 Why not the bulk endpoint

`PUT /api/calendar/items` is bulk and atomic because one booking gesture settles
a whole day, can move a dozen rows across three days, and can create a day that
did not exist. None of that is true of a note (decisions 2 and 8): **a note
gesture touches exactly one row and can never create a day.** Sending it through
the bulk endpoint would buy nothing and would give the cascade a notes dimension
it has no use for.

So notes get plain REST, in their own router.

### 5.2 Endpoints

Mounted at `/api/calendar/notes` behind `isAuth`, in a new
`src/routes/calendarNotes.js`. A separate file rather than more of
`src/routes/calendar.js`, which is already 308 lines.

| Method | Path | Body | Answer |
|---|---|---|---|
| `GET` | `/api/calendar/notes` | — | `{ notes: [...] }` for the owner |
| `POST` | `/api/calendar/notes` | `{ dayId, text, startMinutes, durationMinutes }` | the created note, 201 |
| `PATCH` | `/api/calendar/notes/:id` | any of `text`, `dayId`, `startMinutes`, `durationMinutes` | the updated note |
| `DELETE` | `/api/calendar/notes/:id` | — | `{ id }` |

`GET /api/calendar` is **unchanged** and still answers `{ days, items }`. Notes
load separately, which is what §7 requires of them.

### 5.3 Validation

Zod schemas mirroring `routes/calendar.js`:

- `text` — non-empty after trimming, at most 500 characters.
- `startMinutes`, `durationMinutes` — integers, multiples of `SLOT_MINUTES`,
  with `startMinutes >= 0`, `durationMinutes >= MIN_DURATION`, and
  `startMinutes + durationMinutes <= DAY_MINUTES` (decision 8).
- `dayId` — `idSchema`, ownership-checked before anything is touched.
- `PATCH` requires at least one field, so an empty body is a 400 rather than a
  silent no-op.

Every write runs inside `withTransaction`, checks ownership of the note and of
the target day, applies the change, then re-reads the target day's notes and
runs the lane check below. A violation throws `badRequest`, which rolls the
transaction back.

Only the **target** day is checked. A `PATCH` that moves a note between days
also empties a slot in the source day, and removing a note can never raise that
day's maximum overlap — so re-checking it would always pass and cost a read.
`DELETE` is checked not at all, for the same reason.

### 5.4 The lane check — `src/lib/calendarNoteLanes.js`

A pure module beside `lib/calendarPlacement.js`, following its conventions:
plain data in, a human-readable message or `null` out.

```
maxOverlap(notes) -> integer
findLaneProblem(notes) -> string | null
```

`maxOverlap` is a sweep: turn each note into `+1` at its start and `-1` at its
end, sort, and take the running maximum. `findLaneProblem` returns a message
when that exceeds `MAX_NOTE_LANES`.

The server checks **what is now stored**, not what was sent — the same rule
`routes/calendar.js` applies to booking overlap, and for the same reason: a day
holds notes this request never mentioned, and a check that read only the payload
would sail past them.

The server does *not* assign lanes and has no concept of lane 0 being rightmost.
It enforces a count; the client draws an arrangement. Decision 7 is what
guarantees those two are the same rule.

### 5.5 Serializer

`toCalendarNote(row)` in `lib/serializers.js`:

```js
{ id, dayId, text, startMinutes, durationMinutes }
```

No timestamps — nothing in the UI shows when a note was written. Times are
integer minutes from midnight, never clock strings, matching `toCalendarItem`.

---

## 6. Lane assignment on the client — `src/client/src/lib/noteLanes.js`

Pure, no React, no DOM — the same bargain `lib/schedule.js` makes, for the same
reason: this is arithmetic that runs on every pointer move of a create or a
move gesture, and it has to be testable without a rendered column.

```js
export const MAX_NOTE_LANES = 4;

/**
 * Day's notes → Map(noteId → lane). A note with no free lane maps to `null`
 * rather than being omitted, so a caller iterating the map sees it and can
 * draw it as unplaceable. That can only arise from data that got past the
 * server's check — every client gesture is refused before it can produce it.
 */
export const assignLanes = (notes) => ...;

/** Whether a hypothetical note would fit. Drives the live refusal. */
export const canPlace = (notes, candidate) => ...;
```

`assignLanes` sorts by `(startMinutes, id)` and gives each note the
lowest-numbered lane whose already-assigned occupants do not overlap it. Two
notes touching end-to-start do not overlap: a note ending at 10:00 and one
starting at 10:00 share a lane.

`canPlace` runs the same assignment over the day's notes plus the candidate,
with the candidate's own id excluded from the existing set — so a note being
moved or resized is tested against its siblings and not against its former self.

Sorting by `id` as the tie-break makes the arrangement stable: two notes with
the same start do not swap lanes between renders.

`MAX_NOTE_LANES` is stated here *and* in `src/lib/calendarNoteLanes.js` rather
than shared. That mirrors what the calendar already does with `DAY_MINUTES`,
`SLOT_MINUTES` and `MIN_DURATION`, which `lib/schedule.js` and
`lib/calendarPlacement.js` each declare for themselves: `src/shared/` holds
fixtures, not runtime modules, and the client bundle does not import from
`src/lib`. The agreement test in §12 is what holds the two copies together.

---

## 7. Client structure

### 7.1 Where notes live

**A sibling hook.** `useCalendarNotes` has its own reducer, its own load, and
its own failure state, and sits beside `usePool` and `useCalendar` in
`CalendarPage`.

The page already works this way, and its own header comment says so: *"Two
requests, two failure states."* The calendar and the pool are loaded separately
because a calendar you cannot schedule into is still worth reading. Notes are a
third thing of the same kind — a day strip whose notes failed to load is still a
usable calendar, and a notes plane whose *calendar* failed to load has no
columns to draw into and correctly shows nothing.

The alternatives, and why not:

- **Fold notes into `useCalendar`.** `useCalendar.js` is already 480 lines and
  would reach ~700. Worse, `scheduleOf`, `toBulkRequest` and the bulk endpoint
  would each grow a notes dimension that no cascade code ever reads — exactly
  the conflation decision 1 exists to prevent.
- **One payload, two reducers.** One request, but neither hook owns the fetch,
  so retry and failure state have no home.

New files:

```
state/notesReducer.js      status, notes, loadError, actionError
state/notesActions.js      action creators
hooks/useCalendarNotes.js  load + optimistic CRUD
```

The reducer mirrors `calendarReducer`'s shape and its optimistic/rollback
contract, but is much smaller: the unit of change is one note, not a whole
schedule, so there is no snapshot-of-everything and no `hasSettledSince`
machinery. Each mutation rolls back its own row.

Optimistic creates use `createTempId()`, and the reducer swaps the temporary id
for the server's on success — the same pattern `addDay` already uses.

### 7.2 The one coupling: deleting a day

```js
const notes = useCalendarNotes();
const calendar = useCalendar({
    onTodoCompleted: pool.refresh,
    onDayDeleted: notes.pruneDay,
});
```

The same wiring `onTodoCompleted` already uses, and it is cheap because notes
are rendered *inside* a column: a day removed optimistically stops drawing its
notes for free. So `pruneDay` is called on success only, and is hygiene rather
than something the UI depends on — which is also why a rolled-back day deletion
needs no undo for notes. The column comes back, and its notes are still in
state, so they come back with it.

### 7.3 Components

```
Calendar/NotePlane.js    the four lanes, the create surface, the drop target
Calendar/NoteRibbon.js   one note: rotated text, two resize edges, drag handle
Calendar/NotePopover.js  the text field and the Delete button
```

`DayColumn` renders the gutter, then `NotePlane`, then the existing to-do plane.
`DayGrid`'s rules span both planes so the two share one clock face.

### 7.4 Scale plumbing

```
hooks/useDayScale.js       measures, returns pxPerSlot
state/DayScaleContext.js   publishes the geometry object
```

`lib/scheduleGeometry.js` gains:

```js
export const PX_PER_SLOT_MIN = 24;
export const createDayGeometry = (pxPerSlot) => ({ minutesToPx, pxToMinutes, dayHeightPx });
```

Only those two conversions depend on the scale. `snapToSlot`, `clampStart`,
`clampDuration`, `formatTime` and `hourLabels` do not, and stay exactly as they
are as module-level exports — **so the guard analysis in that file's header
remains true unchanged**, which is the main reason for the factory rather than
adding a `pxPerSlot` parameter to every converter.

`useResizeEdge` gains a `geometry` parameter, since it converts a pointer delta
to minutes. Nothing else about it changes, which is what lets notes reuse it
(§8.3).

---

## 8. Interactions

### 8.1 The column

```
┌─ Day 3 ──────────────────────────────────────┐
│ gutter │   notes plane 50%   │  to-dos 50%    │
│  48px  │ ┌────┬────┬────┬────┐│                │
│ 09:00  │ │ L3 │ L2 │ L1 │ L0 ││ ▌Draft schema  │
│ 10:00  │ │    │    │ on │ tr ││ ▌               │
│ 11:00  │ │    │kids│call│ain ││ ▌Wire reducer   │
│        │ └────┴────┴────┴────┘│                │
└──────────────────────────────────────────────┘
                   ← fills this way
```

The gutter is unchanged and sits outside the split; the remaining width divides
50/50. Lanes are `flex: 1` within the notes plane, so they widen with the
column.

### 8.2 Creating a note

Pointer-down on empty notes background starts a draft. Dragging extends it. On
release, the popover opens with its field focused.

- A press with no movement is a **30-minute** note at the minute pressed.
- A drag covers the span *between* the minute pressed and the minute released,
  snapped to the grid, with `MIN_DURATION` as the floor. Dragging upward is the
  same gesture as dragging down: the earlier of the two is the start.
- Escape, or saving with empty text, creates **nothing** — no row, no request.

`hooks/useNoteDraft.js`, raw pointer events on `document`. Not a dnd-kit sensor:
the sensor's 5px activation distance exists so a click on a button is not
swallowed by a drag, and it is exactly wrong for a gesture whose first pixel of
movement *is* the gesture. The same reasoning `useResizeEdge` records.

A draft ghost draws in the lane it would occupy, live, as the pointer moves.

### 8.3 Moving, resizing, deleting

**Move** — dnd-kit, like a booking, including across columns into another day.
Each column gains a second droppable for its notes plane. During a note drag the
to-do droppable is disabled and during a booking or pool drag the notes
droppable is, so neither plane can catch the other's drag. A note dropped where
it does not fit is refused (§8.4) and stays where it was.

**Resize** — reuses `useResizeEdge`, unchanged but for the `geometry` parameter
§7.4 adds to it for the scale. It is already generic over
`{ startMinutes, durationMinutes }` and its only domain coupling is
`MIN_DURATION`. Notes resolve with `floor: 0` always: overlap is legal, so there
is no item above to clamp against. The bottom edge clamps at `DAY_MINUTES`
(decision 8) rather than running past it, which is the one place notes and
bookings genuinely differ and is expressed as the clamp, not as a second hook.

**Delete** — a button in the popover, reached by clicking the ribbon. Not a
hover `×` on the ribbon itself: a ribbon is ~20px wide and the popover is
already the place a note is edited.

### 8.4 The refusal

The lane is recomputed live during every create, move and resize. When
`canPlace` returns false:

- the ghost renders in a refused style;
- the release does nothing at all — no request, no state change;
- **no toast.** The user is shown the refusal while it is happening, which is
  better than being told about it afterwards.

A server 400 from `findLaneProblem` is therefore a genuine race — two tabs, or a
stale client — and *that* raises the toast, through the notes hook's own
`actionError`.

### 8.5 Reading a note

The ribbon carries the text rotated and centred, clipped to the ribbon's height.
Clicking it opens the popover, which shows the full text in an editable field
plus the note's time range and the Delete button. Saving `PATCH`es; the popover
closes on save, on Escape, and on a click outside.

---

## 9. Geometry and layout

### 9.1 Vertical

`.calendar-body` becomes a flex column filling the viewport below the header.
`.day-column` fills its height; `.day-column-scroll` is `flex: 1;
overflow-y: auto`. The `--cal-column-max-height: 70vh` cap is removed.

`useDayScale` observes the **scroll viewport** with a `ResizeObserver` and
computes decision 10's formula from its `clientHeight`.

> **The observer must never watch the grid.** The grid's height is
> `dayHeightPx`, which is derived from the scale, which would then be derived
> from the grid. Observing the scroll viewport is safe because its height comes
> from flex layout and not from its content.

When the scale grows enough that all 24 hours fit, the scroll container has
nothing to scroll and `INITIAL_SCROLL_MINUTES` becomes a no-op on its own — no
branch needed.

### 9.2 Horizontal

```css
--cal-column-width: max(260px, calc((100% - var(--space-sm)) / 2));
```

on `.day-column`'s `flex-basis`. The percentage resolves against
`.calendar-strip`'s content box — its visible width, not its scroll width — so
two columns and one gap are exactly what fits. `.calendar-strip` keeps
`overflow-x: auto`, so the third day scrolls.

The `+` button at the end of the strip is unchanged.

### 9.3 The ribbon

```css
.note-ribbon span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
}
```

`vertical-rl` plus a 180° rotation, rather than `sideways-lr`, which only
Firefox implements. Centred on both axes, clipped with `overflow: hidden`, so a
long note in a short ribbon truncates rather than escaping it.

New tokens on `.calendar-page`, named by role beside the existing ones:
`--cal-note-plane-width` (50%) and `--cal-note-edge-depth`, the latter matching
the existing `--cal-resize-depth` so both planes feel the same under the pointer.

There is no lane-gap token. Lanes are positioned as percentages of the plane
rather than laid out as boxes, so there is nothing between them to space.

---

## 10. Error handling

Notes follow the calendar's contract: apply optimistically, send, then either
keep the change or roll that one note back and raise `actionError`.

`CalendarPage` renders one alert region. It shows `calendar.state.actionError`
when there is one and `notes.state.actionError` otherwise, and dismissing
clears whichever is showing. One region rather than two, because two live
regions stacked above the strip would be noise for a page that raises an error
roughly never.

A failed notes **load** leaves the day columns fully usable and shows a quiet
notice with a retry, the way `pool-notice` already does — not a full-page error,
because the calendar itself is fine.

One notice for the strip, pinned above it, rather than one per notes plane. The
load is a single request for every day at once, so a copy in each column would
repeat one failure as many times as the user has days.

---

## 11. Not in this pass

- Note colours, tags or categories. A note is one line of text.
- A note title separate from its body.
- Recurring or templated notes.
- Notes on anything other than a day — no project notes, no sequence notes.
- Reordering lanes by hand (decision 5).
- More than four overlapping notes (decision 4).
- Carrying a note across midnight (decision 8).

---

## 12. Testing

Following the existing split: pure logic in Jest unit tests, components in RTL,
routes in Supertest, and the page in Playwright.

**`lib/noteLanes.js`** — the densest tests in the pass, because everything else
trusts it:
- assigns lane 0 to a lone note
- fills right to left across overlapping notes
- reuses a lane for notes that do not overlap
- treats end-to-start contact as non-overlapping
- refuses a fifth overlapping note
- excludes the candidate's own id when testing a move
- orders identically across two runs with equal starts

**`lib/calendarNoteLanes.js`** (server) — `maxOverlap` over empty, disjoint,
nested and staircase arrangements; `findLaneProblem` returning null at four and
a message at five.

**Agreement test** — decision 7 is a claim about two implementations in two
bundles, and the codebase already has a mechanism for exactly that. The ready
frontier is derived twice, in `src/client/src/lib/graph.js` and
`src/lib/frontier.js`, and the two suites are held together by one table of
cases in `src/shared/frontierFixtures.json`, read by
`src/client/src/lib/graph.frontier.test.js` and `tests/unit/frontier.test.js`.

Notes follow that precedent exactly. A new `src/shared/noteLaneCases.json`
holds one table of note arrangements with, for each, the expected
`maxOverlap` and the expected lane assignment. Two suites read it:

- `src/client/src/lib/noteLanes.fixtures.test.js` — asserts `assignLanes`
  produces the expected lanes, and that it refuses exactly the cases whose
  `maxOverlap` exceeds `MAX_NOTE_LANES`.
- `tests/unit/calendarNoteLanes.test.js` — asserts `maxOverlap` returns the
  expected number and `findLaneProblem` reports on exactly the same cases.

A change to one side that the other does not follow fails on one side of the
app or the other, which is the property decision 7 needs and a single test
spanning both bundles could not give: the client is ESM behind CRA's module
scope and the server is CommonJS under the root Jest config, so no one test can
import both. A shared JSON table can be imported by both, and already is.

**`scheduleGeometry`** — `createDayGeometry` round-trips minutes → px → minutes
at 24 and at a stretched scale; `PX_PER_SLOT_MIN` is the floor.

**`useDayScale`** — returns the floor for a short viewport, a stretched scale
for a tall one, and updates on resize.

**`useCalendarNotes`** — load success and failure; optimistic create with temp-id
reconcile; rollback on each of create, update and delete; `pruneDay`.

**`NotePlane` / `NoteRibbon`** — lanes render in the right order; a refused draft
renders refused and commits nothing; the popover saves, cancels on Escape, and
deletes.

**`routes/calendarNotes`** — ownership 403/404 on every endpoint; validation
rejections; the fifth-note 400 rolls the transaction back; day deletion cascades
notes away.

**Playwright** — create a note by click and by drag, move it to another day,
resize it, delete it, and confirm deleting a day takes its notes with no prompt.

Every existing calendar test must keep passing untouched. Where one asserts on
`70vh` or the 220px column, it is updated; where one asserts on cascade
behaviour, it must not need to change at all — if it does, decision 1 has been
violated.

---

## 13. Build order

Each step leaves the app working.

1. **Schema + repo.** `calendar_notes`, `calendarNotesRepo`, the `calendarNote`
   ownership query, `toCalendarNote`. Nothing renders yet.
2. **`lib/calendarNoteLanes.js`** and its tests.
3. **`routes/calendarNotes.js`** — all four endpoints, with Supertest coverage.
   The API is complete and unused.
4. **`lib/noteLanes.js`** and its tests, including the agreement test against
   step 2.
5. **Scale.** `createDayGeometry`, `useDayScale`, `DayScaleContext`,
   `useResizeEdge`'s `geometry` parameter, and the CSS for §9.1 and §9.2. The
   calendar now fills the page and fits two days, with no notes yet — a
   self-contained, separately reviewable change.
6. **Read-only notes.** `useCalendarNotes` load, `NotePlane`, `NoteRibbon`.
   Notes seeded by hand appear in their lanes.
7. **Create.** `useNoteDraft`, `NotePopover`, the draft ghost, the live refusal.
8. **Move, resize, delete.** The notes droppable, the `useResizeEdge` wiring,
   the popover's Delete.
9. **Day deletion.** `onDayDeleted` / `pruneDay`, and the Playwright pass.
