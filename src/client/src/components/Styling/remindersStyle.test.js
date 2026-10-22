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

const rule = (selector) => {
    const escaped = selector.replace(/[.[\]"=]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
};

it('does not paint the pressed view button with the primary green', () => {
    const body = rule('.reminders-views [aria-pressed="true"]');
    expect(body).not.toMatch(/background[^;]*--color-primary/);
    expect(body).toMatch(/border[^;]*var\(--/);
});

it('sets a light label colour on the reminders place-select', () => {
    expect(rule('.reminders-page .place-select')).toMatch(/color:\s*var\(--text-glow\)/);
});
