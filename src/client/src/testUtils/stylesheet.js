import fs from 'fs';
import path from 'path';

const STYLING_DIR = path.join(__dirname, '..', 'components', 'Styling');

/**
 * Puts a real stylesheet into the jsdom document so `getComputedStyle` has
 * something to resolve against.
 *
 * CRA's Jest transform stubs `import './Thing.css'` out entirely, so a component
 * test renders with no rules in the document at all and cannot see a cascade bug
 * — which is how two of them reached a shipped page. jsdom does implement the
 * cascade, including the UA stylesheet's `[hidden] { display: none }` and the
 * author-beats-UA tie-break that makes a bare `display: flex` override it, once
 * the rules are actually loaded.
 *
 * jsdom computes declarations but never lays anything out, so assert what an
 * element resolves to, not where it lands on screen.
 */
export const loadStylesheets = (...names) => {
    const style = document.createElement('style');
    style.textContent = names
        .map((name) => fs.readFileSync(path.join(STYLING_DIR, name), 'utf8'))
        .join('\n');
    document.head.appendChild(style);

    return () => style.remove();
};

/**
 * Walks up from `element` to the ancestor it is positioned against — the one an
 * `position: absolute` child pins itself to.
 *
 * jsdom leaves `position` as the empty string when nothing sets it, so both that
 * and an explicit `static` mean "keep walking".
 */
export const containingBlockOf = (element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const { position } = getComputedStyle(parent);
        if (position && position !== 'static') return parent;
    }

    return null;
};
