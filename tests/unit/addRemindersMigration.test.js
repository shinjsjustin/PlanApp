const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-22_add_reminders.sql');
const schema = () => read('src/db/schema.sql');

const tableOf = (sql, name) =>
  sql.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?\\) ENGINE=InnoDB;'))[0];

describe.each([
  ['migration', migration],
  ['schema', schema],
])('reminder tables in the %s', (_name, source) => {
  it('makes subcategories unique per place and cascades from owner and place', () => {
    const sql = tableOf(source(), 'reminder_subcategories');
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`place_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(100\) NOT NULL,/);
    expect(sql).toMatch(/UNIQUE KEY `[a-z_]+` \(`place_id`, `name`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \(`place_id`\) REFERENCES `places` \(`id`\) ON DELETE CASCADE/);
  });

  it('gives reminders their scheduling columns', () => {
    const sql = tableOf(source(), 'reminders');
    expect(sql).toMatch(/`title`\s+varchar\(500\) NOT NULL,/);
    expect(sql).toMatch(/`due_date`\s+date DEFAULT NULL,/);
    expect(sql).toMatch(/`due_time`\s+time DEFAULT NULL,/);
    expect(sql).toMatch(/`time_zone`\s+varchar\(64\) NOT NULL,/);
    expect(sql).toMatch(/`alert_at`\s+datetime DEFAULT NULL,/);
    expect(sql).toMatch(/`location_trigger`\s+enum\('none','arrive','leave'\) NOT NULL DEFAULT 'none',/);
    expect(sql).toMatch(/`priority`\s+enum\('normal','high'\) NOT NULL DEFAULT 'normal',/);
    expect(sql).toMatch(/`status`\s+enum\('open','done','dismissed'\) NOT NULL DEFAULT 'open',/);
    expect(sql).toMatch(/`snoozed_until`\s+datetime DEFAULT NULL,/);
    expect(sql).toMatch(/`closed_at`\s+timestamp NULL DEFAULT NULL,/);
    expect(sql).toMatch(/`repeat_rule`\s+enum\('none','daily','weekly','monthly','every_n_days'\) NOT NULL DEFAULT 'none',/);
    expect(sql).toMatch(/`repeat_every`\s+int DEFAULT NULL,/);
    expect(sql).toMatch(/`repeat_weekdays`\s+set\('mon','tue','wed','thu','fri','sat','sun'\) NOT NULL DEFAULT '',/);
    expect(sql).toMatch(/KEY `[a-z_]+` \(`owner_id`, `status`\)/);
    expect(sql).toMatch(/KEY `[a-z_]+` \(`place_id`\)/);
  });

  it('cascades on owner delete and nulls every link', () => {
    const sql = tableOf(source(), 'reminders');
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
    const links = [
      ['place_id', 'places'],
      ['subcategory_id', 'reminder_subcategories'],
      ['person_id', 'people'],
      ['project_id', 'projects'],
      ['todo_id', 'todos'],
      ['repeated_from_id', 'reminders'],
    ];
    for (const [col, table] of links) {
      expect(sql).toMatch(new RegExp('`' + col + '`\\s+int unsigned DEFAULT NULL,'));
      expect(sql).toMatch(
        new RegExp('FOREIGN KEY \\(`' + col + '`\\) REFERENCES `' + table + '` \\(`id`\\) ON DELETE SET NULL')
      );
    }
  });
});

describe('add reminders migration', () => {
  it('makes places.address nullable before the new tables', () => {
    const sql = migration();
    const alter = sql.search(/ALTER TABLE `places`\s+MODIFY COLUMN `address` varchar\(500\) DEFAULT NULL;/);
    expect(alter).toBeGreaterThan(-1);
    expect(alter).toBeLessThan(sql.indexOf('CREATE TABLE `reminder_subcategories`'));
    expect(sql.indexOf('CREATE TABLE `reminder_subcategories`')).toBeLessThan(sql.indexOf('CREATE TABLE `reminders`'));
  });
});

describe('schema.sql', () => {
  it('has a nullable places.address', () => {
    expect(tableOf(schema(), 'places')).toMatch(/`address`\s+varchar\(500\) DEFAULT NULL,/);
  });

  it('creates reminder tables after their targets', () => {
    const s = schema();
    expect(s.indexOf('CREATE TABLE `reminder_subcategories`')).toBeGreaterThan(s.indexOf('CREATE TABLE `people`'));
    expect(s.indexOf('CREATE TABLE `reminders`')).toBeGreaterThan(s.indexOf('CREATE TABLE `todos`'));
    expect(s.indexOf('CREATE TABLE `reminders`')).toBeGreaterThan(s.indexOf('CREATE TABLE `reminder_subcategories`'));
  });

  it('drops reminders, then subcategories, before todos and places', () => {
    const s = schema();
    const r = s.indexOf('DROP TABLE IF EXISTS `reminders`');
    const sub = s.indexOf('DROP TABLE IF EXISTS `reminder_subcategories`');
    expect(r).toBeGreaterThan(-1);
    expect(sub).toBeGreaterThan(r);
    expect(sub).toBeLessThan(s.indexOf('DROP TABLE IF EXISTS `todos`'));
    expect(sub).toBeLessThan(s.indexOf('DROP TABLE IF EXISTS `places`'));
  });

  it('names the migration in the header', () => {
    expect(schema().split('-- Teardown')[0]).toContain('2026-10-22_add_reminders.sql');
  });
});
