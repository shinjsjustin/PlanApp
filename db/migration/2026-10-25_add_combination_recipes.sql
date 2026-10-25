-- Combination recipes. Back up first, and do not run this twice: the second run
-- fails on the columns it already added.

ALTER TABLE `combo_decks`
  ADD COLUMN `is_recipe` tinyint(1) NOT NULL DEFAULT '0' AFTER `pair_mode`;

ALTER TABLE `combo_cards`
  ADD COLUMN `is_crafted` tinyint(1) NOT NULL DEFAULT '0' AFTER `on_y`;

ALTER TABLE `combo_pairs`
  ADD COLUMN `result_card_id` int unsigned DEFAULT NULL AFTER `card_b_id`,
  ADD KEY `idx_combo_pairs_result` (`result_card_id`),
  ADD CONSTRAINT `fk_combo_pairs_result`
    FOREIGN KEY (`result_card_id`) REFERENCES `combo_cards` (`id`) ON DELETE SET NULL;
