# Rhythm API

Rhythm holds the daily anchors (a time and weekdays) and the gates (a window with a state) that Bourne and the ShinPlan page share. Every endpoint needs `Authorization: Bearer <token>` (Justin's JWT) and answers `{ data: ... }`. Everything is scoped to the token's user: nobody sees or changes another user's items.

Items are addressed by an external id the caller chooses (`wake`, `gate-2026-11-01`). Every instant is UTC, an ISO string ending in `Z` with milliseconds.

## The anchor object

```json
{
  "id": "wake",
  "title": "Wake",
  "description": null,
  "time": "06:30",
  "days": "daily",
  "enabled": true,
  "updatedAt": "2026-11-01T12:00:00.000Z",
  "updatedBy": "bourne"
}
```

| Field | Meaning |
| ----- | ------- |
| `id` | external id, 1 to 64 characters of letters, digits and `. : -` |
| `title` | trimmed, 1 to 100 characters |
| `description` | up to 200 characters, or `null` |
| `time` | `HH:MM`, 24 hour, in the user's time zone |
| `days` | `"daily"` or a non-empty list of unique `mon` `tue` `wed` `thu` `fri` `sat` `sun`; all seven read back as `"daily"` |
| `enabled` | `true` or `false`; defaults to `true` on PUT |
| `updatedAt` | when the item last changed in content |
| `updatedBy` | `bourne` for PUT and DELETE, `justin` for PATCH |

## The gate object

```json
{
  "id": "g1",
  "title": "Plan the week",
  "kind": "plan",
  "opensAt": "2026-11-01T10:00:00.000Z",
  "closesAt": "2026-11-01T12:00:00.000Z",
  "state": "open",
  "hubUrl": null,
  "updatedAt": "2026-11-01T09:00:00.000Z",
  "updatedBy": "bourne"
}
```

| Field | Meaning |
| ----- | ------- |
| `id` | external id, same rules as an anchor |
| `title` | trimmed, 1 to 150 characters |
| `kind` | one of `game_plan`, `plan`, `problem_phase`, `content` |
| `opensAt`, `closesAt` | ISO instants with `Z` or an offset; `closesAt` must be after `opensAt` |
| `state` | one of `open`, `held`, `green`, `assumed`, `rejected` |
| `hubUrl` | an http(s) link up to 500 characters, or `null` |
| `updatedAt`, `updatedBy` | as for anchors |

Writing identical content again leaves `updatedAt` and `updatedBy` as they were, so a repeat PUT is not an echo.

## Endpoints

### GET /api/rhythm

Answers `{ "timeZone": "America/Chicago", "anchors": [ ...anchor ], "gates": [ ...gate ] }`. `timeZone` is `null` until set. Anchors are ordered by time, gates by `opensAt`.

```bash
curl -s https://planapp.example.com/api/rhythm -H "Authorization: Bearer $TOKEN"
```

### PUT /api/rhythm/zone

Body `{ "timeZone": "America/Chicago" }`, an IANA zone name. Answers `{ "timeZone": "America/Chicago" }`.

```bash
curl -s -X PUT https://planapp.example.com/api/rhythm/zone \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"timeZone":"America/Chicago"}'
```

### PUT /api/rhythm/anchors/:id

Creates or fully replaces the anchor with that external id, recorded as `updatedBy: "bourne"`. Body has `title`, `description`, `time`, `days` and optionally `enabled`; unknown fields are rejected. Answers `{ "anchor": { ... }, "created": true }`, `created` being `false` for an update.

```bash
curl -s -X PUT https://planapp.example.com/api/rhythm/anchors/wake \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Wake","description":null,"time":"06:30","days":"daily"}'
```

### PUT /api/rhythm/gates/:id

Creates or fully replaces the gate, recorded as `updatedBy: "bourne"`. Body has `title`, `kind`, `opensAt`, `closesAt`, `state`, `hubUrl`. Answers `{ "gate": { ... }, "created": true }`.

```bash
curl -s -X PUT https://planapp.example.com/api/rhythm/gates/g1 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Plan the week","kind":"plan","opensAt":"2026-11-01T10:00:00Z","closesAt":"2026-11-01T12:00:00Z","state":"open","hubUrl":null}'
```

### PATCH /api/rhythm/anchors/:id

The page's edit. Body has at least one of `time`, `days`, `enabled`; nothing else is allowed. Saves as `updatedBy: "justin"` and answers `{ "anchor": { ... } }`. An unknown id is 404.

```bash
curl -s -X PATCH https://planapp.example.com/api/rhythm/anchors/wake \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"time":"07:30","days":["mon","wed"],"enabled":false}'
```

### DELETE /api/rhythm/anchors/:id and /api/rhythm/gates/:id

No body. Removes the item, recorded as deleted by `bourne`, and answers `{ "id": "wake", "deleted": true }`. An unknown id is 404. Putting the id again later revives it and drops its deletion record.

```bash
curl -s -X DELETE https://planapp.example.com/api/rhythm/anchors/wake \
  -H "Authorization: Bearer $TOKEN"
```

### GET /api/rhythm/changes?since=

`since` is a required ISO instant, normally the last `cursor`. Answers:

```json
{
  "cursor": "2026-11-01T12:00:05.123Z",
  "timeZone": "America/Chicago",
  "anchors": [ ...anchors changed after since ],
  "gates": [ ...gates changed after since ],
  "deleted": [
    { "kind": "gate", "id": "g1", "deletedAt": "2026-11-01T12:00:00.000Z", "deletedBy": "bourne" }
  ],
  "resync": false
}
```

`kind` is `anchor` or `gate`. Deletion records are kept 30 days; when `since` is older than that, `resync` is `true` and the caller should discard its copy and read `GET /api/rhythm`.

```bash
curl -s "https://planapp.example.com/api/rhythm/changes?since=2026-11-01T12:00:00.000Z" \
  -H "Authorization: Bearer $TOKEN"
```

## The sync loop

1. First run: call `GET /api/rhythm`, store the items, and take the starting `since` as the current time.
2. Store the `cursor` from each response.
3. On each tick call `GET /api/rhythm/changes?since=<cursor>`.
4. If `resync` is `true`, call `GET /api/rhythm`, replace the local copy, and store a new cursor from the next changes call.
5. Otherwise apply `anchors` and `gates` as upserts by `id`, remove every `deleted` entry by `kind` and `id`, and store the new `cursor`.
6. Skip any returned item whose `updatedBy` is `bourne`: that is your own write echoed back. Items with `updatedBy: "justin"` are the page's edits and must be applied.

The cursor is read before the rows, so a change landing mid-request comes back again on the next call rather than being missed. Apply upserts idempotently.

## Errors

| Status | When |
| ------ | ---- |
| 400 | a bad `:id`; a body with a bad or unknown field, an empty PATCH, a gate closing before it opens; an unknown `timeZone`; a missing or malformed `since`. Nothing is changed |
| 401 | no or invalid token |
| 404 | PATCH or DELETE of an id the caller does not have, including another user's |
