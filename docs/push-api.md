# Push API

Registers a device for Web Push and lets Bourne check push and send a test. Every endpoint needs `Authorization: Bearer <token>` and answers `{ success, data, error }`; a missing or invalid token is a 401. Everything is scoped to the token's user.

Push needs `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set on the server. Without all three, push is not configured.

## The push payload

Every push carries this JSON, and the service worker shows it:

```json
{ "title": "ShinPlan", "body": "Push is working", "url": "/reminders" }
```

`title` and `body` are the notification text. `url` is the app path to open when it is tapped.

## GET /api/push/public-key

No body. Answers the key the browser passes to `pushManager.subscribe`:

```json
{ "publicKey": "BEl62..." }
```

Errors: 503 `Push is not configured`.

## POST /api/push/subscriptions

Body: the browser's `PushSubscription` as JSON.

```json
{ "endpoint": "https://push.example.com/abc", "keys": { "p256dh": "...", "auth": "..." } }
```

`endpoint` must be an `https` URL of at most 500 characters. `keys.p256dh` and `keys.auth` are required, 1 to 255 characters. Saving an endpoint that already exists moves it to the caller and updates its keys. Answers 201 `{ "endpoint": "..." }`.

Errors: 400 for an invalid endpoint or missing keys.

## DELETE /api/push/subscriptions

Body: `{ "endpoint": "https://push.example.com/abc" }`. Removes that endpoint only if it belongs to the caller; an endpoint that is not theirs, or not saved, is left alone and still answers 200. Answers `{ "endpoint": "..." }`.

Errors: 400 for a missing or invalid endpoint.

## GET /api/push/status

No body. Answers:

```json
{ "configured": true, "on": true, "devices": 2, "lastSuccessAt": "2026-10-22T18:30:15.000Z" }
```

`configured` is whether the server has its VAPID settings. `devices` is the number of the caller's saved endpoints. `on` is `true` only when `configured` is `true` and `devices` is above 0. `lastSuccessAt` is the latest successful send to any of the caller's devices as a UTC instant, or `null` if none has succeeded.

## POST /api/push/test

No body. Sends the payload `{ "title": "ShinPlan", "body": "Push is working", "url": "/reminders" }` to every device the caller has. Endpoints the push service reports as gone (404 or 410) are removed. Answers:

```json
{ "sent": 1, "failed": 0, "removed": 1 }
```

Errors: 409 `No devices are registered for push` when the caller has no devices, 503 `Push is not configured`.

## When reminders push

The server checks every 60 seconds, only when it is run directly and the VAPID settings are present; otherwise it logs a warning that push is off. For each open reminder with a due date, alert or snooze, it sends to all of the owner's devices:

- At the alert time, or the due time, or 08:00 on the due date in the reminder's time zone when it has no time. The body is the place name or `Reminder due`.
- When a snooze ends, with the body `Snooze ended`.

Reminders that are done, dismissed or still snoozed past their alert send nothing. A push missed in the last 24 hours is sent once; older ones are skipped, as is an alert earlier than the reminder's creation.

Each send is claimed in `push_sends` by reminder, kind and time before it goes out, so a restart or a second run never repeats it. Changing the alert time, or creating the next repeat row, pushes again.
