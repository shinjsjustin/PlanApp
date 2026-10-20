# Calendar API

Days, bookings and notes. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user. Send an `X-Time-Zone` header (an IANA zone name) so a new day is dated by the caller's local today.

## Rules

- Times are minutes from midnight (08:00 is 480, 14:00 is 840, 23:00 is 1380). Both `startMinutes` and `durationMinutes` are integers.
- Both must be a multiple of 5 (5-minute steps). `startMinutes` is 0 or more.
- `durationMinutes` is at least 15 and at most 1440.
- Bookings must sit between 08:00 and 23:00: `startMinutes` at least 480 and `startMinutes + durationMinutes` at most 1380.
- Bookings on one day may not overlap. Touching (one ends at the minute the next starts) is allowed.
- A to-do or sequence has at most one booking, and may be named only once per request.
- Notes may be at any time of day, but must end by midnight (`startMinutes + durationMinutes` at most 1440), and no more than 4 notes may overlap at once on a day.
- Rows already stored keep their minutes; nothing is migrated.

A broken rule answers 400 with a message.

## Objects

A day:

```json
{ "id": 7, "date": "2026-10-21", "position": 3, "createdAt": "...", "updatedAt": "..." }
```

A to-do booking (a sequence booking has `kind: "sequence"`, `todoId: null`, and `text` equal to the sequence title):

```json
{
  "id": 31, "dayId": 7, "todoId": 88, "text": "Pack the order", "status": "open",
  "projectId": 4, "projectTitle": "Western Digital", "sequenceId": null, "sequenceTitle": null,
  "placeId": null, "startMinutes": 600, "durationMinutes": 60
}
```

A note:

```json
{ "id": 5, "dayId": 7, "text": "Last chance to deliver to Western Digital", "startMinutes": 840, "durationMinutes": 60 }
```

## GET /api/calendar

Answers `{ "days": [day, ...], "items": [booking, ...] }`. Days that had no date are dated first.

## POST /api/calendar/days

Body: none (`{}`). Appends a day to the end of the strip, dated the last date + 1, or today when the strip is empty. Answers 201 with the day.

## PUT /api/calendar/items

Applies one gesture atomically: any failure rolls back everything, including appended days. Body, every field optional:

| Field | Type | Limit |
| ----- | ---- | ----- |
| `appendDays` | integer | 0 or more, at most the number of `placements` |
| `placements` | array | up to 336 |
| `unschedule` | array of to-do ids | up to 336 |
| `unscheduleSequences` | array of sequence ids | up to 336 |

Each placement has `startMinutes` and `durationMinutes`, plus exactly one of `todoId` or `sequenceId`, and exactly one of `dayId` or `dayIndex`. `dayId` names an existing day. `dayIndex` (0 or more) is an index into the owner's day list after the `appendDays` new days are added. All ids must be yours.

A placement creates a booking or moves the existing one for that to-do or sequence. A to-do may not be both in `placements` and in `unschedule`, nor a sequence in `placements` and `unscheduleSequences`.

The request's placements are checked against the rules, then the stored bookings of every touched day are checked for overlap, so a placement that lands on a booking the request never mentioned is refused. Answers the full calendar, as GET /api/calendar does.

After saving, the server re-lays every touched day, in start order. A booking at a different place from the one before it starts no earlier than the previous booking's end plus the drive time (rounded up to 5 minutes), and later bookings are pushed down to follow. The day's first booking with a place also gets a drive from the start place (home), except when it is at the shop (place kind `work`), which gets none. A drive with no known time counts 15 minutes. Bookings with no place get no drive. A push that takes a booking past 23:00 answers 400 and nothing is saved.

Example: home is the start place, to-do 88 is booked 09:00-10:00 at place 12 (a customer), and to-do 89 at the shop (place kind `work`) is booked 10:00-11:00. The drive from 12 to the shop takes 20 minutes, so the saved booking for 89 starts at 10:20. The first booking (place 12, not the shop) also has a drive from home, but 09:00 leaves room after 08:00, so it stays put.

## DELETE /api/calendar/items/:todoId

Releases the to-do's booking. Answers `{ "todoId": 88 }`, or 404 if it has no booking.

## DELETE /api/calendar/items/sequences/:sequenceId

Releases the sequence's booking. Answers `{ "sequenceId": 2 }`, or 404 if it has no booking.

## Notes: /api/calendar/notes

### GET /api/calendar/notes

Answers `{ "notes": [note, ...] }` for every day.

### POST /api/calendar/notes

Body: `dayId`, `text`, `startMinutes`, `durationMinutes`, all required. `text` is trimmed, 1 to 500 characters. Answers 201 with the note.

### PATCH /api/calendar/notes/:id

Body: any of `dayId`, `text`, `startMinutes`, `durationMinutes`; at least one. Sending `dayId` moves the note to that day. The resulting note must still end by midnight and keep the day within 4 overlapping notes. Answers the updated note.

### DELETE /api/calendar/notes/:id

Answers `{ "id": 5 }`.

## Worked example

Book to-do 88 on day 7 from 10:00 to 11:00:

```
PUT /api/calendar/items
{ "placements": [ { "todoId": 88, "dayId": 7, "startMinutes": 600, "durationMinutes": 60 } ] }
```

Book to-do 89 on a day that does not exist yet, by appending one:

```
PUT /api/calendar/items
{ "appendDays": 1, "placements": [ { "todoId": 89, "dayIndex": 3, "startMinutes": 480, "durationMinutes": 30 } ] }
```

Add a note from 14:00 to 15:00 on day 7:

```
POST /api/calendar/notes
{ "dayId": 7, "text": "Last chance to deliver to Western Digital", "startMinutes": 840, "durationMinutes": 60 }
```
