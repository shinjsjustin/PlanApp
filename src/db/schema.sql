-- PlanApp schema (design spec sections 4.1 and 4.2).
--
-- Runnable top-to-bottom against a fresh `planapp` schema, and re-runnable: the
-- teardown block below drops every table first, in reverse dependency order.
--
-- WARNING: the teardown is destructive. Running this file against a database
-- that already holds data will delete that data, including user accounts. To
-- carry an existing scaffold database forward instead, rename the table by hand:
--   RENAME TABLE `admin` TO `users`;
-- and then run only the CREATE statements from `projects` downwards.
--
-- A database created before the sequence-card redesign is missing two columns.
-- Add them in place rather than re-running this file:
--   ALTER TABLE `sequences` ADD COLUMN `is_collapsed` tinyint(1) NOT NULL DEFAULT '0' AFTER `is_blocked`;
--   ALTER TABLE `todos`     ADD COLUMN `completed_at` timestamp NULL DEFAULT NULL AFTER `status`;
--   UPDATE `todos` SET `completed_at` = `updated_at` WHERE `status` = 'complete';
--
-- A database created before the calendar page is missing two tables. Add them in
-- place rather than re-running this file: copy the two CREATE TABLE statements
-- for `calendar_days` and `calendar_items` from the bottom of this file and run
-- those alone.
--
-- A database created before the calendar notes pass is missing one table. Add it
-- in place rather than re-running this file: copy the CREATE TABLE statement for
-- `calendar_notes` from the bottom of this file and run it alone.
--
-- Apply with:
--   mysql -u <user> -p <database> < src/db/schema.sql

-- -- Teardown ---------------------------------------------------------------
DROP TABLE IF EXISTS `calendar_notes`;
DROP TABLE IF EXISTS `calendar_items`;
DROP TABLE IF EXISTS `calendar_days`;
DROP TABLE IF EXISTS `sequence_edges`;
DROP TABLE IF EXISTS `todos`;
DROP TABLE IF EXISTS `sequences`;
DROP TABLE IF EXISTS `layers`;
DROP TABLE IF EXISTS `projects`;
DROP TABLE IF EXISTS `users`;

-- -- users -----------------------------------------------------------------
-- Renamed from the scaffold's `admin` table; columns are unchanged.
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `access_level` tinyint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB;

-- -- projects --------------------------------------------------------------
-- Every other table cascades from here, and this table cascades from `users`.
CREATE TABLE `projects` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id` int unsigned NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_projects_owner` (`owner_id`),
  CONSTRAINT `fk_projects_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- layers ----------------------------------------------------------------
-- `position` is dense (0..n-1), ordered top to bottom on the canvas.
CREATE TABLE `layers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `title` varchar(255) NOT NULL DEFAULT 'Untitled layer',
  `position` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_layers_project_position` (`project_id`, `position`),
  CONSTRAINT `fk_layers_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- sequences -------------------------------------------------------------
-- `position` is dense (0..n-1) left to right within the layer. Only `is_blocked`
-- is persisted; the rest of a sequence's status is derived (spec section 4.3).
--
-- `is_collapsed` is card chrome rather than status: whether this card is folded
-- shut on the canvas. It is stored so a folded card stays folded across a
-- reload and across the owner's devices, which a browser-local note could not do.
CREATE TABLE `sequences` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `layer_id` int unsigned NOT NULL,
  `title` varchar(255) NOT NULL DEFAULT 'Untitled sequence',
  `description` text DEFAULT NULL,
  `is_blocked` tinyint(1) NOT NULL DEFAULT '0',
  `is_collapsed` tinyint(1) NOT NULL DEFAULT '0',
  `position` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sequences_layer_position` (`layer_id`, `position`),
  KEY `idx_sequences_project` (`project_id`),
  CONSTRAINT `fk_sequences_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sequences_layer`
    FOREIGN KEY (`layer_id`) REFERENCES `layers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- todos -----------------------------------------------------------------
-- `sequence_id IS NULL` means unorganized: the unorganized panel is a query, not a
-- separate table. The FK is ON DELETE SET NULL so deleting a sequence returns
-- its to-dos to that panel rather than destroying them.
--
-- `completed_at` is when this to-do last became complete, and NULL whenever it
-- is not. It is stamped by `todosRepo.update` on the transition rather than sent
-- by a client, and cleared when a to-do is un-ticked. `updated_at` cannot stand
-- in for it: renaming or reordering a finished to-do moves that column too.
CREATE TABLE `todos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `sequence_id` int unsigned DEFAULT NULL,
  `text` varchar(500) NOT NULL,
  `status` enum('incomplete','complete','blocked') NOT NULL DEFAULT 'incomplete',
  `completed_at` timestamp NULL DEFAULT NULL,
  `position` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_todos_project_sequence_position` (`project_id`, `sequence_id`, `position`),
  KEY `idx_todos_sequence` (`sequence_id`),
  CONSTRAINT `fk_todos_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_todos_sequence`
    FOREIGN KEY (`sequence_id`) REFERENCES `sequences` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -- sequence_edges --------------------------------------------------------
-- "parent must finish before child can start". Edges are strictly downward, so
-- the graph is acyclic by construction and needs no cycle detection.
CREATE TABLE `sequence_edges` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `parent_id` int unsigned NOT NULL,
  `child_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sequence_edges_parent_child` (`parent_id`, `child_id`),
  KEY `idx_sequence_edges_project` (`project_id`),
  KEY `idx_sequence_edges_child` (`child_id`),
  CONSTRAINT `fk_sequence_edges_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sequence_edges_parent`
    FOREIGN KEY (`parent_id`) REFERENCES `sequences` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sequence_edges_child`
    FOREIGN KEY (`child_id`) REFERENCES `sequences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- calendar_days ---------------------------------------------------------
-- A day is an ordered container spanning a full 24 hours, not a calendar date
-- (design 2026-09-09, decision 2). `position` is dense 0..n-1, left to right.
-- It hangs off the user rather than off a project: the calendar's whole purpose
-- is drawing work from every project at once.
CREATE TABLE `calendar_days` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`   int unsigned NOT NULL,
  `position`   int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_days_owner_position` (`owner_id`, `position`),
  CONSTRAINT `fk_calendar_days_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- calendar_items --------------------------------------------------------
-- One booking: a to-do placed in a day at a start time for a duration, both in
-- integer minutes from midnight rather than as clock strings.
--
-- `uq_calendar_items_todo` is load-bearing. It makes "a to-do is booked at most
-- once" a fact of the database rather than a convention the client is trusted to
-- keep, which is what lets a scheduled row in the pool be inert rather than
-- needing to reason about N bookings (design decision 4).
--
-- Both foreign keys cascade on delete, and each one buys a behaviour:
--   - day_id  — deleting a day releases its bookings and touches no to-do.
--   - todo_id — deleting a to-do on the project page unschedules it here, with
--               no cross-page bookkeeping.
CREATE TABLE `calendar_items` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `todo_id`          int unsigned NOT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_calendar_items_todo` (`todo_id`),
  KEY `idx_calendar_items_day_start` (`day_id`, `start_minutes`),
  CONSTRAINT `fk_calendar_items_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_calendar_items_todo`
    FOREIGN KEY (`todo_id`) REFERENCES `todos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- calendar_notes --------------------------------------------------------
-- Unplanned context for a day: a train journey, being on call, the kids being
-- home. A note is not work, and the difference is the whole design — notes do
-- not cascade, do not spill, and never move a booking (design 2026-09-16,
-- decision 1).
--
-- What is absent matters as much as what is here:
--
--   - No `lane`. Which of the four vertical tracks a note is drawn in is
--     derived from the day's notes on every render (decision 5). Stored, it
--     would be a second truth with nothing keeping it honest: deleting a note
--     would leave a hole no sibling could fill until something rewrote them all.
--   - No `owner_id`. A note reaches its owner through its day, the way a to-do
--     reaches its owner through its project.
--   - No unique key. `calendar_items` has one because a to-do may be booked at
--     most once; a day may hold any number of notes.
--   - No `position`. Display order is `start_minutes` then `id`, which is a
--     total order over any set of notes and needs no stored rank.
--
-- The ON DELETE CASCADE is decision 9 stated in the schema rather than in code:
-- deleting a day deletes its notes, with no prompt. Unlike a booking, a note
-- has nowhere to be released to — it exists only as part of its day.
CREATE TABLE `calendar_notes` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `text`             varchar(500) NOT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_notes_day_start` (`day_id`, `start_minutes`),
  CONSTRAINT `fk_calendar_notes_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
