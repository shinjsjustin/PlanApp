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

it('scrolls the timeline sideways over a 21-day lane', () => {
    expect(rule('.chore-timeline-scroll')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.chore-timeline-lane')).toMatch(/min-width:\s*calc\(21 \* 0\.875rem\)/);
});

it('aliases the dark tokens on .chores-page', () => {
    const page = rule('.chores-page');
    [['surface', 'combo-surface'], ['raised', 'combo-surface-raised'], ['line', 'combo-line'],
        ['accent', 'neon-blue'], ['text', 'text-glow'], ['late', 'combo-struck'],
        ['future', 'color-schedule-future'], ['never', 'combo-empty']]
        .forEach(([alias, token]) => expect(page).toMatch(new RegExp(`--chores-${alias}:\\s*var\\(--${token}\\)`)));
});

it('uses no light surfaces and only --chores-* colours outside the alias rule', () => {
    expect(css).not.toMatch(/--bg-card|--bg-alt/);
    const rest = css.replace(rule('.chores-page'), '');
    expect(rest).not.toMatch(/var\(--(?:combo|neon|text|color|bg|shadow)/);
});

it('colours bars, tail and NOW from the chores tokens', () => {
    expect(rule('.chore-timeline-bar--future')).toContain('var(--chores-future)');
    expect(rule('.chore-timeline-bar--open')).toContain('var(--chores-accent)');
    expect(rule('.chore-timeline-bar--late')).toContain('var(--chores-late)');
    expect(rule('.chore-timeline-tail')).toContain('var(--chores-late)');
    expect(rule('.chore-timeline-tail')).toMatch(/opacity:\s*0?\.\d+/);
    expect(rule('.chore-timeline-now')).toContain('var(--chores-late)');
});

it('gives chips the bar colours', () => {
    expect(rule('.chore-chip--overdue')).toContain('var(--chores-late)');
    expect(rule('.chore-chip--due')).toContain('var(--chores-accent)');
    expect(rule('.chore-chip--upcoming')).toContain('var(--chores-future)');
    expect(rule('.chore-chip--never')).toContain('var(--chores-never)');
});

it('sets the label column width, wider from 700px', () => {
    expect(rule('.chore-timeline')).toMatch(/--chore-label-width:\s*110px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)\s*\{[^@]*\.chore-timeline\s*\{[^}]*--chore-label-width:\s*180px/);
});

it('makes only the label sticky, one line with ellipsis on a dark background', () => {
    expect(css.match(/position:\s*sticky/g)).toHaveLength(1);
    const label = rule('.chore-timeline-label');
    expect(label).toMatch(/position:\s*sticky/);
    expect(label).toMatch(/left:\s*0/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(label).toMatch(/white-space:\s*nowrap/);
    expect(label).toContain('background: var(--chores-surface)');
});

it('sizes rows about 2rem tall with a rounded 0.625rem bar', () => {
    expect(rule('.chore-timeline-row')).toMatch(/height:\s*2rem/);
    const bar = rule('.chore-timeline-bar');
    expect(bar).toMatch(/height:\s*0\.625rem/);
    expect(bar).toMatch(/border-radius:/);
});

it('offsets head and grid by the label width', () => {
    expect(rule('.chore-timeline-track')).toContain('var(--chore-label-width)');
    ['.chore-timeline-head', '.chore-timeline-grid', '.chore-timeline-now']
        .forEach((selector) => expect(rule(selector)).toMatch(/grid-column:\s*2/));
});

it('defines the new timeline selectors and pressed pill', () => {
    ['.chore-timeline-head', '.chore-timeline-now-tag', '.chore-timeline-dates', '.chore-timeline-grid',
        '.chore-timeline-day', '.chore-timeline-day--week', '.chore-timeline-lane', '.chore-timeline-empty']
        .forEach((selector) => expect(rule(selector)).not.toBe(''));
    expect(css).toMatch(/\.chores-filter button\[aria-pressed="true"\]\s*\{[^}]*var\(--chores-accent\)/);
});

it('wraps card buttons and filter rows', () => {
    expect(rule('.chores-filter')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.chore-actions')).toMatch(/flex-wrap:\s*wrap/);
});

it('stacks each timeline row as a full-width flex button', () => {
    const row = rule('.chore-timeline-row');
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(row).toMatch(/text-align:\s*left/);
});

it('lets taps pass through the NOW line and week labels', () => {
    expect(rule('.chore-timeline-now')).toMatch(/pointer-events:\s*none/);
    expect(rule('.chore-timeline-week')).toMatch(/pointer-events:\s*none/);
});

it('keeps warning and muted colours off the due chip, week labels and never line', () => {
    ['.chore-chip--due', '.chore-timeline-week', '.chore-timeline-never'].forEach((selector) => {
        expect(rule(selector)).not.toMatch(/--color-warning\)|--text-muted/);
    });
    expect(indexCss).toMatch(/--color-warning-dark:\s*#[0-9a-fA-F]{6};/);
});
