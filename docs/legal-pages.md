# Legal pages (IDEA-0019)

The About, Privacy and Terms pages are text in `src/legal/pages.js`, served by Express at `/about`, `/privacy` and `/terms`. They start from `docs/legal-pages-draft.md`; only the sentences below differ.

## Corrections

### 1. Account details (Privacy, "What we collect")

- Old: "Account details: your name, username and a hashed password."
- New: "Account details: your name, email address and a hashed password."
- Why: the `users` table in `src/db/schema.sql` has `name`, `email`, `password` (bcrypt) and no `username` column.

### 2. Google Calendar import (Privacy, "How we use Google user data")

- Old: "ShinPlan reads the events on your primary calendar for the days shown in your ShinPlan calendar, and saves each event's title, location and times so it can display them."
- New: "when you import Google events, ShinPlan reads the events on your primary calendar for the dated days in your ShinPlan calendar, and saves each event's title, location, times and Google event ID so it can display them."
- Why: `src/routes/calendarEvents.js` imports only on request (`POST /api/calendar/events/import`, one day or every dated day) through `listPrimaryEvents`, and saves the Google event ID as well.

### 3. Google Calendar export (same bullet)

- Old: "creates, moves or deletes the events it made"
- New: "creates, updates or deletes the events it made"
- Why: `src/routes/calendarExport.js` creates with `insertEvent`, changes with `patchEvent` and removes with `deleteEvent`; its counts are created, updated and deleted.

### 4. Disconnecting Google (Privacy, "Your choices")

- Old: "You can disconnect Google at any time in ShinPlan's settings; this deletes the stored tokens."
- New: "You can disconnect Google at any time on ShinPlan's calendar page; this asks Google to revoke ShinPlan's access and deletes the stored tokens, but imported event copies, the record of exported events and the events already in your Google Calendar stay until you delete them or ask us to delete your account."
- Why: the Disconnect button is in `src/client/src/components/Calendar/GoogleConnectButton.js` (calendar header, not settings). The disconnect in `src/lib/google/session.js` calls `revokeToken` (best effort) and then removes the token row; it does not delete imported or exported events.

## Before deploy

1. Set `LAST_UPDATED` in `src/legal/lastUpdated.js` to the deploy date, in the format `'22 October 2026'`.
2. Commit the change.

The Privacy and Terms pages show this date as "Last updated".

## Accounts

Signup is closed: `POST /api/auth/register` answers 403. Add accounts by hand: insert a row into `users` with a bcrypt hash in `password` and `access_level` 1.
