import { readFileSync } from 'fs';
import { join } from 'path';

const read = (name) => readFileSync(join(__dirname, '../components/Styling', name), 'utf8');

// Bodies of every rule whose selector list contains `selector` exactly.
const bodiesFor = (css, selector) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, list]) => list.split(',').map((s) => s.trim()).includes(selector))
        .map(([, , body]) => body)
        .join('\n');

const project = read('Project.css');
const calendar = read('Calendar.css');
const GLOW_COLOR = /(^|[\s;])color:\s*var\(--text-glow\)/;
const GLOW_SHADOW = /text-shadow:\s*var\(--glow-text-shadow\)/;
const OLD_GREYS = /#7a7a7a|#dcdcdc|#333|#c4c4c4/i;

describe.each([
    ['.project-header h1', true],
    ['.inline-description', false],
    ['.inline-description::placeholder', false],
    ['.layer-row-title', true],
    ['.layer-row-empty', false],
    ['.canvas--empty', false],
])('project text %s', (selector, hasShadow) => {
    it('uses the glow colour', () => {
        expect(bodiesFor(project, selector)).toMatch(GLOW_COLOR);
    });
    if (hasShadow) {
        it('carries the glow text-shadow', () => {
            expect(bodiesFor(project, selector)).toMatch(GLOW_SHADOW);
        });
    }
});

describe.each([
    '.layer-divider',
    '.layer-divider::before',
    '.layer-divider:hover::before',
    '.layer-divider:focus-visible::before',
    '.layer-divider:hover',
    '.layer-divider:focus-visible',
    '.canvas-gutter-button',
    '.canvas-gutter-button:hover',
])('project line %s', (selector) => {
    it('uses neon tokens and no old greys', () => {
        const body = bodiesFor(project, selector);
        expect(body).toMatch(/var\(--(neon-blue|neon-grid-line|text-glow)\)/);
        expect(body).not.toMatch(OLD_GREYS);
    });
});

describe.each([
    ['.calendar-header h1', true],
    ['.calendar-loading', false],
    ['.calendar-error', false],
    ['.calendar-strip--empty', false],
])('calendar text %s', (selector, hasShadow) => {
    it('uses the glow colour', () => {
        expect(bodiesFor(calendar, selector)).toMatch(GLOW_COLOR);
    });
    if (hasShadow) {
        it('carries the glow text-shadow', () => {
            expect(bodiesFor(calendar, selector)).toMatch(GLOW_SHADOW);
        });
    }
});

describe('inheritance', () => {
    it.each([
        [project, '.project-page'],
        [calendar, '.calendar-page'],
    ])('keeps %#: page container free of color and text-shadow', (css, selector) => {
        expect(bodiesFor(css, selector)).not.toMatch(/(^|[\s;])color:|text-shadow:/);
    });
});
