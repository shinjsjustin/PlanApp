-- Add a pin flag to sequences and let calendar bookings point at a sequence.
-- Existing sequences are unpinned; existing bookings keep their to-do.
-- No CHECK that exactly one of todo_id / sequence_id is set: MySQL forbids CHECK
-- constraints on columns used by cascading foreign keys.
-- Do not run this against a database where the columns already exist.

ALTER TABLE `sequences`
  ADD COLUMN `is_pinned` tinyint(1) NOT NULL DEFAULT '0' AFTER `is_collapsed`;

ALTER TABLE `calendar_items`
  MODIFY COLUMN `todo_id` int unsigned DEFAULT NULL,
  ADD COLUMN `sequence_id` int unsigned DEFAULT NULL AFTER `todo_id`,
  ADD UNIQUE KEY `uq_calendar_items_sequence` (`sequence_id`),
  ADD CONSTRAINT `fk_calendar_items_sequence`
    FOREIGN KEY (`sequence_id`) REFERENCES `sequences` (`id`) ON DELETE CASCADE;
