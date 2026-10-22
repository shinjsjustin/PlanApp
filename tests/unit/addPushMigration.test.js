const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = () => read('db/migration/2026-10-22_add_push.sql');
const schema = () => read('src/db/schema.sql');

const tableOf = (sql, name) =>
  sql.match(new RegExp('CREATE TABLE `' + name + '` \\([\\s\\S]*?\\) ENGINE=InnoDB;'))[0];

describe.each([
  ['migration', migration],
  ['schema', schema],
])('push tables in the %s', (_name, source) => {
  it('keeps one subscription per endpoint and cascades from the owner', () => {
    const sql = tableOf(source(), 'push_subscriptions');
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`endpoint`\s+varchar\(500\) NOT NULL,/);
    expect(sql).toMatch(/`p256dh`\s+varchar\(255\) NOT NULL,/);
    expect(sql).toMatch(/`auth`\s+varchar\(255\) NOT NULL,/);
    expect(sql).toMatch(/`last_success_at`\s+datetime DEFAULT NULL,/);
    expect(sql).toMatch(/`created_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/`updated_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/UNIQUE KEY `[a-z_]+` \(`endpoint`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
  });

  it('records each send once per reminder, kind and due time', () => {
    const sql = tableOf(source(), 'push_sends');
    expect(sql).toMatch(/`reminder_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`kind`\s+enum\('time','snooze'\) NOT NULL,/);
    expect(sql).toMatch(/`due_at`\s+datetime NOT NULL,/);
    expect(sql).toMatch(/`sent_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/UNIQUE KEY `[a-z_]+` \(`reminder_id`, `kind`, `due_at`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`reminder_id`\) REFERENCES `reminders` \(`id`\) ON DELETE CASCADE/);
  });

  it('stores only a hash of each device token, unique, cascading from the owner', () => {
    const sql = tableOf(source(), 'device_tokens');
    expect(sql).toMatch(/`owner_id`\s+int unsigned NOT NULL,/);
    expect(sql).toMatch(/`name`\s+varchar\(100\) NOT NULL,/);
    expect(sql).toMatch(/`token_hash`\s+char\(64\) CHARACTER SET ascii NOT NULL,/);
    expect(sql).toMatch(/`last_used_at`\s+datetime DEFAULT NULL,/);
    expect(sql).toMatch(/`created_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/`updated_at`\s+timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,/);
    expect(sql).toMatch(/UNIQUE KEY `[a-z_]+` \(`token_hash`\)/);
    expect(sql).toMatch(/FOREIGN KEY \(`owner_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
  });
});

describe('schema.sql', () => {
  it('creates push_sends after reminders', () => {
    const s = schema();
    expect(s.indexOf('CREATE TABLE `push_sends`')).toBeGreaterThan(s.indexOf('CREATE TABLE `reminders`'));
  });

  it('drops the push tables before reminders', () => {
    const s = schema();
    const reminders = s.indexOf('DROP TABLE IF EXISTS `reminders`');
    for (const t of ['push_subscriptions', 'push_sends', 'device_tokens']) {
      const i = s.indexOf('DROP TABLE IF EXISTS `' + t + '`');
      expect(i).toBeGreaterThan(-1);
      expect(i).toBeLessThan(reminders);
    }
  });

  it('names the migration in the header', () => {
    expect(schema().split('-- Teardown')[0]).toContain('2026-10-22_add_push.sql');
  });
});
