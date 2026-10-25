const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-25_add_combination_recipes.sql');
const schema = () => read('src/db/schema.sql');

const tableOf = (sql, name) =>
  sql.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?\\) ENGINE=InnoDB;'))[0];

describe('migration', () => {
  it('opens with a back-up-first, do-not-run-twice comment', () => {
    const first = migration().split('\n')[0];
    expect(first).toMatch(/^--/);
    expect(migration().split(/\n\s*\n/)[0]).toMatch(/back up/i);
    expect(migration().split(/\n\s*\n/)[0]).toMatch(/twice/i);
  });

  it('adds is_recipe to decks after pair_mode', () => {
    expect(migration()).toMatch(
      /ALTER TABLE `combo_decks`\s+ADD COLUMN `is_recipe` tinyint\(1\) NOT NULL DEFAULT '0' AFTER `pair_mode`;/
    );
  });

  it('adds is_crafted to cards after on_y', () => {
    expect(migration()).toMatch(
      /ALTER TABLE `combo_cards`\s+ADD COLUMN `is_crafted` tinyint\(1\) NOT NULL DEFAULT '0' AFTER `on_y`;/
    );
  });

  it('adds result_card_id to pairs with an index and an ON DELETE SET NULL key', () => {
    const sql = migration();
    expect(sql).toMatch(
      /ALTER TABLE `combo_pairs`\s+ADD COLUMN `result_card_id` int unsigned DEFAULT NULL AFTER `card_b_id`,\s+ADD KEY `idx_combo_pairs_result` \(`result_card_id`\),\s+ADD CONSTRAINT `fk_combo_pairs_result`\s+FOREIGN KEY \(`result_card_id`\) REFERENCES `combo_cards` \(`id`\) ON DELETE SET NULL;/
    );
  });
});

describe('schema.sql', () => {
  it('gives decks is_recipe after pair_mode defaulting to 0', () => {
    expect(tableOf(schema(), 'combo_decks')).toMatch(
      /`pair_mode`\s+enum\([^)]*\) NOT NULL DEFAULT 'combinations',\s+`is_recipe`\s+tinyint\(1\) NOT NULL DEFAULT '0',/
    );
  });

  it('gives cards is_crafted after on_y defaulting to 0', () => {
    expect(tableOf(schema(), 'combo_cards')).toMatch(
      /`on_y`\s+tinyint\(1\) NOT NULL DEFAULT '0',\s+`is_crafted`\s+tinyint\(1\) NOT NULL DEFAULT '0',/
    );
  });

  it('gives pairs result_card_id after card_b_id with an index and SET NULL key', () => {
    const sql = tableOf(schema(), 'combo_pairs');
    expect(sql).toMatch(/`card_b_id`\s+int unsigned NOT NULL,\s+`result_card_id`\s+int unsigned DEFAULT NULL,/);
    expect(sql).toMatch(/KEY `idx_combo_pairs_result` \(`result_card_id`\)/);
    expect(sql).toMatch(
      /CONSTRAINT `fk_combo_pairs_result`\s+FOREIGN KEY \(`result_card_id`\) REFERENCES `combo_cards` \(`id`\) ON DELETE SET NULL/
    );
  });

  it('names the migration in the header with a back-up-first note', () => {
    const header = schema().split('-- Teardown')[0];
    const at = header.indexOf('2026-10-25_add_combination_recipes.sql');
    expect(at).toBeGreaterThan(-1);
    expect(header.slice(Math.max(0, at - 400), at + 200)).toMatch(/back (it )?up/i);
  });
});
