-- Add pinned to-dos support to an existing PlanApp database.
-- Existing to-dos remain unpinned, and calendar bookings are unchanged.
-- Do not run this against a database where the column/index already exist.

ALTER TABLE `todos`
  ADD COLUMN `is_pinned` tinyint(1) NOT NULL DEFAULT '0' AFTER `completed_at`,
  ADD KEY `idx_todos_project_pinned` (`project_id`, `is_pinned`);
