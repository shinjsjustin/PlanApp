import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'Chores.css'), 'utf8');

it('uses no hex or rgb colour literals in Chores.css', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

it('uses no pixel spacing literals for padding, margin or gap', () => {
    expect(css).not.toMatch(/(?:padding|margin|gap)[a-z-]*:[^;]*\d+px/);
});

it('wraps long text with an overflow-wrap rule', () => {
    expect(css).toMatch(/overflow-wrap:\s*(?:anywhere|break-word)/);
});

it('defines the chore selectors', () => {
    ['.chore-row', '.chore-title', '.chore-details', '.chore-badge--overdue', '.chore-actions', '.chore-done', '.chores-page']
        .forEach((selector) => expect(css).toContain(selector));
});

it('defines the hint, history and archived selectors', () => {
    ['.chore-hint', '.chore-history', '.chores-archived']
        .forEach((selector) => expect(css).toContain(selector));
});

const indexCss = fs.readFileSync(path.join(__dirname, '..', '..', 'index.css'), 'utf8');
const rule = (selector) => {
    const escaped = selector.replace(/[.\-]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
};

it('defines every timeline selector', () => {
    ['.chore-timeline', '.chore-timeline-scroll', '.chore-timeline-track', '.chore-timeline-week',
        '.chore-timeline-now', '.chore-timeline-row', '.chore-timeline-label', '.chore-timeline-bar',
        '.chore-timeline-bar--future', '.chore-timeline-bar--open', '.chore-timeline-bar--late',
        '.chore-timeline-bar--cut-start', '.chore-timeline-bar--cut-end', '.chore-timeline-tail',
        '.chore-timeline-never']
        .forEach((selector) => expect(rule(selector)).not.toBe(''));
});

it('defines every card selector', () => {
    ['.chore-grid', '.chore-chip', '.chore-chip--overdue', '.chore-chip--due', '.chore-chip--upcoming',
        '.chore-chip--never', '.chore-row--highlight', '.chores-filter']
        .forEach((selector) => expect(rule(selector)).not.toBe(''));
});

it('defines the schedule tokens in :root', () => {
    expect(indexCss).toMatch(/--color-schedule-future:\s*#[0-9a-fA-F]{3,6};/);
    expect(indexCss).toMatch(/--color-danger-faint:\s*rgba\(/);
});

it('lays the grid out as two columns, auto-filling from 700px', () => {
    expect(rule('.chore-grid')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)\s*\{[^@]*\.chore-grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(16rem,\s*1fr\)\)/);
});

it('scrolls the timeline sideways over a 21-day track', () => {
    expect(rule('.chore-timeline-scroll')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.chore-timeline-track')).toMatch(/min-width:\s*calc\(21 \* 1\.75rem\)/);
});

it('colours bars, tail and NOW from tokens', () => {
    expect(rule('.chore-timeline-bar--future')).toContain('var(--color-schedule-future)');
    expect(rule('.chore-timeline-bar--open')).toContain('var(--color-accent)');
    expect(rule('.chore-timeline-bar--late')).toContain('var(--color-danger)');
    expect(rule('.chore-timeline-tail')).toContain('var(--color-danger-faint)');
    expect(rule('.chore-timeline-now')).toContain('var(--color-danger)');
});

it('wraps card buttons and filter rows', () => {
    expect(rule('.chores-filter')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.chore-actions')).toMatch(/flex-wrap:\s*wrap/);
});
