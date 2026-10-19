const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const MIGRATION = 'db/migration/2026-10-19_add_people.sql';
const migration = () => read(MIGRATION);
const schema = () => read('src/db/schema.sql');

const tableOf = (sql) => sql.match(/CREATE TABLE `people` \([\s\S]*?\) ENGINE=InnoDB;/)[0];

describe.each([
  ['migration', () => tableOf(migration())],
  ['schema', () => tableOf(schema())],
])('people table in the %s', (_name, table) => {
  it('has the contact columns', () => {
    const sql = table();
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(255\) NOT NULL,/);
    expect(sql).toMatch(/`company`\s+varchar\(255\)/);
    expect(sql).toMatch(/`role`\s+varchar\(255\)/);
    expect(sql).toMatch(/`emails`\s+json NOT NULL,/);
    expect(sql).toMatch(/`phones`\s+json NOT NULL,/);
    expect(sql).toMatch(/`notes`\s+text/);
    expect(sql).toMatch(/`leemac_client_id`\s+varchar\(64\) DEFAULT NULL,/);
    expect(sql).toMatch(/`leemac_client_name`/);
    expect(sql).toMatch(/`created_at`/);
    expect(sql).toMatch(/`updated_at`/);
  });

  it('keeps contact groups to the six allowed values, empty by default', () => {
    expect(table()).toMatch(
      /`contact_groups`\s+set\('family','friend','client_contact','supplier','church','other'\) NOT NULL DEFAULT '',/
    );
  });

  it('cascades on user delete and nulls the place on place delete', () => {
    const sql = table();
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \(`place_id`\) REFERENCES `places` \(`id`\) ON DELETE SET NULL/);
  });
});

describe('add people migration', () => {
  it('copies each person place into people with its id as place_id and empty JSON lists', () => {
    const sql = migration();
    expect(sql).toMatch(/INSERT INTO `people`[\s\S]*JSON_ARRAY\(\),\s*JSON_ARRAY\(\)[\s\S]*FROM `places`\s+WHERE `kind` = 'person';/);
    expect(sql).toMatch(/INSERT INTO `people`\s*\([^)]*`name`[^)]*`notes`[^)]*`place_id`/);
  });

  it('converts the person places to other before dropping the kind', () => {
    const sql = migration();
    const insert = sql.indexOf('INSERT INTO `people`');
    const update = sql.search(/UPDATE `places`\s+SET `kind` = 'other'\s+WHERE `kind` = 'person';/);
    const alter = sql.search(/ALTER TABLE `places`\s+MODIFY COLUMN `kind` enum\('home','work','client','church','supplier','other'\)/);
    expect(insert).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(insert);
    expect(alter).toBeGreaterThan(update);
  });
});

describe('schema.sql', () => {
  it('drops person from places.kind', () => {
    expect(schema()).toMatch(/`kind`\s+enum\('home','work','client','church','supplier','other'\) NOT NULL DEFAULT 'other',/);
    expect(schema()).not.toMatch(/enum\([^)]*'person'/);
  });

  it('creates people after places and drops it before places', () => {
    const s = schema();
    expect(s.indexOf('CREATE TABLE `people`')).toBeGreaterThan(s.indexOf('CREATE TABLE `places`'));
    expect(s.indexOf('DROP TABLE IF EXISTS `people`')).toBeGreaterThan(-1);
    expect(s.indexOf('DROP TABLE IF EXISTS `people`')).toBeLessThan(s.indexOf('DROP TABLE IF EXISTS `places`'));
  });

  it('names the migration in the header', () => {
    const header = schema().split('-- Teardown')[0];
    expect(header).toContain('2026-10-19_add_people.sql');
  });
});
