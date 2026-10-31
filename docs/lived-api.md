# Lived API

Lived moments record what actually happened, one day at a time. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user: nobody sees or changes another user's days.

## The moment object

```json
{
  "id": 41,
  "date": "2026-10-30",
  "startMinutes": 480,
  "durationMinutes": 60,
  "title": "Deep work",
  "category": "work",
  "detail": null,
  "chatTicks": [490, 520]
}
```

| Field | Meaning |
| ----- | ------- |
| `id` | assigned by the server; ids change when a day is replaced |
| `date` | `YYYY-MM-DD` day the moment belongs to |
| `startMinutes` | whole minutes after 00:00 of `date`, from 240 to 1679 |
| `durationMinutes` | whole minutes, at least 1 |
| `title` | trimmed, 1 to 100 characters |
| `category` | one of `god`, `family`, `work`, `building`, `rest`, `sleep`, `drive` |
| `detail` | free text up to 5000 characters, or `null` (default) |
| `chatTicks` | whole minutes on the same scale, up to 500, default `[]`; each must lie within the moment, ends included |

## The 04:00 minute scale

A day runs from 04:00 to 04:00 the next morning. Minutes count from 00:00 of the moment's date, so 04:00 is `240`, noon is `720`, and 01:00 the next morning is `1500`. A moment must start at 240 or later and end by `1680` (04:00 next day): `startMinutes + durationMinutes <= 1680`.

## Overlap

Moments of a day may overlap and need not be sorted or contiguous. The server stores them as sent and does not merge or reject overlaps.

## Endpoints

### PUT /api/lived/days/:date

Body `{ "moments": [ ...moment ] }`, up to 300 moments, with only the fields above (no `id` or `date`; unknown fields are rejected). Replaces the whole day in one transaction: the old moments are deleted and the new ones inserted, or nothing changes. An empty list clears the day. Answers `{ "date": "2026-10-30", "moments": [ ...moment ] }`, ordered by `startMinutes`.

```bash
curl -s -X PUT https://planapp.example.com/api/lived/days/2026-10-30 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"moments":[{"startMinutes":480,"durationMinutes":60,"title":"Deep work","category":"work","chatTicks":[490]}]}'
```

### GET /api/lived?from=&to=

Both `from` and `to` are required `YYYY-MM-DD` dates, `from` not after `to`, spanning at most 62 days. Answers `{ "moments": [ ...moment ] }` for the caller, ordered by `date`, then `startMinutes`.

```bash
curl -s "https://planapp.example.com/api/lived?from=2026-10-29&to=2026-10-31" \
  -H "Authorization: Bearer $TOKEN"
```

### DELETE /api/lived/days/:date

No body. Clears the day. Answers `{ "date": "2026-10-30", "deleted": 3 }` where `deleted` is how many moments were removed (0 for an empty day).

```bash
curl -s -X DELETE https://planapp.example.com/api/lived/days/2026-10-30 \
  -H "Authorization: Bearer $TOKEN"
```

## Errors

| Status | When |
| ------ | ---- |
| 400 | a `:date` that is not a real `YYYY-MM-DD`; a body without a `moments` array or with unknown fields; a moment with a bad field, one that ends after 1680, or a tick outside it; a missing, bad or too wide `from`/`to` range, or `from` after `to`. A rejected PUT leaves the stored day unchanged |
| 401 | no or invalid token |
