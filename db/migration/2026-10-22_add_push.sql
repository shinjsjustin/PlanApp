-- Push: a browser push subscription per device, a record of which reminder
-- pushes were already sent, and hashed device tokens for Shortcuts. Do not run
-- this against a database where push_subscriptions already exists.

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
