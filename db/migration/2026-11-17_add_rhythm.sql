-- Rhythm: Bourne's anchors (daily reminders) and gates (timed review windows),
-- plus a tombstone table so a deletion survives a sync. Every instant is
-- DATETIME(3) in UTC, written with UTC_TIMESTAMP(3). Do not run this against a
-- database where the rhythm_ tables already exist.

CREATE TABLE `rhythm_settings` (
  `owner_id`   int unsigned NOT NULL,
  `time_zone`  varchar(64) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`owner_id`),
  CONSTRAINT `fk_rhythm_settings_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- weekdays is a bitmask: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64.
CREATE TABLE `rhythm_anchors` (
  `id`          int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`    int unsigned NOT NULL,
  `external_id` varchar(64) NOT NULL,
  `title`       varchar(100) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `at_minutes`  smallint unsigned NOT NULL,
  `weekdays`    tinyint unsigned NOT NULL,
  `enabled`     tinyint(1) NOT NULL DEFAULT '1',
  `created_at`  datetime(3) NOT NULL,
  `updated_at`  datetime(3) NOT NULL,
  `updated_by`  enum('bourne','justin') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rhythm_anchors_owner_external` (`owner_id`, `external_id`),
  KEY `idx_rhythm_anchors_owner_updated` (`owner_id`, `updated_at`),
  CONSTRAINT `fk_rhythm_anchors_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `rhythm_gates` (
  `id`          int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`    int unsigned NOT NULL,
  `external_id` varchar(64) NOT NULL,
  `title`       varchar(150) NOT NULL,
  `kind`        enum('game_plan','plan','problem_phase','content') NOT NULL,
  `opens_at`    datetime(3) NOT NULL,
  `closes_at`   datetime(3) NOT NULL,
  `state`       enum('open','held','green','assumed','rejected') NOT NULL,
  `hub_url`     varchar(500) DEFAULT NULL,
  `created_at`  datetime(3) NOT NULL,
  `updated_at`  datetime(3) NOT NULL,
  `updated_by`  enum('bourne','justin') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rhythm_gates_owner_external` (`owner_id`, `external_id`),
  KEY `idx_rhythm_gates_owner_updated` (`owner_id`, `updated_at`),
  CONSTRAINT `fk_rhythm_gates_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `rhythm_deletions` (
  `id`          int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`    int unsigned NOT NULL,
  `item_kind`   enum('anchor','gate') NOT NULL,
  `external_id` varchar(64) NOT NULL,
  `deleted_at`  datetime(3) NOT NULL,
  `deleted_by`  enum('bourne','justin') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rhythm_deletions_item` (`owner_id`, `item_kind`, `external_id`),
  CONSTRAINT `fk_rhythm_deletions_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
