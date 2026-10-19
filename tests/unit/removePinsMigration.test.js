const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const MIGRATION = 'db/migration/2026-10-19_remove_pins.sql';
const migration = () => read(MIGRATION);
const schema = () => read('src/db/schema.sql');

describe('remove pins migration', () => {
  it('deletes every calendar_items row with no WHERE clause', () => {
    expect(migration()).toMatch(/^DELETE FROM `calendar_items`;/m);
  });

  it('drops the pinned index and column from todos', () => {
    expect(migration()).toMatch(
      /ALTER TABLE `todos`\s+DROP INDEX `idx_todos_project_pinned`,\s+DROP COLUMN `is_pinned`;/
    );
  });

  it('drops the pinned column from sequences', () => {
    expect(migration()).toMatch(/ALTER TABLE `sequences`\s+DROP COLUMN `is_pinned`;/);
  });

  it('leaves notes, events and Google exports alone', () => {
    expect(migration()).not.toMatch(/calendar_notes|calendar_events|google_exports/);
  });

  it('removes every pin from the schema but keeps sequences.owner', () => {
    expect(schema()).not.toMatch(/is_pinned|idx_todos_project_pinned/);
    expect(schema()).toMatch(/`owner` enum\('justin','bourne'\) NOT NULL DEFAULT 'justin',/);
  });

  it('names the migration in the schema header', () => {
    const header = schema().split('\n').slice(0, 80).join('\n');
    expect(header).toContain('2026-10-19_remove_pins.sql');
  });
});
