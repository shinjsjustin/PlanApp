-- Reminders: a place's address becomes optional, reminders get per-place
-- subcategories, and reminders link (all ON DELETE SET NULL) to a place,
-- subcategory, person, project and to-do. Do not run this against a database
-- where reminders already exists.

ALTER TABLE `places`
  MODIFY COLUMN `address` varchar(500) DEFAULT NULL;

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
