# Chores API

> **Days count in the zone of the `X-Time-Zone` header (for example `America/Los_Angeles`). Without a valid header they count in UTC, the server's zone.**

Recurring household chores, each with a window of days after it was last done. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user. Send `X-Time-Zone` on every request: it decides what "today" is for `status`, `daysSince`, `urgency`, the default date of a done-mark, and the future-date check. A missing or invalid header falls back to UTC.

## The chore object

```json
{
  "id": 12,
  "name": "Clean bathrooms",
  "area": "Bathroom",
  "window": { "min": 7, "max": 10 },
  "notes": null,
  "archived": false,
  "archivedAt": null,
  "lastDone": { "on": "2026-10-20", "by": "Jacklin" },
  "createdAt": "2026-10-01T18:00:00.000Z",
  "updatedAt": "2026-10-20T18:00:00.000Z",
  "status": "due",
  "daysSince": 11,
  "urgency": 1.1,
  "dueFrom": "2026-10-27",
  "dueBy": "2026-10-30"
}
```

| Field | Meaning |
| ----- | ------- |
| `name` | unique per user, archived chores included |
| `area` | free text such as `Kitchen`, or `null` |
| `window` | `{ min, max }` days after the last done-mark; the chore is wanted between them |
| `notes` | free text or `null` |
| `archived`, `archivedAt` | `archivedAt` is a UTC instant, `null` while active |
| `lastDone` | `{ on, by }` from the latest done-mark (highest `on`, then newest), or `null` if never done. `on` is `YYYY-MM-DD` |
| `status` | `overdue`, `due`, `upcoming` or `never`, see below |
| `daysSince` | whole days from `lastDone.on` to today, or `null` when `never` |
| `urgency` | `daysSince / window.max` rounded to 2 places, or `null` when `never`. Above 1 means overdue |
| `dueFrom` | `lastDone.on` plus `window.min` days, or `null` when `never` |
| `dueBy` | `lastDone.on` plus `window.max` days, or `null` when `never` |
| `createdAt`, `updatedAt` | UTC instants |

### Status

| Status | When |
| ------ | ---- |
| `never` | the chore has no done-mark |
| `upcoming` | `daysSince` is below `window.min`: not yet wanted |
| `due` | `daysSince` is from `window.min` to `window.max` inclusive |
| `overdue` | `daysSince` is above `window.max` |

Status is computed on every response and never stored. Archived chores still carry a status.

## The log object

A log is one done-mark.

```json
{ "id": 90, "choreId": 12, "on": "2026-10-20", "by": "Jacklin", "createdAt": "2026-10-20T18:00:00.000Z" }
```

`on` is the `YYYY-MM-DD` day it was done. `by` is a plain name such as `Justin` or `Jacklin`, not a link to a user: nothing checks it against any account.

## Fields and limits

Text is trimmed before it is checked. On POST only `name` and `window` are required; on PATCH every field is optional but at least one must be sent.

| Field | Type | Limit |
| ----- | ---- | ----- |
| `name` | string | required, 1 to 100 characters |
| `area` | string or null | up to 50 characters; blank or null clears it |
| `window` | object | required, `{ min, max? }`, whole numbers 1 to 365; `max` defaults to `min`; `min` must not exceed `max` |
| `notes` | string or null | up to 2000 characters; blank or null clears it |

On PATCH, `window` is replaced whole.

## Sort order

Active lists are sorted by urgency:

1. By status: `overdue`, then `due`, then `upcoming`, then `never`.
2. `overdue`, `due` and `upcoming`: highest `urgency` first, ties by `name`.
3. `never`: smallest `window.max` first, then smallest `window.min`, then `name`.

Archived lists are sorted by `name`.

## Endpoints

### GET /api/chores

Query `archived=true|false` (default `false`). Answers `{ "chores": [ ...chore ] }`, sorted as above.

### POST /api/chores

Body `{ name, window, area?, notes? }`. Answers 201 with the chore.

### GET /api/chores/:id

Answers the chore.

### PATCH /api/chores/:id

Body with any of `name`, `area`, `window`, `notes`. Answers the chore.

### POST /api/chores/:id/archive

No body. Answers the chore with `archived: true`. Archived chores leave the default list and cannot be marked done.

### POST /api/chores/:id/restore

No body. Answers the chore with `archived: false`.

### POST /api/chores/:id/done

Body `{ on?, by? }` (may be empty). `on` is `YYYY-MM-DD`, defaults to today in the request's zone, and may not be after today. `by` is 1 to 50 characters and defaults to `Justin`. Answers 201 with `{ "log": ...log, "chore": ...chore }`, the chore as updated by the new mark.

### GET /api/chores/:id/logs

Answers `{ "logs": [ ...log ] }`, newest `on` first, ties newest log first.

### PATCH /api/chores/:id/logs/:logId

Body with `on` and/or `by`, same rules as done; at least one is required. The log must belong to the chore in the path. Answers `{ "log": ...log, "chore": ...chore }`.

### DELETE /api/chores/:id/logs/:logId

No body. Answers `{ "id": <logId>, "chore": ...chore }`, with `lastDone` and `status` recomputed.

### POST /api/chores/seed

No body. Creates the 12 starter chores (for example Clean bathrooms 7 to 10 days, Take out trash 3 to 7) that you do not already have; names match ignoring case and surrounding spaces, archived chores included. Safe to repeat. Answers `{ "created": [ ...chore ], "skipped": [ "name", ... ] }`; `skipped` holds the starter names you already had.

## Errors

| Status | When |
| ------ | ---- |
| 400 | a field is missing, the wrong type or over its limit; `window` outside 1 to 365 or `min` above `max`; a bad `archived`; a PATCH with no fields; a bad `on` or a future `on`; a bad `:id` or `:logId` |
| 401 | no or invalid token |
| 403 | the chore belongs to another user |
| 404 | no such chore, or no such log under that chore |
| 409 | a chore name you already have (create or edit); done on an archived chore |

## Listing what is due

For the morning paper, list active chores and keep the ones to show. The list is already sorted most urgent first, so `overdue` and `due` come before everything else.

```bash
curl -s https://planapp.example.com/api/chores \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Time-Zone: America/Los_Angeles"
```

Keep entries whose `status` is `overdue` or `due`. `dueBy` is the last day each is on time. Chores with status `never` have never been done; treat them separately.
