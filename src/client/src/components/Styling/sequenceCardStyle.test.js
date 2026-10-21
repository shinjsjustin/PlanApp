import fs from 'fs';
import path from 'path';

const read = (name) =>
    fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const cardCss = read('SequenceCard.css');
const todosCss = read('Todos.css');

const rule = (css, selector) => {
    const escaped = selector.replace(/[.\\]/g, '\\$&');
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return match ? match[1] : null;
};

const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const contrastOnWhite = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return 1.05 / (luminance + 0.05);
};

const tokenColor = (name) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(rule(cardCss, '.sequence-card'));
    return match ? match[1] : null;
};

const usedToken = (body) => {
    const match = /(?:^|[\s;])color:\s*var\((--seq-[\w-]+)\)/.exec(body);
    return match ? match[1] : null;
};

it.each([
    ['.sequence-card-status', cardCss],
    ['.sequence-card-badge', cardCss],
    ['.sequence-card-description', cardCss],
    ['.todo-add-row-placeholder', todosCss],
])('colours %s with a token of at least 4.5:1 on white', (selector, css) => {
    const token = usedToken(rule(css, selector));

    expect(token).not.toBeNull();
    const hex = tokenColor(token);
    expect(hex).not.toBeNull();
    expect(contrastOnWhite(hex)).toBeGreaterThanOrEqual(4.5);
});
