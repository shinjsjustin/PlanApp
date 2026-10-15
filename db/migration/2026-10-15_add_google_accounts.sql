-- Store each user's Google connection server-side: one row per user.
-- Token columns hold AES-GCM ciphertext and are never sent to the client;
-- access_expires_at is epoch milliseconds.
-- Do not run this against a database where the table already exists.

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
