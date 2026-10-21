import fs from 'fs';
import path from 'path';

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');
const addressBookCss = () => read('components', 'Styling', 'AddressBook.css');

const rule = (css, selector) => {
    const escaped = selector.replace(/[.\\]/g, '\\$&');
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return match ? match[1] : null;
};

it('lays .person-list out as an auto-fill grid of --person-card-min-width columns', () => {
    const body = rule(addressBookCss(), '.person-list');

    expect(body).not.toBeNull();
    expect(body).toMatch(/display:\s*grid/);
    expect(body).toMatch(/grid-template-columns:\s*repeat\(\s*auto-fill\s*,\s*minmax\(\s*var\(--person-card-min-width\)\s*,\s*1fr\s*\)\s*\)/);
    expect(body).toMatch(/gap:\s*var\(--space-md\)/);
});

it('gives the phone .person-list a single column', () => {
    const body = rule(addressBookCss(), '.address-book-page--phone .person-list');

    expect(body).not.toBeNull();
    expect(body).toMatch(/grid-template-columns:\s*1fr\s*;/);
});

it('defines --person-card-min-width in index.css', () => {
    expect(read('index.css')).toMatch(/--person-card-min-width:\s*260px\s*;/);
});

it('keeps person cards free of a bottom margin and drops .person-new', () => {
    const css = addressBookCss();

    expect(rule(css, '.person-item')).not.toMatch(/margin-bottom/);
    expect(css).not.toMatch(/\.person-new/);
});

it('uses no hex or rgb colour literals in AddressBook.css', () => {
    expect(addressBookCss()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

const placesCss = () => read('components', 'Styling', 'Places.css');

it.each(['.address-book-page', '.form-dialog'])('sets %s text to the light --text-glow', (selector) => {
    expect(rule(addressBookCss(), selector)).toMatch(/(?:^|[;\s])color:\s*var\(--text-glow\)/);
});

it.each([
    '.places-header h1',
    '.place-name',
    '.place-address',
])('gives %s a light colour token instead of inheriting', (selector) => {
    expect(rule(placesCss(), selector)).toMatch(/(?:^|[;\s])color:\s*var\(--text-glow\)/);
});

it('keeps .place-kind on a light muted token, not a dark one', () => {
    const body = rule(placesCss(), '.place-kind,\n.place-visit');

    expect(body).toMatch(/(?:^|[;\s])color:\s*var\(--(?:text-glow|text-muted)\)/);
});
