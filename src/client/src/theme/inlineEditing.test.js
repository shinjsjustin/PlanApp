import { readFileSync } from 'fs';
import { join } from 'path';

// Bodies of every rule whose selector list contains `selector` exactly.
const bodiesFor = (css, selector) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, list]) => list.split(',').map((s) => s.trim()).includes(selector))
        .map(([, , body]) => body)
        .join('\n');

const raw = readFileSync(join(__dirname, '../components/Styling/Project.css'), 'utf8');
const DARK_BG = /background:\s*(transparent|var\(--bg-page\))\s*;/;
const NEON_BORDER = /border(-color)?:[^;]*var\(--neon-blue\)/;

describe.each([
    '.layer-row-title .inline-title:hover',
    '.layer-row-title .inline-title:focus',
])('layer title edit state %s', (selector) => {
    const body = bodiesFor(raw, selector);
    it('stays dark with a neon blue border', () => {
        expect(body).toMatch(DARK_BG);
        expect(body).toMatch(NEON_BORDER);
    });
    it('never paints white', () => {
        expect(body).not.toMatch(/#fff|white/i);
    });
});

describe('.inline-description:focus', () => {
    const body = bodiesFor(raw, '.inline-description:focus');
    it('stays dark with a neon blue border or outline', () => {
        expect(body).toMatch(DARK_BG);
        expect(body).not.toMatch(/--bg-input/);
        expect(body).toMatch(/(border(-color)?|outline):[^;]*var\(--neon-blue\)/);
    });
});

describe('shared .inline-title for white sequence cards', () => {
    it('keeps the white focus background', () => {
        expect(bodiesFor(raw, '.inline-title:focus')).toMatch(/background:\s*#fff/);
    });
    it('keeps the light hover border', () => {
        expect(bodiesFor(raw, '.inline-title:hover')).toMatch(/border-color:\s*#e0e0e0/);
    });
});

describe('comments', () => {
    it('cite no old greys', () => {
        const comments = (raw.match(/\/\*[\s\S]*?\*\//g) || []).join('\n');
        expect(comments).not.toMatch(/#6b6b6b|#888/i);
    });
    it('no longer say the layer title is lifted onto white', () => {
        expect(raw).not.toMatch(/lifted onto white/);
    });
});
