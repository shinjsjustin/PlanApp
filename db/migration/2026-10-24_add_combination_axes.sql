-- Combination axes and pair mode. Back up first, and do not run this twice: the
-- second run fails on the columns it already added.
-- Existing cards stay on both axes (on_x = on_y = 1); new cards start on neither.

ALTER TABLE `combo_decks`
  ADD COLUMN `pair_mode` enum('combinations','permutations') NOT NULL DEFAULT 'combinations' AFTER `name`;

ALTER TABLE `combo_cards`
  ADD COLUMN `on_x` tinyint(1) NOT NULL DEFAULT '1' AFTER `position`,
  ADD COLUMN `on_y` tinyint(1) NOT NULL DEFAULT '1' AFTER `on_x`;

ALTER TABLE `combo_cards`
  ALTER COLUMN `on_x` SET DEFAULT '0',
  ALTER COLUMN `on_y` SET DEFAULT '0';
