const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-24_add_combination_axes.sql');
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

  it('adds pair_mode to decks after name', () => {
    expect(migration()).toMatch(
      /ALTER TABLE `combo_decks`\s+ADD COLUMN `pair_mode` enum\('combinations','permutations'\) NOT NULL DEFAULT 'combinations' AFTER `name`;/
    );
  });

  it('adds on_x and on_y filled with 1 for existing cards, then defaults both to 0', () => {
    const sql = migration();
    const add = sql.search(
      /ALTER TABLE `combo_cards`\s+ADD COLUMN `on_x` tinyint\(1\) NOT NULL DEFAULT '1' AFTER `position`,\s+ADD COLUMN `on_y` tinyint\(1\) NOT NULL DEFAULT '1' AFTER `on_x`;/
    );
    const reset = sql.search(
      /ALTER TABLE `combo_cards`\s+ALTER COLUMN `on_x` SET DEFAULT '0',\s+ALTER COLUMN `on_y` SET DEFAULT '0';/
    );
    expect(add).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(add);
  });
});

describe('schema.sql', () => {
  it('gives decks a pair_mode after name defaulting to combinations', () => {
    const sql = tableOf(schema(), 'combo_decks');
    expect(sql).toMatch(
      /`name`\s+varchar\(200\) NOT NULL,\s+`pair_mode`\s+enum\('combinations','permutations'\) NOT NULL DEFAULT 'combinations',/
    );
  });

  it('gives cards on_x and on_y after position defaulting to 0', () => {
    const sql = tableOf(schema(), 'combo_cards');
    expect(sql).toMatch(
      /`position`\s+int unsigned NOT NULL,\s+`on_x`\s+tinyint\(1\) NOT NULL DEFAULT '0',\s+`on_y`\s+tinyint\(1\) NOT NULL DEFAULT '0',/
    );
  });

  it('names the migration in the header with a back-up-first note', () => {
    const header = schema().split('-- Teardown')[0];
    const at = header.indexOf('2026-10-24_add_combination_axes.sql');
    expect(at).toBeGreaterThan(-1);
    expect(header.slice(Math.max(0, at - 400), at + 200)).toMatch(/back (it )?up/i);
  });
});
