import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Calendar.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
);

const rule = (selector) => {
    const escaped = selector.replace(/[.\\:()-]/g, '\\$&');
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return match ? match[1] : null;
};

it('wraps .calendar-header onto new rows instead of squeezing its controls', () => {
    expect(rule('.calendar-header')).toMatch(/flex-wrap:\s*wrap\s*;/);
});

it('keeps header button and link labels on one line', () => {
    const body = rule('.calendar-header button,\n.calendar-header a');

    expect(body).not.toBeNull();
    expect(body).toMatch(/white-space:\s*nowrap\s*;/);
});

it('does not lift the first hour label above the grid', () => {
    const first = rule('.day-grid-hour:first-child');

    expect(first).not.toBeNull();
    expect(first).toMatch(/transform:\s*none\s*;/);
    expect(rule('.day-grid-hour')).toMatch(/translateY\(-50%\)/);
});

it('lays note ribbon text out horizontally and wrapping', () => {
    const body = rule('.note-ribbon-text');

    expect(body).not.toMatch(/writing-mode/);
    expect(body).not.toMatch(/rotate/);
    expect(body).not.toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/overflow:\s*hidden\s*;/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(body).toMatch(/font-size:\s*var\(--font-sm\)/);
});

it.each(['.day-grid-hour', '.panel-todo-badge', '.panel-todo-row--scheduled'])(
    'colours %s with --text-secondary so it passes AA contrast',
    (selector) => {
        const body = rule(selector);

        expect(body).not.toBeNull();
        expect(body).toMatch(/(?:^|[\s;])color:\s*var\(--text-secondary\)\s*;/);
        expect(body).not.toMatch(/--text-muted/);
    }
);
