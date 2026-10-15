-- Remember a hash of the body last sent to Google, so unchanged bookings are
-- skipped on re-export. Null means unknown, so the next export patches it.
-- Do not run this against a database where the column already exists.

ALTER TABLE `google_exports`
  ADD COLUMN `body_hash` char(64) CHARACTER SET ascii NULL AFTER `google_event_id`;
