# Shortcuts API

Device tokens let an iOS Shortcut call the API without holding the password or a JWT. Each device gets its own token, which can be revoked on its own. These endpoints manage the tokens; they need `Authorization: Bearer <token>` (the app's JWT) and answer `{ success, data, error }`. A missing or invalid token is a 401. Everything is scoped to the token's user.

## POST /api/device-tokens

Body: `{ "name": "iPhone" }`. `name` is required, 1 to 100 characters. Answers 201:

```json
{ "id": 3, "name": "iPhone", "token": "q1Zr...43 characters...", "createdAt": "2026-10-22T18:30:15.000Z" }
```

`token` is 43 base64url characters and is shown only in this response. The server stores just its sha256 hex, so a lost token cannot be recovered; delete it and create another.

Errors: 400 for a missing, empty or over-long `name`.

## GET /api/device-tokens

No body. Lists the caller's tokens, oldest first. The token and its hash are never returned.

```json
[{ "id": 3, "name": "iPhone", "lastUsedAt": null, "createdAt": "2026-10-22T18:30:15.000Z" }]
```

`lastUsedAt` is a UTC instant, or `null` if the token has never been used.

## DELETE /api/device-tokens/:id

No body. Revokes the caller's token. Answers `{ "id": 3 }`.

Errors: 404 `Device token not found` when the id is missing or belongs to another user.

## POST /api/place-events/:placeId/:event

For a Shortcut's arrive and leave automations. Unlike the endpoints above, this takes a device token, not the app's JWT: `Authorization: Bearer <device token>`. A missing, unknown or revoked token, or a JWT, is a 401. A valid token has its `lastUsedAt` set. No body. `event` is `arrive` or `leave`.

Pushes one message to all of the owner's devices for the open, unsnoozed reminders at that place whose location trigger equals `event`. The body is `Arrived at <place>` or `Leaving <place>`, then one reminder title per line, soonest due first. The push url is `/reminders?place=<placeId>`. Answers:

```json
{ "matched": 2, "sent": 1, "failed": 0, "removed": 0 }
```

`matched` is the number of reminders; with 0, nothing is sent. The location and event are not stored anywhere.

When configured, each accepted event is also forwarded to Bourne as a one-line text, without delaying the answer. See [bourne-place-forward.md](bourne-place-forward.md).

Errors: 400 for an event other than `arrive` or `leave` or a non-numeric `placeId`, 401 for a bad token, 404 `Place not found` when the place is missing or another user's, 503 `Push is not configured`.
