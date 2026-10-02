import { readFileSync } from 'fs';
import { join } from 'path';

const read = (name) => readFileSync(join(__dirname, '../components/Styling', name), 'utf8');

// Bodies of every rule whose selector list contains `selector` exactly.
const bodiesFor = (css, selector) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, list]) => list.split(',').map((s) => s.trim()).includes(selector))
        .map(([, , body]) => body)
        .join('\n');

const home = read('Home.css');
const projects = read('Projects.css');

describe('landing page text', () => {
    const body = bodiesFor(home, '.Home-header');
    it('does not paint var(--bg-dark) so the body grid shows', () => {
        expect(body).not.toMatch(/background(-color)?:\s*var\(--bg-dark\)/);
    });
    it('glows its text', () => {
        expect(body).toMatch(/color:\s*var\(--text-glow\)/);
        expect(body).toMatch(/text-shadow:\s*var\(--glow-text-shadow\)/);
    });
});

describe.each(['.projects-header h1', '.projects-loading', '.projects-error', '.projects-empty'])(
    'projects text %s',
    (selector) => {
        it('glows', () => {
            const body = bodiesFor(projects, selector);
            expect(body).toMatch(/(^|[\s;])color:\s*var\(--text-glow\)/);
            expect(body).toMatch(/text-shadow:\s*var\(--glow-text-shadow\)/);
        });
    }
);

describe('inheritance and cards', () => {
    it('keeps .projects-page free of color and text-shadow', () => {
        expect(bodiesFor(projects, '.projects-page')).not.toMatch(/(^|[\s;])color:|text-shadow:/);
    });
    it('keeps the card background and border', () => {
        const body = bodiesFor(projects, '.project-card');
        expect(body).toMatch(/background:\s*#fff\s*;/);
        expect(body).toMatch(/border:\s*1px solid #d8d8d8/);
    });
});
