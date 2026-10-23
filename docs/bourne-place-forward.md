# Bourne place forwarding

When a Shortcut reports arriving at or leaving a place, ShinPlan can also tell Bourne, so he knows where Justin is. It is optional and off unless configured. This page is the contract for the Bridge's receiving route (a separate Central idea) and the manual setup on emporium.

## The request

After an accepted `POST /api/place-events/:placeId/:event` (see [shortcuts-api.md](shortcuts-api.md)), the server sends one request and does not wait for it:

```
POST <BOURNE_PLACE_URL>
Authorization: Bearer <BOURNE_PLACE_TOKEN>
Content-Type: application/json

{ "text": "Justin arrived at Gym 18:42" }
```

`text` is the line: `<first name> <arrived at|left> <place name> <HH:MM>`. The name is the owner's first name, or `Justin` when none is set. The time is 24-hour, in `BOURNE_PLACE_TIME_ZONE` (default `America/Los_Angeles`, also used when the value is not a valid zone). Only name, place, verb and time are sent: no coordinates, ids or reminder titles.

The request times out after 3000 ms. Any failure (timeout, network error, non-2xx status) is logged and dropped: it is not retried, and it never slows or fails the place event, which still answers as documented.

## What the Bridge route must do

Modeled on `POST /bourne/prompt` in the Bridge's api.md. The route is built in a separate Central idea.

1. Check the `Authorization: Bearer` token against the shared secret. Tagged tailnet devices carry no `Tailscale-User-Login`, so the token is the only proof of who is calling.
2. Refuse anything else with `403`: a missing or wrong token, a wrong method, or a body without a string `text`.
3. Queue the text with surface `place`, so Bourne reads `[place] <text>`, for example `[place] Justin arrived at Gym 18:42`.
4. Answer `202`.

## Manual setup on emporium

1. Install tailscale on emporium and join the tailnet as a tagged device (for example `tag:emporium`), so the Bridge's tailnet address is reachable and nothing else is exposed.
2. In emporium's `.env`, set the three variables:
   - `BOURNE_PLACE_URL`: the Bridge route's tailnet URL.
   - `BOURNE_PLACE_TOKEN`: the shared secret the Bridge route checks. Generate with `openssl rand -hex 32`.
   - `BOURNE_PLACE_TIME_ZONE`: optional IANA zone for the time in the line.
3. Restart the server so it reads them.

To switch forwarding off, remove `BOURNE_PLACE_URL` or `BOURNE_PLACE_TOKEN` from `.env` and restart. With either missing nothing is sent.
