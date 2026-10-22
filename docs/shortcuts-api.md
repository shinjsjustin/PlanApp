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
