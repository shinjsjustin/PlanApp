import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Chores.css'), 'utf8');

it('uses no hex or rgb colour literals in Chores.css', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

it('uses no pixel spacing literals for padding, margin or gap', () => {
    expect(css).not.toMatch(/(?:padding|margin|gap)[a-z-]*:[^;]*\d+px/);
});

it('wraps long text with an overflow-wrap rule', () => {
    expect(css).toMatch(/overflow-wrap:\s*(?:anywhere|break-word)/);
});

it('defines the chore selectors', () => {
    ['.chore-row', '.chore-title', '.chore-details', '.chore-badge--overdue', '.chore-actions', '.chore-done', '.chores-page']
        .forEach((selector) => expect(css).toContain(selector));
});

it('defines the hint, history and archived selectors', () => {
    ['.chore-hint', '.chore-history', '.chores-archived']
        .forEach((selector) => expect(css).toContain(selector));
});
