import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Lived.css'), 'utf8');
const indexCss = fs.readFileSync(path.join(__dirname, '..', '..', 'index.css'), 'utf8');
const rule = (selector) => {
    const escaped = selector.replace(/[.\-]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
};

it('defines the lived hue tokens in :root', () => {
    [['god', 'C9971C'], ['family', 'D9546F'], ['work', '1E6FD9'], ['building', '8A55D0'],
        ['rest', '3E9F5E'], ['sleep', '56637E'], ['drive', 'A7AFB8'], ['chat-tick', '0091B3']]
        .forEach(([name, hex]) => expect(indexCss).toMatch(new RegExp(`--lived-${name}:\\s*#${hex};`, 'i')));
});

it('uses no hex or rgb colour literals and no pixel spacing', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(css).not.toMatch(/(?:padding|margin|gap)[a-z-]*:[^;]*\d+px/);
});

it('defines the timeline and sheet selectors', () => {
    ['.lived-day', '.lived-gutter', '.lived-lane', '.lived-rule', '.lived-block', '.lived-drive',
        '.lived-tick', '.lived-empty', '.lived-sheet', '.lived-sheet-close']
        .forEach((selector) => expect(rule(selector)).not.toBe(''));
});

it('paints dark panels with light text, never light surfaces', () => {
    expect(css).not.toMatch(/--bg-card|--bg-alt/);
    expect(rule('.lived-sheet')).toContain('var(--combo-surface-raised)');
    expect(rule('.lived-sheet')).toContain('var(--combo-card)');
    expect(rule('.lived-block')).toMatch(/color-mix\([^)]*var\(--c\)[^)]*var\(--combo-surface\)/);
});

it('colours drives dashed grey and ticks cyan from the tokens', () => {
    expect(rule('.lived-drive')).toContain('var(--lived-drive)');
    expect(rule('.lived-drive')).toContain('repeating-linear-gradient');
    expect(rule('.lived-tick')).toContain('var(--lived-chat-tick)');
});

it('pins the sheet to the bottom and wraps long text', () => {
    expect(rule('.lived-sheet')).toMatch(/position:\s*fixed/);
    expect(rule('.lived-sheet')).toMatch(/bottom:\s*0/);
    expect(css).toMatch(/overflow-wrap:\s*(?:anywhere|break-word)/);
});
