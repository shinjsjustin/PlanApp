-- People: contacts split out of places. Each place of kind 'person' becomes a
-- person linked to that same place (ids stay, so to-do and sequence links
-- survive), the place becomes kind 'other', and 'person' leaves places.kind.
-- Do not run this against a database where people already exists.

CREATE TABLE `people` (
  `id`                  int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`            int unsigned NOT NULL,
  `name`                varchar(255) NOT NULL,
  `company`             varchar(255) DEFAULT NULL,
  `role`                varchar(255) DEFAULT NULL,
  `emails`              json NOT NULL,
  `phones`              json NOT NULL,
  `contact_groups`      set('family','friend','client_contact','supplier','church','other') NOT NULL DEFAULT '',
  `notes`               text DEFAULT NULL,
  `place_id`            int unsigned DEFAULT NULL,
  `leemac_client_id`    varchar(64) DEFAULT NULL,
  `leemac_client_name`  varchar(255) DEFAULT NULL,
  `created_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_people_owner` (`owner_id`),
  KEY `idx_people_place` (`place_id`),
  CONSTRAINT `fk_people_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_people_place`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO `people` (`owner_id`, `name`, `emails`, `phones`, `notes`, `place_id`)
SELECT `owner_id`, `name`, JSON_ARRAY(), JSON_ARRAY(), `notes`, `id`
FROM `places`
WHERE `kind` = 'person';

UPDATE `places`
SET `kind` = 'other'
WHERE `kind` = 'person';

ALTER TABLE `places`
  MODIFY COLUMN `kind` enum('home','work','client','church','supplier','other') NOT NULL DEFAULT 'other';
