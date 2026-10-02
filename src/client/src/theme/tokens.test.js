import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
const html = readFileSync(join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const block = (selector) => css.match(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`))[1];
const root = block(':root');
const body = block('body');
const token = (name) => root.match(new RegExp(`${name}:\\s*([^;]+);`));

describe('neon grid ground tokens', () => {
    it('defines a black --bg-page and the neon tokens in :root', () => {
        expect(token('--bg-page')[1].trim()).toMatch(/^#0{3}(0{3})?$/);
        ['--neon-blue', '--neon-grid-line', '--text-glow', '--glow-text-shadow',
            '--glow-box-shadow', '--glow-box-shadow-strong'].forEach((name) => {
            expect(token(name)).not.toBeNull();
        });
    });

    it('paints body with the page colour and a fixed two-line grid', () => {
        expect(body).toMatch(/background-color:\s*var\(--bg-page\)/);
        const image = body.match(/background-image:\s*([^;]+);/)[1];
        expect(image.match(/linear-gradient\(/g)).toHaveLength(2);
        expect(image.match(/var\(--neon-grid-line\)/g).length).toBeGreaterThanOrEqual(2);
        expect(body).toMatch(/background-size:\s*\d+px/);
        expect(body).toMatch(/background-attachment:\s*fixed/);
    });

    it('keeps card text dark and puts no glow on body', () => {
        expect(token('--text-primary')[1].trim()).toBe('#333');
        expect(token('--bg-card')[1].trim()).toBe('#fff');
        expect(body).toMatch(/color:\s*var\(--text-primary\)/);
        expect(body).not.toMatch(/text-shadow/);
    });

    it('mirrors --bg-page in the theme-color meta', () => {
        const page = token('--bg-page')[1].trim();
        expect(html).toContain(`<meta name="theme-color" content="${page}" />`);
    });
});
