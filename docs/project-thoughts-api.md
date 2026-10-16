# Project thoughts API

One autosaved free-text note per project. Both endpoints need `Authorization: Bearer <token>` and answer `{ data: ... }`.

## GET /api/projects/:id/thoughts

Answers:

```json
{ "projectId": 7, "projectTitle": "Build a drone", "text": "...", "version": 3, "updatedAt": "2026-10-16T12:00:00.000Z" }
```

A project with no thoughts yet answers `text: ""`, `version: 0`, `updatedAt: null`.

## PUT /api/projects/:id/thoughts

Body: `{ "text": string, "version"?: integer >= 0 }`.

- `text` is stored exactly as sent (not trimmed), up to 20000 characters; empty is allowed.
- Answers the same shape as GET, with `version` increased by 1 (a first save gives 1).

### The version rule

- With `version`: it must equal the stored version (0 when nothing is stored). Otherwise the answer is 409, `These thoughts changed elsewhere. Reload to see the latest.`, and nothing is changed.
- Without `version`: the text always replaces what is stored.

Send the `version` from your last GET or PUT to avoid overwriting another writer.

## Errors

| Status | When |
| ------ | ---- |
| 400 | `text` missing, not a string, or over 20000 characters; `version` not an integer >= 0 |
| 401 | no or invalid token |
| 403 | the project belongs to another user |
| 404 | no such project |
| 409 | stale `version` |
