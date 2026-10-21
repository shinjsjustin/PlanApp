import fs from 'fs';
import path from 'path';

const projectCss = () => fs.readFileSync(path.join(__dirname, 'Project.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (css, selector) => {
    const escaped = selector.replace(/[.\\:()]/g, '\\$&');
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

const projectsCss = () => fs.readFileSync(path.join(__dirname, 'Projects.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

it('colours a completed today todo with --text-secondary, not --text-muted', () => {
    const body = rule(projectsCss(), '.today-todo--complete');

    expect(body).toMatch(/color:\s*var\(--text-secondary\)/);
    expect(body).not.toMatch(/--text-muted/);
});

it('gives the Rename button on a non-light-text card dark text and no glow', () => {
    const body = rule(projectsCss(), '.project-card:not(.project-card--light-text) .project-card-actions .neon-button');

    expect(body).not.toBeNull();
    expect(body).toMatch(/color:\s*var\(--text-primary\)/);
    expect(body).toMatch(/text-shadow:\s*none/);
});
