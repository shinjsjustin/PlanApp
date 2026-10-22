import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Combinations.css'), 'utf8');
const indexCss = fs.readFileSync(path.join(__dirname, '..', '..', 'index.css'), 'utf8');

it('uses no hex or rgb colour literals in Combinations.css', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

it('uses no pixel spacing literals for padding, margin or gap', () => {
    expect(css).not.toMatch(/(?:padding|margin|gap)[a-z-]*:[^;]*\d+px/);
});

it('scopes every rule under .combinations-page', () => {
    const selectors = css.replace(/@media[^{]*\{/g, '').match(/[^{}]+(?=\{)/g) || [];
    selectors.forEach((group) => {
        group.split(',').forEach((s) => expect(s.trim()).toMatch(/^\.combinations-page/));
    });
});

it.each(['empty', 'drafted', 'done', 'struck', 'surface', 'line', 'card'])(
    'defines --combo-%s in index.css :root and uses it',
    (name) => {
        expect(indexCss).toMatch(new RegExp(`--combo-${name}:\\s*[^;]+;`));
        expect(css).toContain(`var(--combo-${name})`);
    },
);
