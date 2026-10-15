-- Imported Google events: fixed rows per day that a re-import replaces wholesale.
-- Read-only copies of Google events, never pushed back, never blocking bookings.
-- Do not run this against a database where the table already exists.

CREATE TABLE `calendar_events` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `day_id`           int unsigned NOT NULL,
  `google_event_id`  varchar(255) CHARACTER SET ascii NOT NULL,
  `title`            varchar(500) NOT NULL,
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
