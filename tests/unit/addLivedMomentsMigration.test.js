const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-31_add_lived_moments.sql');
const schema = () => read('src/db/schema.sql');

const tableOf = (sql, name) =>
  sql.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?\\) ENGINE=InnoDB;'))[0];

describe.each([
  ['migration', migration],
  ['schema', schema],
])('lived_moments table in the %s', (_name, source) => {
  it('stores a moment per owner and day with a cascading owner key', () => {
    const sql = tableOf(source(), 'lived_moments');
    expect(sql).toMatch(/`id`\s+int unsigned NOT NULL AUTO_INCREMENT,/);
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`lived_on`\s+date NOT NULL,/);
    expect(sql).toMatch(/`start_minutes`\s+smallint unsigned NOT NULL,/);
    expect(sql).toMatch(/`duration_minutes`\s+smallint unsigned NOT NULL,/);
    expect(sql).toMatch(/`title`\s+varchar\(100\) NOT NULL,/);
    expect(sql).toMatch(/`category`\s+varchar\(16\) NOT NULL,/);
    expect(sql).toMatch(/`detail`\s+text DEFAULT NULL,/);
    expect(sql).toMatch(/`chat_ticks`\s+json NOT NULL,/);
    expect(sql).toMatch(/`created_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/`updated_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/PRIMARY KEY \(`id`\)/);
    expect(sql).toMatch(/KEY `idx_lived_moments_owner_day` \(`owner_id`, `lived_on`, `start_minutes`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
  });
});

describe('add lived moments migration', () => {
  it('never mentions calendar_notes', () => {
    expect(migration()).not.toMatch(/calendar_notes/);
  });
});

describe('schema.sql', () => {
  it('creates lived_moments after chores', () => {
    const s = schema();
    expect(s.indexOf('CREATE TABLE `lived_moments`')).toBeGreaterThan(s.indexOf('CREATE TABLE `chore_logs`'));
  });

  it('drops lived_moments in the teardown', () => {
    const s = schema();
    expect(s.indexOf('DROP TABLE IF EXISTS `lived_moments`')).toBeGreaterThan(s.indexOf('-- Teardown'));
    expect(s.indexOf('DROP TABLE IF EXISTS `lived_moments`')).toBeLessThan(s.indexOf('DROP TABLE IF EXISTS `users`'));
  });

  it('names the migration in the header', () => {
    expect(schema().split('-- Teardown')[0]).toContain('2026-10-31_add_lived_moments.sql');
  });
});
