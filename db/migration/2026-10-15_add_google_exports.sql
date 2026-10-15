-- Google export map: which Google event each booked item became, so re-exports
-- move or delete it instead of duplicating it.
-- Do not run this against a database where the table already exists.

CREATE TABLE `google_exports` (
  `user_id`         int unsigned NOT NULL,
  `item_key`        varchar(64) CHARACTER SET ascii NOT NULL,
  `google_event_id` varchar(255) CHARACTER SET ascii NOT NULL,
  `created_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `item_key`),
  CONSTRAINT `fk_google_exports_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
