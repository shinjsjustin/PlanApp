-- Places: saved locations, optional place on to-dos and sequences, event
-- locations, and a travel-time cache. Do not run this against a database where
-- places already exists.

CREATE TABLE `places` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`         int unsigned NOT NULL,
  `name`             varchar(255) NOT NULL,
  `address`          varchar(500) NOT NULL,
  `kind`             enum('home','work','client','church','supplier','person','other') NOT NULL DEFAULT 'other',
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

ALTER TABLE `sequences`
  ADD COLUMN `place_id` int unsigned DEFAULT NULL AFTER `is_pinned`,
  ADD KEY `idx_sequences_place` (`place_id`),
  ADD CONSTRAINT `fk_sequences_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL;

ALTER TABLE `todos`
  ADD COLUMN `place_id` int unsigned DEFAULT NULL AFTER `is_pinned`,
  ADD KEY `idx_todos_place` (`place_id`),
  ADD CONSTRAINT `fk_todos_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL;

ALTER TABLE `calendar_events`
  ADD COLUMN `location` varchar(1000) DEFAULT NULL AFTER `title`;

CREATE TABLE `travel_times` (
  `origin_hash`      char(64) CHARACTER SET ascii NOT NULL,
  `destination_hash` char(64) CHARACTER SET ascii NOT NULL,
  `bucket`           smallint NOT NULL,
  `duration_seconds` int NOT NULL,
  `distance_meters`  int NOT NULL,
  `fetched_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`origin_hash`, `destination_hash`, `bucket`)
) ENGINE=InnoDB;
