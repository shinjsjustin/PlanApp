-- Chores: a chore with a done-window in days, and a history table holding each
-- done-mark. Do not run this against a database where chores already exists.

CREATE TABLE `chores` (
  `id`          int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`    int unsigned NOT NULL,
  `name`        varchar(100) NOT NULL,
  `area`        varchar(50) DEFAULT NULL,
  `window_min`  smallint unsigned NOT NULL,
  `window_max`  smallint unsigned NOT NULL,
  `notes`       text DEFAULT NULL,
  `archived_at` timestamp NULL DEFAULT NULL,
  `created_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chores_owner_name` (`owner_id`, `name`),
  CONSTRAINT `fk_chores_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `chore_logs` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `chore_id`   int unsigned NOT NULL,
  `done_on`    date NOT NULL,
  `done_by`    varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chore_logs_chore_done` (`chore_id`, `done_on`),
  CONSTRAINT `fk_chore_logs_chore`
    FOREIGN KEY (`chore_id`) REFERENCES `chores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
