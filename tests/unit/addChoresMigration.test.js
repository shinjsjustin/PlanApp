const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-31_add_chores.sql');
const schema = () => read('src/db/schema.sql');

const tableOf = (sql, name) =>
  sql.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?\\) ENGINE=InnoDB;'))[0];

describe.each([
  ['migration', migration],
  ['schema', schema],
])('chore tables in the %s', (_name, source) => {
  it('gives chores a per-owner unique name and a done window', () => {
    const sql = tableOf(source(), 'chores');
    expect(sql).toMatch(/`id`\s+int unsigned NOT NULL AUTO_INCREMENT,/);
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(100\) NOT NULL,/);
    expect(sql).toMatch(/`area`\s+varchar\(50\) DEFAULT NULL,/);
    expect(sql).toMatch(/`window_min`\s+smallint unsigned NOT NULL,/);
    expect(sql).toMatch(/`window_max`\s+smallint unsigned NOT NULL,/);
    expect(sql).toMatch(/`notes`\s+text DEFAULT NULL,/);
    expect(sql).toMatch(/`archived_at`\s+timestamp NULL DEFAULT NULL,/);
    expect(sql).toMatch(/`created_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/`updated_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/UNIQUE KEY `uq_chores_owner_name` \(`owner_id`, `name`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
  });

  it('logs each done-mark against a chore and cascades from it', () => {
    const sql = tableOf(source(), 'chore_logs');
    expect(sql).toMatch(/`id`\s+int unsigned NOT NULL AUTO_INCREMENT,/);
    expect(sql).toMatch(/`chore_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`done_on`\s+date NOT NULL,/);
    expect(sql).toMatch(/`done_by`\s+varchar\(50\) NOT NULL,/);
    expect(sql).toMatch(/`created_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/`updated_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/KEY `idx_chore_logs_chore_done` \(`chore_id`, `done_on`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`chore_id`\) REFERENCES `chores` \(`id`\) ON DELETE CASCADE/);
  });
});

describe('add chores migration', () => {
  it('creates chores before chore_logs', () => {
    const sql = migration();
    expect(sql.indexOf('CREATE TABLE `chores`')).toBeGreaterThan(-1);
    expect(sql.indexOf('CREATE TABLE `chore_logs`')).toBeGreaterThan(sql.indexOf('CREATE TABLE `chores`'));
  });
});

describe('schema.sql', () => {
  it('creates the chore tables after reminders', () => {
    const s = schema();
    expect(s.indexOf('CREATE TABLE `chores`')).toBeGreaterThan(s.indexOf('CREATE TABLE `reminders`'));
    expect(s.indexOf('CREATE TABLE `chore_logs`')).toBeGreaterThan(s.indexOf('CREATE TABLE `chores`'));
  });

  it('drops chore_logs, then chores, first in the teardown', () => {
    const s = schema();
    const logs = s.indexOf('DROP TABLE IF EXISTS `chore_logs`');
    const chores = s.indexOf('DROP TABLE IF EXISTS `chores`');
    expect(logs).toBeGreaterThan(s.indexOf('-- Teardown'));
    expect(chores).toBeGreaterThan(logs);
    expect(chores).toBeLessThan(s.indexOf('DROP TABLE IF EXISTS `combo_pairs`'));
  });

  it('names the migration in the header', () => {
    expect(schema().split('-- Teardown')[0]).toContain('2026-10-31_add_chores.sql');
  });
});
