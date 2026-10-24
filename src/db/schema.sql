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
-- A database created before project card colors is missing the color column. Add
-- it in place rather than re-running this file:
--   ALTER TABLE `projects` ADD COLUMN `color` CHAR(7) NULL AFTER `description`;
--
-- A database created before to-do notes is missing the note column. Add it in
-- place rather than re-running this file (db/migration/2026-10-01_add_todo_notes.sql):
--   ALTER TABLE `todos` ADD COLUMN `note` text DEFAULT NULL AFTER `text`;
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
-- A database created before sequence connections were removed has one table too
-- many. Drop it in place rather than re-running this file:
--   DROP TABLE IF EXISTS `sequence_edges`;
-- The same statement stays in the teardown below, ahead of the tables it points
-- at, so re-running this file against such a database cannot fail on the foreign
-- keys it holds.
--
-- A database created before pinning was removed still has the pin flags and
-- holds old bookings. Apply in place rather than re-running this file
-- (db/migration/2026-10-19_remove_pins.sql). A booking is for a to-do or a
-- sequence; there is no CHECK saying so, because MySQL forbids CHECK
-- constraints on columns used by cascading foreign keys.
--
-- A database created before sequence owners is missing the owner column. Apply in
-- place rather than re-running this file (db/migration/2026-10-19_add_sequence_owner.sql):
--   ALTER TABLE `sequences`
--     ADD COLUMN `owner` enum('justin','bourne') NOT NULL DEFAULT 'justin' AFTER `is_collapsed`;
--   UPDATE `sequences` SET `owner` = 'bourne' WHERE LOWER(`description`) LIKE 'bourne%';
--
-- A database created before dated calendar days is missing the date column. Add
-- it in place rather than re-running this file
-- (db/migration/2026-10-15_add_calendar_day_dates.sql):
--   ALTER TABLE `calendar_days`
--     ADD COLUMN `date` date DEFAULT NULL AFTER `owner_id`,
--     ADD UNIQUE KEY `uq_calendar_days_owner_date` (`owner_id`, `date`);
--
-- A database created before Google Calendar linking is missing one table. Add it
-- in place rather than re-running this file
-- (db/migration/2026-10-15_add_google_accounts.sql): copy the CREATE TABLE
-- statement for `google_accounts` from the bottom of this file and run it alone.
--
-- A database created before imported Google events is missing one table. Add it
-- in place rather than re-running this file
-- (db/migration/2026-10-15_add_calendar_events.sql): copy the CREATE TABLE
-- statement for `calendar_events` from the bottom of this file and run it alone.
--
-- A database created before Google export is missing one table. Add it in place
-- rather than re-running this file (db/migration/2026-10-15_add_google_exports.sql):
-- copy the CREATE TABLE statement for `google_exports` from the bottom of this
-- file and run it alone.
--
-- A database created before export change detection is missing the body hash
-- column. Add it in place rather than re-running this file
-- (db/migration/2026-10-15_add_google_exports_body_hash.sql):
--   ALTER TABLE `google_exports` ADD COLUMN `body_hash` char(64) CHARACTER SET ascii NULL AFTER `google_event_id`;
--
-- A database created before thoughts is missing one table. Add it in place
-- rather than re-running this file (db/migration/2026-10-15_add_thoughts.sql):
-- copy the CREATE TABLE statement for `thoughts` from the bottom of this file
-- and run it alone.
--
-- A database created before project thoughts is missing one table. Add it in
-- place rather than re-running this file (db/migration/2026-10-16_add_project_thoughts.sql):
-- copy the CREATE TABLE statement for `project_thoughts` from the bottom of this
-- file and run it alone.
--
-- A database created before places is missing two tables and three columns. Apply
-- in place rather than re-running this file (db/migration/2026-10-16_add_places.sql).
--
-- A database created before people is missing one table, and its places may still
-- hold kind 'person'. Apply in place rather than re-running this file
-- (db/migration/2026-10-19_add_people.sql).
--
-- A database created before reminders is missing two tables, and its places
-- require an address. Apply in place rather than re-running this file
-- (db/migration/2026-10-22_add_reminders.sql).
--
-- A database created before push is missing three tables. Apply in place rather
-- than re-running this file (db/migration/2026-10-22_add_push.sql).
--
-- A database created before combinations is missing three tables. Apply in place
-- rather than re-running this file (db/migration/2026-10-22_add_combinations.sql).
--
-- A database created before combination axes is missing combo_decks.pair_mode and
-- combo_cards.on_x and on_y. Back it up first, then apply in place rather than
-- re-running this file (db/migration/2026-10-24_add_combination_axes.sql).
--
-- Apply with:
--   mysql -u <user> -p <database> < src/db/schema.sql

-- -- Teardown ---------------------------------------------------------------
DROP TABLE IF EXISTS `combo_pairs`;
DROP TABLE IF EXISTS `combo_cards`;
DROP TABLE IF EXISTS `combo_decks`;
DROP TABLE IF EXISTS `travel_times`;
DROP TABLE IF EXISTS `project_thoughts`;
DROP TABLE IF EXISTS `thoughts`;
DROP TABLE IF EXISTS `google_exports`;
DROP TABLE IF EXISTS `google_accounts`;
DROP TABLE IF EXISTS `calendar_events`;
DROP TABLE IF EXISTS `calendar_notes`;
DROP TABLE IF EXISTS `calendar_items`;
DROP TABLE IF EXISTS `calendar_days`;
-- No longer created below: this drop is what lets a database made by an older
-- version of this file be torn down, since its `sequence_edges` foreign keys
-- point at `sequences` and `projects`.
DROP TABLE IF EXISTS `sequence_edges`;
DROP TABLE IF EXISTS `push_subscriptions`;
DROP TABLE IF EXISTS `push_sends`;
DROP TABLE IF EXISTS `device_tokens`;
DROP TABLE IF EXISTS `reminders`;
DROP TABLE IF EXISTS `reminder_subcategories`;
DROP TABLE IF EXISTS `todos`;
DROP TABLE IF EXISTS `sequences`;
DROP TABLE IF EXISTS `layers`;
DROP TABLE IF EXISTS `people`;
DROP TABLE IF EXISTS `places`;
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
  `color` char(7) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_projects_owner` (`owner_id`),
  CONSTRAINT `fk_projects_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- places ----------------------------------------------------------------
-- Saved locations an owner visits. Created before `sequences` and `todos`, which
-- point at it. At most one place per owner has `is_default_start = 1`, enforced
-- by placesRepo.setDefaultStart.
CREATE TABLE `places` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`         int unsigned NOT NULL,
  `name`             varchar(255) NOT NULL,
  `address`          varchar(500) DEFAULT NULL,
  `kind`             enum('home','work','client','church','supplier','other') NOT NULL DEFAULT 'other',
  `notes`            text DEFAULT NULL,
  `visit_minutes`    int DEFAULT NULL,
  `is_default_start` tinyint(1) NOT NULL DEFAULT '0',
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_places_owner` (`owner_id`),
  CONSTRAINT `fk_places_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- people ----------------------------------------------------------------
-- Contacts. `place_id` optionally points at where the person is found.
CREATE TABLE `people` (
  `id`                  int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`            int unsigned NOT NULL,
  `name`                varchar(255) NOT NULL,
  `company`             varchar(255) DEFAULT NULL,
  `role`                varchar(255) DEFAULT NULL,
  `emails`              json NOT NULL,
  `phones`              json NOT NULL,
  `contact_groups`      set('family','friend','client_contact','supplier','church','other') NOT NULL DEFAULT '',
  `notes`               text DEFAULT NULL,
  `place_id`            int unsigned DEFAULT NULL,
  `leemac_client_id`    varchar(64) DEFAULT NULL,
  `leemac_client_name`  varchar(255) DEFAULT NULL,
  `created_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_people_owner` (`owner_id`),
  KEY `idx_people_place` (`place_id`),
  CONSTRAINT `fk_people_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_people_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -- reminder_subcategories --------------------------------------------------
-- Owner-defined labels within one place.
CREATE TABLE `reminder_subcategories` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`   int unsigned NOT NULL,
  `place_id`   int unsigned NOT NULL,
  `name`       varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reminder_subcategories_place_name` (`place_id`, `name`),
  KEY `idx_reminder_subcategories_owner` (`owner_id`),
  CONSTRAINT `fk_reminder_subcategories_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reminder_subcategories_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE CASCADE
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
  `owner` enum('justin','bourne') NOT NULL DEFAULT 'justin',
  `place_id` int unsigned DEFAULT NULL,
  `position` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sequences_layer_position` (`layer_id`, `position`),
  KEY `idx_sequences_project` (`project_id`),
  KEY `idx_sequences_place` (`place_id`),
  CONSTRAINT `fk_sequences_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sequences_layer`
    FOREIGN KEY (`layer_id`) REFERENCES `layers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sequences_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL
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
  `note` text DEFAULT NULL,
  `status` enum('incomplete','complete','blocked') NOT NULL DEFAULT 'incomplete',
  `completed_at` timestamp NULL DEFAULT NULL,
  `place_id` int unsigned DEFAULT NULL,
  `position` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_todos_project_sequence_position` (`project_id`, `sequence_id`, `position`),
  KEY `idx_todos_sequence` (`sequence_id`),
  KEY `idx_todos_place` (`place_id`),
  CONSTRAINT `fk_todos_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_todos_sequence`
    FOREIGN KEY (`sequence_id`) REFERENCES `sequences` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_todos_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -- reminders ------------------------------------------------------------
-- `alert_at` is UTC; `time_zone` is the zone `due_date` and `due_time` were set in.
CREATE TABLE `reminders` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`         int unsigned NOT NULL,
  `title`            varchar(500) NOT NULL,
  `place_id`         int unsigned DEFAULT NULL,
  `subcategory_id`   int unsigned DEFAULT NULL,
  `person_id`        int unsigned DEFAULT NULL,
  `project_id`       int unsigned DEFAULT NULL,
  `todo_id`          int unsigned DEFAULT NULL,
  `due_date`         date DEFAULT NULL,
  `due_time`         time DEFAULT NULL,
  `time_zone`        varchar(64) NOT NULL,
  `alert_at`         datetime DEFAULT NULL,
  `location_trigger` enum('none','arrive','leave') NOT NULL DEFAULT 'none',
  `priority`         enum('normal','high') NOT NULL DEFAULT 'normal',
  `status`           enum('open','done','dismissed') NOT NULL DEFAULT 'open',
  `snoozed_until`    datetime DEFAULT NULL,
  `closed_at`        timestamp NULL DEFAULT NULL,
  `repeat_rule`      enum('none','daily','weekly','monthly','every_n_days') NOT NULL DEFAULT 'none',
  `repeat_every`     int DEFAULT NULL,
  `repeat_weekdays`  set('mon','tue','wed','thu','fri','sat','sun') NOT NULL DEFAULT '',
  `repeated_from_id` int unsigned DEFAULT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reminders_owner_status` (`owner_id`, `status`),
  KEY `idx_reminders_place` (`place_id`),
  CONSTRAINT `fk_reminders_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reminders_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reminders_subcategory`
    FOREIGN KEY (`subcategory_id`) REFERENCES `reminder_subcategories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reminders_person`
    FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reminders_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reminders_todo`
    FOREIGN KEY (`todo_id`) REFERENCES `todos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reminders_repeated_from`
    FOREIGN KEY (`repeated_from_id`) REFERENCES `reminders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -- push ----------------------------------------------------------------
CREATE TABLE `push_subscriptions` (
  `id`              int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`        int unsigned NOT NULL,
  `endpoint`        varchar(500) NOT NULL,
  `p256dh`          varchar(255) NOT NULL,
  `auth`            varchar(255) NOT NULL,
  `last_success_at` datetime DEFAULT NULL,
  `created_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_subscriptions_endpoint` (`endpoint`),
  KEY `idx_push_subscriptions_owner` (`owner_id`),
  CONSTRAINT `fk_push_subscriptions_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `push_sends` (
  `id`          int unsigned NOT NULL AUTO_INCREMENT,
  `reminder_id` int unsigned NOT NULL,
  `kind`        enum('time','snooze') NOT NULL,
  `due_at`      datetime NOT NULL,
  `sent_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_sends_reminder_kind_due` (`reminder_id`, `kind`, `due_at`),
  CONSTRAINT `fk_push_sends_reminder`
    FOREIGN KEY (`reminder_id`) REFERENCES `reminders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `device_tokens` (
  `id`           int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`     int unsigned NOT NULL,
  `name`         varchar(100) NOT NULL,
  `token_hash`   char(64) CHARACTER SET ascii NOT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `created_at`   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_device_tokens_token_hash` (`token_hash`),
  KEY `idx_device_tokens_owner` (`owner_id`),
  CONSTRAINT `fk_device_tokens_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- calendar_days ---------------------------------------------------------
-- A day is an ordered container spanning a full 24 hours, and is now dated:
-- `date` is NULL only until the owner's first load assigns it. `position` is
-- dense 0..n-1, left to right, and dates grow with position.
-- It hangs off the user rather than off a project: the calendar's whole purpose
-- is drawing work from every project at once.
CREATE TABLE `calendar_days` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`   int unsigned NOT NULL,
  `date`       date DEFAULT NULL,
  `position`   int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_calendar_days_owner_date` (`owner_id`, `date`),
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
  `todo_id`          int unsigned DEFAULT NULL,
  `sequence_id`      int unsigned DEFAULT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_calendar_items_todo` (`todo_id`),
  UNIQUE KEY `uq_calendar_items_sequence` (`sequence_id`),
  KEY `idx_calendar_items_day_start` (`day_id`, `start_minutes`),
  CONSTRAINT `fk_calendar_items_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_calendar_items_todo`
    FOREIGN KEY (`todo_id`) REFERENCES `todos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_calendar_items_sequence`
    FOREIGN KEY (`sequence_id`) REFERENCES `sequences` (`id`) ON DELETE CASCADE
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

-- -- calendar_events ------------------------------------------------------
-- Read-only copies of Google events, never pushed back, never blocking
-- bookings. A re-import replaces a day's rows wholesale; the unique key stops
-- one Google event appearing twice on a day.
CREATE TABLE `calendar_events` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `google_event_id`  varchar(255) CHARACTER SET ascii NOT NULL,
  `title`            varchar(500) NOT NULL,
  `location`         varchar(1000) DEFAULT NULL,
  `all_day`          tinyint(1) NOT NULL,
  `start_minutes`    int NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_calendar_events_day_google` (`day_id`, `google_event_id`),
  CONSTRAINT `fk_calendar_events_day`
    FOREIGN KEY (`day_id`) REFERENCES `calendar_days` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- google_accounts -------------------------------------------------------
-- A user's linked Google account, one row per user. The token columns are
-- AES-GCM ciphertext and are never sent to the client. `access_expires_at` is
-- epoch milliseconds.
CREATE TABLE `google_accounts` (
  `user_id`           int unsigned NOT NULL,
  `google_email`      varchar(255) NOT NULL,
  `refresh_token_enc` text NOT NULL,
  `access_token_enc`  text NOT NULL,
  `access_expires_at` bigint NOT NULL,
  `scopes`            varchar(1000) NOT NULL,
  `created_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_google_accounts_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- google_exports --------------------------------------------------------
-- Which Google event each booked item was exported as, so a re-export moves or
-- deletes it instead of duplicating it. `item_key` is 'todo:<id>' or
-- 'sequence:<id>' (the item, not the booking row, which may be recreated).
CREATE TABLE `google_exports` (
  `user_id`         int unsigned NOT NULL,
  `item_key`        varchar(64) CHARACTER SET ascii NOT NULL,
  `google_event_id` varchar(255) CHARACTER SET ascii NOT NULL,
  -- sha256 of the last exported body; null means unknown, so the next export patches it.
  `body_hash`       char(64) CHARACTER SET ascii NULL,
  `created_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `item_key`),
  CONSTRAINT `fk_google_exports_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- thoughts --------------------------------------------------------------
-- Throwaway quick notes: only an owner, text and creation time.
CREATE TABLE `thoughts` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`   int unsigned NOT NULL,
  `text`       varchar(2000) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_thoughts_owner_created` (`owner_id`, `created_at`),
  CONSTRAINT `fk_thoughts_user`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- project_thoughts ----------------------------------------------------
-- One autosaved note per project; `version` counts saves for conflict checks.
CREATE TABLE `project_thoughts` (
  `project_id` int unsigned NOT NULL,
  `text`       mediumtext NOT NULL,
  `version`    int unsigned NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`),
  CONSTRAINT `fk_project_thoughts_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -- travel_times ---------------------------------------------------------
-- Cached drive times between two hashed addresses for a time-of-day bucket.
CREATE TABLE `travel_times` (
  `origin_hash`      char(64) CHARACTER SET ascii NOT NULL,
  `destination_hash` char(64) CHARACTER SET ascii NOT NULL,
  `bucket`           smallint NOT NULL,
  `duration_seconds` int NOT NULL,
  `distance_meters`  int NOT NULL,
  `fetched_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`origin_hash`, `destination_hash`, `bucket`)
) ENGINE=InnoDB;

-- -- combinations ---------------------------------------------------------
CREATE TABLE `combo_decks` (
  `id`             int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`       int unsigned NOT NULL,
  `project_id`     int unsigned DEFAULT NULL,
  `source_deck_id` int unsigned DEFAULT NULL,
  `name`           varchar(200) NOT NULL,
  `pair_mode`      enum('combinations','permutations') NOT NULL DEFAULT 'combinations',
  `created_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combo_decks_owner_name` (`owner_id`, `name`),
  KEY `idx_combo_decks_project` (`project_id`),
  KEY `idx_combo_decks_source` (`source_deck_id`),
  CONSTRAINT `fk_combo_decks_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combo_decks_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_combo_decks_source`
    FOREIGN KEY (`source_deck_id`) REFERENCES `combo_decks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE `combo_cards` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `deck_id`    int unsigned NOT NULL,
  `name`       varchar(200) NOT NULL,
  `detail`     text NOT NULL,
  `position`   int unsigned NOT NULL,
  `on_x`       tinyint(1) NOT NULL DEFAULT '0',
  `on_y`       tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_combo_cards_deck_position` (`deck_id`, `position`),
  CONSTRAINT `fk_combo_cards_deck`
    FOREIGN KEY (`deck_id`) REFERENCES `combo_decks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Pairs are unordered: the repo stores card_a_id < card_b_id. No CHECK enforces
-- it, because MySQL forbids CHECK on columns used by cascading foreign keys.
CREATE TABLE `combo_pairs` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `deck_id`    int unsigned NOT NULL,
  `card_a_id`  int unsigned NOT NULL,
  `card_b_id`  int unsigned NOT NULL,
  `name`       varchar(200) NOT NULL DEFAULT '',
  `effect`     text NOT NULL,
  `notes`      text NOT NULL,
  `state`      enum('empty','drafted','done','struck') NOT NULL DEFAULT 'empty',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combo_pairs_cards` (`card_a_id`, `card_b_id`),
  KEY `idx_combo_pairs_deck` (`deck_id`),
  KEY `idx_combo_pairs_card_b` (`card_b_id`),
  CONSTRAINT `fk_combo_pairs_deck`
    FOREIGN KEY (`deck_id`) REFERENCES `combo_decks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combo_pairs_card_a`
    FOREIGN KEY (`card_a_id`) REFERENCES `combo_cards` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combo_pairs_card_b`
    FOREIGN KEY (`card_b_id`) REFERENCES `combo_cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
