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
