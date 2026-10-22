-- Combinations: decks of cards, and the unordered pairs between cards. Do not
-- run this against a database where combo_decks already exists.

CREATE TABLE `combo_decks` (
  `id`             int unsigned NOT NULL AUTO_INCREMENT,
  `owner_id`       int unsigned NOT NULL,
  `project_id`     int unsigned DEFAULT NULL,
  `source_deck_id` int unsigned DEFAULT NULL,
  `name`           varchar(200) NOT NULL,
  `created_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combo_decks_owner_name` (`owner_id`, `name`),
  KEY `idx_combo_decks_project` (`project_id`),
  KEY `idx_combo_decks_source` (`source_deck_id`),
  CONSTRAINT `fk_combo_decks_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combo_decks_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_combo_decks_source`
    FOREIGN KEY (`source_deck_id`) REFERENCES `combo_decks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE `combo_cards` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `deck_id`    int unsigned NOT NULL,
  `name`       varchar(200) NOT NULL,
  `detail`     text NOT NULL,
  `position`   int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_combo_cards_deck_position` (`deck_id`, `position`),
  CONSTRAINT `fk_combo_cards_deck`
    FOREIGN KEY (`deck_id`) REFERENCES `combo_decks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Pairs are unordered: the repo stores card_a_id < card_b_id. No CHECK enforces
-- it, because MySQL forbids CHECK on columns used by cascading foreign keys.
CREATE TABLE `combo_pairs` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `deck_id`    int unsigned NOT NULL,
  `card_a_id`  int unsigned NOT NULL,
  `card_b_id`  int unsigned NOT NULL,
  `name`       varchar(200) NOT NULL DEFAULT '',
  `effect`     text NOT NULL,
  `notes`      text NOT NULL,
  `state`      enum('empty','drafted','done','struck') NOT NULL DEFAULT 'empty',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_combo_pairs_cards` (`card_a_id`, `card_b_id`),
  KEY `idx_combo_pairs_deck` (`deck_id`),
  KEY `idx_combo_pairs_card_b` (`card_b_id`),
  CONSTRAINT `fk_combo_pairs_deck`
    FOREIGN KEY (`deck_id`) REFERENCES `combo_decks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combo_pairs_card_a`
    FOREIGN KEY (`card_a_id`) REFERENCES `combo_cards` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_combo_pairs_card_b`
    FOREIGN KEY (`card_b_id`) REFERENCES `combo_cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
