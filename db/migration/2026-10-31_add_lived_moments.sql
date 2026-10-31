-- Lived moments: Bourne's lived day, stored apart from calendar notes. Rows are
-- kept forever, with no weekly clear. Existing "Lived: " calendar notes are left
-- alone. Do not run this against a database where lived_moments already exists.

CREATE TABLE `lived_moments` (
  `id`               int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`         int unsigned NOT NULL,
  `lived_on`         date NOT NULL,
  `start_minutes`    smallint unsigned NOT NULL,
  `duration_minutes` smallint unsigned NOT NULL,
  `title`            varchar(100) NOT NULL,
  `category`         varchar(16) NOT NULL,
  `detail`           text DEFAULT NULL,
  `chat_ticks`       json NOT NULL,
  `created_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lived_moments_owner_day` (`owner_id`, `lived_on`, `start_minutes`),
  CONSTRAINT `fk_lived_moments_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
