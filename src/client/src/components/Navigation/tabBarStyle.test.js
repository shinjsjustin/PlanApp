import fs from 'fs';
import path from 'path';

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
const NAVBAR_Z = 1000;
const MODAL_Z = 2000;

const declaration = (css, name) => new RegExp(`${name}\\s*:\\s*(\\d+)\\s*;`).exec(css);

it('layers the tab bar above the navbar and below modals', () => {
    const match = declaration(read('index.css'), '--z-tab-bar');

    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThan(NAVBAR_Z);
    expect(Number(match[1])).toBeLessThan(MODAL_Z);
});

it('sets .tab-bar z-index from --z-tab-bar, not --z-modal', () => {
    const css = read('components', 'Styling', 'TabBar.css');
    const rule = /\.tab-bar\s*\{[^}]*\}/.exec(css)[0];

    expect(rule).toMatch(/z-index:\s*var\(--z-tab-bar\)/);
    expect(css).not.toMatch(/--z-modal/);
});

const tabRule = (selector) => {
    const css = read('components', 'Styling', 'TabBar.css');
    const escaped = selector.replace(/\./g, '\\.');
    return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)[1];
};

it('keeps tab labels on one line at a size and padding that fit a fifth of 393px', () => {
    const body = tabRule('.tab-bar-link,\n.tab-bar-back');

    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/font-size:\s*var\(--font-sm\)/);
    expect(body).toMatch(/padding:\s*var\(--space-sm\)\s+0\s*;/);
});
