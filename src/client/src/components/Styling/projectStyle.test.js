import fs from 'fs';
import path from 'path';

const projectCss = () => fs.readFileSync(path.join(__dirname, 'Project.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (css, selector) => {
    const escaped = selector.replace(/[.\\]/g, '\\$&');
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return match ? match[1] : null;
};

it('lays .project-nav out as a wrapping row', () => {
    const body = rule(projectCss(), '.project-nav');

    expect(body).not.toBeNull();
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-direction:\s*row/);
    expect(body).toMatch(/flex-wrap:\s*wrap/);
});

it('lets .layer-row-title wrap long names without a width cap', () => {
    const body = rule(projectCss(), '.layer-row-title');

    expect(body).not.toBeNull();
    expect(body).not.toMatch(/max-width/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
});
