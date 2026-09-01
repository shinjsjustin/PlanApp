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
-- Apply with:
--   mysql -u <user> -p <database> < src/db/schema.sql

-- -- Teardown ---------------------------------------------------------------
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
