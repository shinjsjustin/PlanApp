import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const index = read('index.css');
const projects = read('components', 'Styling', 'Projects.css');
const calendar = read('components', 'Styling', 'Calendar.css');
const rule = (css, selector) => {
    const m = css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : '';
};

describe('neon button style', () => {
    it('outlines with the neon tokens on a transparent ground', () => {
        const body = rule(index, '.neon-button');
        expect(body).toMatch(/background:\s*transparent/);
        expect(body).toMatch(/border:\s*1px solid var\(--neon-blue\)/);
        expect(body).toMatch(/color:\s*var\(--text-glow\)/);
        expect(body).toMatch(/text-shadow:\s*var\(--glow-text-shadow\)/);
        expect(body).toMatch(/box-shadow:\s*var\(--glow-box-shadow\)/);
        expect(body).toMatch(/text-decoration:\s*none/);
    });

    it('glows brighter on hover and dims when disabled', () => {
        expect(rule(index, '.neon-button:hover')).toMatch(/box-shadow:\s*var\(--glow-box-shadow-strong\)/);
        expect(rule(index, '.neon-button:disabled')).toMatch(/opacity:/);
    });

    it('leaves colour, background and border off the header links', () => {
        const owned = /(^|[\s;])(color|background(-color)?|border(-color)?)\s*:/;
        [rule(projects, '.projects-calendar-link'), rule(projects, '.projects-calendar-link:hover'),
            rule(calendar, '.calendar-header a')].forEach((body) => expect(body).not.toMatch(owned));
    });
});
