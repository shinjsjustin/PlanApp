-- Removes pinning. Any to-do or sequence can now be booked on a calendar day, so
-- the pin flags and the pinned lookup index go. Every existing to-do and sequence
-- booking is cleared once, at launch. Calendar notes, calendar events and Google
-- exports are not touched.
-- Runs once, after 2026-10-19_add_sequence_owner.sql. Do not run it again.

DELETE FROM `calendar_items`;

ALTER TABLE `todos`
  DROP INDEX `idx_todos_project_pinned`,
  DROP COLUMN `is_pinned`;

ALTER TABLE `sequences`
  DROP COLUMN `is_pinned`;
