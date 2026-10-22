const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-22_add_combinations.sql');
const schema = () => read('src/db/schema.sql');

const tableOf = (sql, name) =>
  sql.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?\\) ENGINE=InnoDB;'))[0];

const TIMESTAMPS = [
  /`created_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/,
  /`updated_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,/,
];

describe.each([
  ['migration', migration],
  ['schema', schema],
])('combination tables in the %s', (_name, source) => {
  it('keeps decks per owner with unique names and nullable project and source links', () => {
    const sql = tableOf(source(), 'combo_decks');
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`project_id`\s+int unsigned DEFAULT NULL,/);
    expect(sql).toMatch(/`source_deck_id`\s+int unsigned DEFAULT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(200\) NOT NULL,/);
    TIMESTAMPS.forEach((t) => expect(sql).toMatch(t));
    expect(sql).toMatch(/UNIQUE KEY `[a-z_]+` \(`owner_id`, `name`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \(`project_id`\) REFERENCES `projects` \(`id`\) ON DELETE SET NULL/);
    expect(sql).toMatch(/FOREIGN KEY \(`source_deck_id`\) REFERENCES `combo_decks` \(`id`\) ON DELETE SET NULL/);
  });

  it('orders cards within a deck and cascades from the deck', () => {
    const sql = tableOf(source(), 'combo_cards');
    expect(sql).toMatch(/`deck_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(200\) NOT NULL,/);
    expect(sql).toMatch(/`detail`\s+text NOT NULL,/);
    expect(sql).toMatch(/`position`\s+int unsigned NOT NULL,/);
    TIMESTAMPS.forEach((t) => expect(sql).toMatch(t));
    expect(sql).toMatch(/\bKEY `[a-z_]+` \(`deck_id`, `position`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`deck_id`\) REFERENCES `combo_decks` \(`id`\) ON DELETE CASCADE/);
  });

  it('keeps one pair per two cards and cascades from the deck and both cards', () => {
    const sql = tableOf(source(), 'combo_pairs');
    expect(sql).toMatch(/`deck_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`card_a_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`card_b_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(200\) NOT NULL/);
    expect(sql).toMatch(/`effect`\s+text NOT NULL/);
    expect(sql).toMatch(/`notes`\s+text NOT NULL/);
    expect(sql).toMatch(/`state`\s+enum\('empty','drafted','done','struck'\) NOT NULL/);
    TIMESTAMPS.forEach((t) => expect(sql).toMatch(t));
    expect(sql).toMatch(/UNIQUE KEY `[a-z_]+` \(`card_a_id`, `card_b_id`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`deck_id`\) REFERENCES `combo_decks` \(`id`\) ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \(`card_a_id`\) REFERENCES `combo_cards` \(`id`\) ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \(`card_b_id`\) REFERENCES `combo_cards` \(`id`\) ON DELETE CASCADE/);
    expect(sql).not.toMatch(/CHECK/);
  });
});

describe('schema.sql', () => {
  it('creates the combination tables after projects, decks first', () => {
    const s = schema();
    const decks = s.indexOf('CREATE TABLE `combo_decks`');
    expect(decks).toBeGreaterThan(s.indexOf('CREATE TABLE `projects`'));
    expect(s.indexOf('CREATE TABLE `combo_cards`')).toBeGreaterThan(decks);
    expect(s.indexOf('CREATE TABLE `combo_pairs`')).toBeGreaterThan(s.indexOf('CREATE TABLE `combo_cards`'));
  });

  it('drops pairs, cards, decks in order before travel_times', () => {
    const s = schema();
    const at = (t) => s.indexOf('DROP TABLE IF EXISTS `' + t + '`');
    expect(at('combo_pairs')).toBeGreaterThan(-1);
    expect(at('combo_cards')).toBeGreaterThan(at('combo_pairs'));
    expect(at('combo_decks')).toBeGreaterThan(at('combo_cards'));
    expect(at('combo_pairs')).toBeLessThan(at('travel_times'));
  });

  it('names the migration in the header', () => {
    expect(schema().split('-- Teardown')[0]).toContain('2026-10-22_add_combinations.sql');
  });
});
