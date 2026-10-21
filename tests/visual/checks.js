'use strict';

const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..', '..', 'src', 'client');
const AXE_PATH = require.resolve('axe-core/axe.min.js', { paths: [CLIENT_DIR] });
const AXE_RULES = ['color-contrast', 'label', 'button-name', 'link-name', 'select-name', 'aria-input-field-name'];
const STARTER_PHRASES = ['New Project', 'Tech Stack', 'TODO', 'Dashboard', 'Add your feature pages'];

// Runs in the browser. Names an element as tag#id.class for problem strings.
const DESCRIBE_SOURCE = `
    const describe = (el) => {
        const id = el.id ? '#' + el.id : '';
        const cls = typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
        return el.tagName.toLowerCase() + id + cls;
    };
`;

const inPage = (page, body, arg) =>
    page.evaluate(new Function('arg', `${DESCRIBE_SOURCE}\n${body}`), arg);

async function horizontalOverflow(page) {
    return inPage(page, `
        const width = document.documentElement.clientWidth;
        const scroll = document.documentElement.scrollWidth;
        if (scroll <= width) return [];
        const offender = [...document.body.querySelectorAll('*')]
            .find((el) => el.getBoundingClientRect().right > width + 1);
        const name = offender ? describe(offender) : 'document';
        return [name + ' makes the page ' + scroll + 'px wide in a ' + width + 'px viewport (horizontal overflow)'];
    `);
}

async function axeProblems(page) {
    const hasAxe = await page.evaluate(() => Boolean(window.axe));
    if (!hasAxe) await page.addScriptTag({ path: AXE_PATH });
    return page.evaluate(async (rules) => {
        const result = await window.axe.run(document, { runOnly: { type: 'rule', values: rules } });
        return result.violations.flatMap((v) =>
            v.nodes.map((n) => `${n.target.join(' ')}: ${v.id} - ${v.help}`)
        );
    }, AXE_RULES);
}

async function clippedText(page) {
    return inPage(page, `
        const TOLERANCE = 1;
        const hidesOverflow = (value) => value === 'hidden' || value === 'clip';
        const ownText = (el) => [...el.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
        const problems = [];
        for (const el of document.body.querySelectorAll('*')) {
            if (!el.checkVisibility() || !ownText(el)) continue;
            const style = getComputedStyle(el);
            const clipsX = hidesOverflow(style.overflowX) && el.scrollWidth > el.clientWidth + TOLERANCE;
            const clipsY = hidesOverflow(style.overflowY) && el.scrollHeight > el.clientHeight + TOLERANCE;
            if (!clipsX && !clipsY) continue;
            const titled = el.closest('[title]');
            if (titled && titled.title.includes(el.textContent.trim())) continue;
            problems.push(describe(el) + ' text is clipped: "' + ownText(el).slice(0, 40) + '"');
        }
        return problems;
    `);
}

async function underFixedBars(page) {
    return inPage(page, `
        const isBar = (el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position);
        const all = [...document.body.querySelectorAll('*')];

        window.scrollTo(0, document.documentElement.scrollHeight);
        for (const el of all) {
            if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
                el.scrollTop = el.scrollHeight;
                el.scrollLeft = el.scrollWidth;
            }
        }

        const bars = all.filter((el) => isBar(el) && el.checkVisibility()
            && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
        if (!bars.length) return [];

        const CONTROLS = new Set(['IMG', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'CANVAS', 'VIDEO']);
        const contentRect = (el) => {
            const texts = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
            if (texts.length) {
                const range = document.createRange();
                range.selectNodeContents(el);
                return range.getBoundingClientRect();
            }
            return CONTROLS.has(el.tagName.toUpperCase()) ? el.getBoundingClientRect() : null;
        };
        const intersects = (a, b) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        // A scroller or overflow:hidden ancestor hides content that has scrolled out of its box.
        const isClipped = (el, rect) => {
            for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
                const s = getComputedStyle(p);
                if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
                if (!intersects(rect, p.getBoundingClientRect())) return true;
            }
            return false;
        };

        const problems = [];
        for (const el of all) {
            if (!el.checkVisibility()) continue;
            let fixedAncestor = false;
            for (let p = el; p && p !== document.body; p = p.parentElement) {
                if (isBar(p)) fixedAncestor = true;
            }
            if (fixedAncestor) continue;
            const rect = contentRect(el);
            if (!rect || isClipped(el, rect)) continue;
            for (const bar of bars) {
                if (bar.contains(el) || el.contains(bar)) continue;
                if (intersects(rect, bar.getBoundingClientRect())) {
                    problems.push(describe(el) + ' sits under ' + describe(bar) + ' when scrolled to the end');
                }
            }
        }
        return problems;
    `);
}

async function starterText(page) {
    const text = await page.evaluate(() => document.body.innerText);
    return STARTER_PHRASES.filter((phrase) => text.includes(phrase)).map(
        (phrase) => `body contains starter text "${phrase}"`
    );
}

async function checkPage(page) {
    // Sequential: underFixedBars scrolls the page, which the others shouldn't race.
    const results = [];
    for (const check of [horizontalOverflow, axeProblems, clippedText, starterText, underFixedBars]) {
        results.push(await check(page));
    }
    return results.flat();
}

module.exports = { horizontalOverflow, axeProblems, clippedText, underFixedBars, starterText, checkPage };
