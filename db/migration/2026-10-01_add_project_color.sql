-- Add a per-project card color to an existing PlanApp database.
-- Existing projects get a NULL color, which the client draws as the default.
-- Do not run this against a database where the column already exists.

ALTER TABLE `projects`
  ADD COLUMN `color` CHAR(7) NULL AFTER `description`;
