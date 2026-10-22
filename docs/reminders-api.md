# Reminders API

Reminders, their subcategories, and the one-off script that fills them from a project. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user. Nothing is ever sent: no push, email or message goes out, a reminder only stores what is due and when.

Send `X-Time-Zone: <IANA zone>` (for example `America/Los_Angeles`) on every request that creates a reminder. A missing or invalid header falls back to the server's own zone.

## The reminder object

```json
{
  "id": 41,
  "title": "Drop off paperwork",
  "place": { "id": 3, "label": "Head office" },
  "subcategory": { "id": 7, "label": "Front desk" },
  "person": { "id": 12, "label": "Ada Lovelace" },
  "project": null,
  "todo": null,
  "dueDate": "2026-11-03",
  "dueTime": "09:30",
  "timeZone": "America/Los_Angeles",
  "alertAt": "2026-11-03T16:00:00.000Z",
  "trigger": "arrive",
  "priority": "high",
  "status": "open",
  "snoozedUntil": null,
  "closedAt": null,
  "repeat": { "rule": "weekly", "every": null, "weekdays": ["mon", "thu"] },
  "createdAt": "2026-10-22T18:00:00.000Z",
  "updatedAt": "2026-10-22T18:00:00.000Z",
  "overdue": false
}
```

`place`, `subcategory`, `person`, `project` and `todo` are `{ id, label }` or `null` when unlinked. `label` is the place, subcategory or person name, the project title, or the to-do text. Links are cleared to `null` (the reminder is kept) when the thing they point at is deleted. A place's `address` can be `null`, so do not assume one exists.

`dueDate`, `dueTime` and `alertAt` are `null` when unset. `snoozedUntil` and `closedAt` are `null` until set. `repeat.every` is `null` unless the rule is `every_n_days`; `repeat.weekdays` is `[]` unless the rule is `weekly`.

### Fields and limits

Text is trimmed before it is checked. On POST every field except `title` is optional; on PATCH every field is optional but at least one must be sent. `status`, `snoozedUntil`, `closedAt`, `timeZone`, `overdue` and the timestamps cannot be written directly: use the action endpoints below.

| Field | Type | Limit |
| ----- | ---- | ----- |
| `title` | string | required, 1 to 500 characters |
| `placeId` | integer or null | positive, must be one of your own places |
| `subcategoryId` | integer or null | positive, must be yours and belong to the same place; needs `placeId` |
| `personId` | integer or null | positive, must be one of your own people |
| `projectId` | integer or null | positive, must be one of your own projects |
| `todoId` | integer or null | positive, must be one of your own to-dos |
| `dueDate` | string or null | `YYYY-MM-DD`, a real calendar date |
| `dueTime` | string or null | 24-hour `HH:MM`; needs `dueDate` |
| `alertAt` | string or null | ISO 8601 with an offset, for example `2026-11-03T16:00:00Z` |
| `trigger` | string | `none`, `arrive` or `leave` (default `none`) |
| `priority` | string | `normal` or `high` (default `normal`) |
| `repeat` | object | `{ rule, every?, weekdays? }`, see Repeats |

Responses return `place`, `subcategory`, `person`, `project` and `todo` (objects) instead of the `...Id` fields.

On PATCH, `repeat` is replaced whole. Changing `placeId` clears `subcategoryId` unless the subcategory belongs to the new place, and sending a `subcategoryId` that does not fit the place is a 400.

## Due date, time and alert

A reminder's `dueDate` and `dueTime` are wall-clock values in the reminder's own `timeZone`, the zone from `X-Time-Zone` when it was created. They carry no offset: `dueTime: "09:30"` means 09:30 where the reminder was made. `dueTime` alone never exists; it needs a `dueDate`. A reminder with a date and no time is due for the whole day.

`alertAt` is different: it is a single instant, always returned in UTC (`...Z`). If you send `2026-11-03T09:00:00-07:00` it is stored and returned as `2026-11-03T16:00:00.000Z`. It is independent of `dueDate` and `dueTime`, so changing one does not move the other. `snoozedUntil` and `closedAt` are UTC instants too.

## Overdue

`overdue` is computed on every response, in the reminder's `timeZone`, and is never stored:

- `false` unless `status` is `open` and `dueDate` is set.
- With no `dueTime`, it is `true` once `dueDate` is before today.
- With a `dueTime`, it is `true` from that time on the due date, and any time after.

A snoozed reminder is still `open`, so it can be `overdue` while snoozed. Done and dismissed reminders are never overdue.

## Repeats

`repeat.rule` is one of:

| Rule | Next date | Needs |
| ---- | --------- | ----- |
| `none` | no next reminder | |
| `daily` | the day after `dueDate` | |
| `every_n_days` | `dueDate` plus `every` days | `every`, an integer from 1 to 365 |
| `weekly` | the next day after `dueDate` that is in `weekdays` | `weekdays`, at least one of `mon` to `sun`, no repeats |
| `monthly` | the same day next month, clamped to the month's last day (31 Jan becomes 28 Feb) | |

Any rule other than `none` requires a `dueDate`. The next date always counts from the reminder's `dueDate`, not from today, so finishing late keeps the cadence.

Marking a repeating reminder done creates the next one (see `done`). It is a new reminder with its own id, status `open` and the same title, links, `dueTime`, `timeZone`, `trigger`, `priority` and repeat. Its `alertAt` moves by the same number of days, keeping the same local clock time in the reminder's zone. Dismissing never creates a next reminder.

## Snoozing

Snoozing hides an open reminder until a time. `snoozedUntil` is set by `snooze`; the status stays `open`. While `snoozedUntil` is in the future the reminder is left out of the default list and appears under `status=snoozed`. Once that instant passes it returns to the open list by itself, and nothing has to be cleared. Marking it done or dismissed clears `snoozedUntil`.

## GET /api/reminders

Query parameters, all optional:

- `placeId`: a positive integer for one place, or `none` for reminders with no place.
- `status`: `open` (default), `snoozed`, `history` or `all`.
  - `open`: status open and not currently snoozed.
  - `snoozed`: status open and `snoozedUntil` still in the future.
  - `history`: done and dismissed.
  - `all`: everything.
- `sort`: `due` (default), `place`, `subcategory` or `created`.
  - `due`: by `dueDate`, then `dueTime`, then id. Reminders with no date come last.
  - `place`: by place name, then due. No place comes last.
  - `subcategory`: by place name, then subcategory name, then due. Nulls come last.
  - `created`: newest first.
- `from`, `to`: `YYYY-MM-DD`, inclusive bounds on `dueDate`. Reminders with no `dueDate` are excluded when either is given. `from` must not be after `to`.

Answers `{ "reminders": [reminder, ...] }`.

## POST /api/reminders

Body: the fields above. Answers 201 with the new reminder, with `timeZone` taken from `X-Time-Zone`.

## GET /api/reminders/:id

Answers one reminder.

## PATCH /api/reminders/:id

Body: any of the fields above. Only the fields sent change. A `...Id` of `null` clears that link, and `dueDate: null` clears the date. The result must still be valid, for example clearing `dueDate` on a reminder that has a `dueTime` or a repeat is a 400. Answers the updated reminder.

## DELETE /api/reminders/:id

Answers `{ "id": 41 }`.

## POST /api/reminders/:id/done

No body. The reminder must be `open`. Sets `status` to `done`, `closedAt` to now and clears `snoozedUntil`. If it repeats and has a next date, the next reminder is created in the same step. Answers:

```json
{ "reminder": reminder, "next": reminder }
```

`next` is `null` when the rule is `none` or there is no next date.

## POST /api/reminders/:id/dismiss

No body. The reminder must be `open`. Sets `status` to `dismissed`, `closedAt` to now and clears `snoozedUntil`. Never creates a next reminder. Answers `{ "reminder": reminder, "next": null }`.

## POST /api/reminders/:id/snooze

Body: `{ "until": "2026-10-23T15:00:00Z" }`, ISO 8601 with an offset, and it must be in the future. The reminder must be `open`. Answers the updated reminder with `snoozedUntil` set. Snoozing an already snoozed reminder replaces the time.

## POST /api/reminders/:id/reopen

No body. The reminder must be `done` or `dismissed`. Sets `status` back to `open` and clears `closedAt`. Answers the updated reminder. A next reminder already created by `done` is not removed.

## The subcategory object

```json
{ "id": 7, "placeId": 3, "name": "Front desk" }
```

A subcategory belongs to one of your places, and a name appears once per place. Deleting a subcategory keeps its reminders and clears their `subcategory`.

| Field | Type | Limit |
| ----- | ---- | ----- |
| `placeId` | integer | required on POST, positive, must be one of your own places; cannot be changed |
| `name` | string | required, trimmed, 1 to 100 characters |

## GET /api/reminder-subcategories

Optional query `placeId` (a positive integer) keeps one place's subcategories. Answers `{ "subcategories": [subcategory, ...] }`.

## POST /api/reminder-subcategories

Body: `placeId`, `name`. Answers 201 with the new subcategory.

## PATCH /api/reminder-subcategories/:id

Body: `name`. Answers the updated subcategory.

## DELETE /api/reminder-subcategories/:id

Answers `{ "id": 7 }`.

## Errors

| Status | When |
| ------ | ---- |
| 400 | a field is missing, the wrong type or over its limit; a bad `status`, `sort`, `trigger`, `priority`, `repeat` or date; `from` after `to`; a PATCH with no fields; a bad `:id`; `dueTime` or a repeat with no `dueDate`; a `weekly` repeat with no `weekdays`; `every_n_days` with `every` outside 1 to 365; `subcategoryId` with no place or on a different place; `until` not in the future |
| 401 | no or invalid token |
| 403 | the reminder, subcategory or a linked place, person, project or to-do belongs to another user |
| 404 | no such reminder or subcategory |
| 409 | done, dismiss or snooze on a reminder that is not open; reopen on one that is open; a subcategory name that the place already has |

## Setting up reminders: scripts/setupReminders.js

A one-off script Justin runs on the server after deploy. It turns a project's open to-dos into reminders, then deletes the project. Bourne does not run it. It reads and writes the `planapp` database directly, so run it from the repo root with the production `.env`.

What it does:

1. Loads the project (default id 28) with its sequences and to-dos.
2. Plans the places to create: any of Home, Leemac, Church, Western Digital, Seagate, Bloom shipping and Bloom HQ that you do not already have (matched by name, ignoring case). New places have no address (`address` is `null`) and kind `home`, `work` or `church` for those three names, else `other`.
3. Plans one reminder per to-do that is not `complete`. The title is the to-do text, the place is the to-do's place or else its sequence's place, and the due date is the next occurrence (today included) of a weekday named in the sequence title or the to-do text, or none.
4. Plans deleting the project.

### Dry run first

```bash
node scripts/setupReminders.js
```

With no `--apply` nothing is written. It prints the plan as JSON (`placesToCreate`, `remindersToCreate`, `projectToDelete`). Check it before going further.

### Apply

```bash
node scripts/setupReminders.js --apply --backup=/path/to/project-28-backup.json
```

`--apply` writes the plan. It refuses to run without `--backup`. The backup file is written first, holding the project, its sequences and its to-dos as JSON, and then places, reminders and the project deletion happen in one transaction, so a failure changes nothing.

### Flags

| Flag | Meaning |
| ---- | ------- |
| `--apply` | write the plan instead of only printing it; needs `--backup` |
| `--backup=PATH` | file to save the project, sequences and to-dos to before anything is changed |
| `--project=ID` | project to convert; defaults to 28 |
| `--time-zone=ZONE` | IANA zone used to decide what "today" is and stored as each reminder's `timeZone`; defaults to the zone of the machine running the script |

Exits non-zero and prints the message if the project does not exist or `--apply` has no `--backup`. Running `--apply` twice fails the second time because the project is gone; restore from the backup file if a re-run is needed.
