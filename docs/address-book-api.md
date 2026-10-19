# Address Book API

People and the places they are linked to. Every endpoint needs `Authorization: Bearer <token>` and answers `{ data: ... }`. Everything is scoped to the token's user. Nothing is ever sent from the Address Book: no email, call or message goes out, it only stores contacts.

## The person object

```json
{
  "id": 12,
  "name": "Ada Lovelace",
  "company": "Analytical Engines Ltd",
  "role": "Engineer",
  "emails": ["ada@example.com", "ada@work.example.com"],
  "phones": [
    { "label": "mobile", "number": "+1 555 0100" },
    { "label": "office", "number": "+1 555 0101" }
  ],
  "groups": ["client_contact", "friend"],
  "notes": "Prefers mornings.",
  "place": { "id": 3, "name": "Head office", "address": "1 Main St, Springfield" },
  "leemacClientId": "10442",
  "leemacClientName": "Analytical Engines"
}
```

`place` is `null` when the person has no place. Unset `company`, `role`, `notes`, `leemacClientId` and `leemacClientName` are `null`; unset `emails`, `phones` and `groups` are `[]`.

### Fields and limits

Text is trimmed before it is checked. On POST every field except `name` is optional; on PATCH every field is optional but at least one must be sent.

| Field | Type | Limit |
| ----- | ---- | ----- |
| `name` | string | required, 1 to 255 characters |
| `company` | string or null | up to 255 characters |
| `role` | string or null | up to 255 characters |
| `emails` | array of strings | up to 10, each a valid email of up to 255 characters |
| `phones` | array of `{ label, number }` | up to 10; `label` up to 40 characters (may be empty); `number` 1 to 50 characters |
| `groups` | array of strings | no repeats, each one of the six groups below |
| `notes` | string or null | up to 5000 characters |
| `placeId` | integer or null | positive, must be one of your own places |
| `leemacClientId` | string or null | digits only, 1 to 10 digits |
| `leemacClientName` | string or null | up to 255 characters |

Responses return `place` (an object) instead of `placeId`.

Duplicate emails are allowed: the same address may appear on several people, or twice on one. Nothing is checked for uniqueness.

### Groups

`family`, `friend`, `client_contact`, `supplier`, `church`, `other`.

## GET /api/people

Query parameters, both optional:

- `q`: up to 255 characters. Keeps people whose name or company contains it (case-insensitive substring).
- `group`: one of the six groups. Keeps people in that group.

Answers `{ "people": [person, ...] }` ordered by name, then id.

## GET /api/people/:id

Answers one person.

## POST /api/people

Body: the fields above. Answers 201 with the new person.

## PATCH /api/people/:id

Body: any of the fields above. Only the fields sent change; arrays and `placeId` are replaced whole, and `placeId: null` clears the place. Answers the updated person.

## DELETE /api/people/:id

Answers `{ "id": 12 }`.

## The place object

```json
{ "id": 3, "name": "Head office", "address": "1 Main St, Springfield", "kind": "client", "notes": null, "visitMinutes": 60, "isDefaultStart": false }
```

| Field | Type | Limit |
| ----- | ---- | ----- |
| `name` | string | required on POST, 1 to 255 characters |
| `address` | string | required on POST, 1 to 500 characters |
| `kind` | string | `home`, `work`, `client`, `church`, `supplier` or `other` |
| `notes` | string or null | no limit set |
| `visitMinutes` | integer or null | 30 to 720, a multiple of 30 |

## GET /api/places

Optional query `q` (up to 255 characters) keeps places whose name contains it (case-insensitive). Answers:

```json
{ "places": [place, ...], "startPlaceId": 5 }
```

`startPlaceId` is where a day starts: the place marked `isDefaultStart`, else the lowest-id `home`, else `null`. It is found among all places, even when `q` filters the list.

## POST /api/places

Body: `name`, `address`, and optionally `kind`, `notes`, `visitMinutes`. Answers 201 with the new place.

## PATCH /api/places/:id

Body: any of `name`, `address`, `kind`, `notes`, `visitMinutes`, plus `isDefaultStart` (boolean). At least one field is required. `isDefaultStart: true` makes this the start place; `false` clears the mark. Answers the updated place.

## DELETE /api/places/:id

Answers `{ "id": 3 }`. People linked to the place are kept and their `place` becomes `null`.

## Errors

| Status | When |
| ------ | ---- |
| 400 | a field is missing, the wrong type or over its limit; an unknown `group`, `kind` or bad query value; a PATCH with no fields; a bad `:id` |
| 401 | no or invalid token |
| 403 | the person or place belongs to another user, including a `placeId` that is not yours |
| 404 | no such person or place |
