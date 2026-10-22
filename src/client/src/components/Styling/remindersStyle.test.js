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

it('sets a light label colour on the place-select inside the form dialog', () => {
    expect(rule('.form-dialog .place-select')).toMatch(/color:\s*var\(--text-glow\)/);
});

it('sets a light small colour on the labels inside the reminders controls', () => {
    const body = rule('.reminders-controls label');
    expect(body).toMatch(/color:\s*var\(--text-glow\)/);
    expect(body).toMatch(/font-size:\s*var\(--font-sm\)/);
});

it('paints the reminder Delete button with the danger colour and white text', () => {
    const body = rule('.reminder-delete');
    expect(body).toMatch(/background:\s*var\(--color-danger\)/);
    expect(body).toMatch(/color:\s*var\(--text-white\)/);
    expect(body).toMatch(/border-color:\s*var\(--color-danger\)/);
    expect(body).toMatch(/margin-top:\s*var\(--space-lg\)/);
});
