-- Add an optional multi-line note to every to-do in an existing PlanApp database.
-- Existing to-dos get a NULL note.
-- Do not run this against a database where the column already exists.

ALTER TABLE `todos`
  ADD COLUMN `note` text DEFAULT NULL AFTER `text`;
