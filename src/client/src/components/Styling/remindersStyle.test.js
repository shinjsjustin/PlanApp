import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Reminders.css'), 'utf8');

it('uses no hex or rgb colour literals in Reminders.css', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

it('uses no pixel spacing literals for padding, margin or gap', () => {
    expect(css).not.toMatch(/(?:padding|margin|gap)[a-z-]*:[^;]*\d+px/);
});

it('wraps long text with an overflow-wrap rule', () => {
    expect(css).toMatch(/overflow-wrap:\s*(?:anywhere|break-word)/);
});
