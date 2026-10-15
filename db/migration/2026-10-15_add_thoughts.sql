-- Thoughts: throwaway quick notes, owned by a user.
-- Do not run this against a database where the table already exists.

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
