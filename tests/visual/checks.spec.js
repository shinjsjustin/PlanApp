'use strict';

const { test, expect } = require('@playwright/test');
const checks = require('./checks');

const page = (body, head = '') =>
    `<!doctype html><html lang="en"><head><title>t</title>${head}</head><body style="margin:0">${body}</body></html>`;

const FIXTURES = {
    horizontalOverflow: {
        bad: page('<div id="wide" style="width:3000px;height:20px">wide</div>'),
        good: page('<div style="width:100px">narrow</div>'),
    },
    axeProblems: {
        bad: page('<button id="b"></button><input id="i" type="text">'),
        good: page('<button>Save</button><label for="i">Name</label><input id="i" type="text">'),
    },
    clippedText: {
        bad: page('<div id="c" style="width:50px;height:20px;overflow:hidden;white-space:nowrap">A very long label that is cut off</div>'),
        good: page(
            '<div title="A very long label that is cut off" style="width:50px;height:20px;overflow:hidden;white-space:nowrap">A very long label that is cut off</div>' +
                '<p style="width:300px">Short</p>'
        ),
    },
    underFixedBars: {
        bad: page(
            '<div style="height:3000px">Top</div><p>Last line of content</p>' +
                '<div style="position:fixed;bottom:0;left:0;width:100%;height:60px;background:#ccc">Bar</div>'
        ),
        good: page(
            '<div style="height:3000px">Top</div><p>Last line of content</p><div style="height:60px"></div>' +
                '<div style="position:fixed;bottom:0;left:0;width:100%;height:60px;background:#ccc">Bar</div>'
        ),
    },
    starterText: {
        bad: page('<h1>Add your feature pages</h1>'),
        good: page('<h1>Your weekly plan</h1>'),
    },
};

for (const [name, { bad, good }] of Object.entries(FIXTURES)) {
    test.describe(name, () => {
        test('returns a problem on a bad page', async ({ page: p }) => {
            await p.setContent(bad);
            const problems = await checks[name](p);
            expect(problems.length).toBeGreaterThan(0);
            expect(typeof problems[0]).toBe('string');
        });

        test('returns nothing on a good page', async ({ page: p }) => {
            await p.setContent(good);
            expect(await checks[name](p)).toEqual([]);
        });
    });
}

test.describe('detail', () => {
    test('axe is limited to the six named rules', async ({ page: p }) => {
        // an img without alt violates image-alt, which is not in the list
        await p.setContent(page('<img src="data:,"><button>ok</button>'));
        expect(await checks.axeProblems(p)).toEqual([]);
    });

    test('clipped text names the element', async ({ page: p }) => {
        await p.setContent(FIXTURES.clippedText.bad);
        const [problem] = await checks.clippedText(p);
        expect(problem).toContain('div#c');
    });

    test('a fixed bar does not count against its own children', async ({ page: p }) => {
        await p.setContent(
            page('<div style="position:fixed;top:0;left:0;width:100%;height:60px"><span>Inside</span></div><div style="height:3000px;padding-top:60px">x</div>')
        );
        expect(await checks.underFixedBars(p)).toEqual([]);
    });

    test('content in an inner scroller that ends under a bar is reported', async ({ page: p }) => {
        await p.setContent(
            page(
                '<div style="position:sticky;top:0;height:40px;background:#ccc">Sticky</div>' +
                    '<div id="s" style="height:40px;overflow:auto;margin-top:-40px"><div style="height:400px"></div><p>row</p></div>'
            )
        );
        expect((await checks.underFixedBars(p)).length).toBeGreaterThan(0);
    });

    test('starter text is matched case-sensitively per phrase', async ({ page: p }) => {
        for (const phrase of ['New Project', 'Tech Stack', 'TODO', 'Dashboard']) {
            await p.setContent(page(`<p>See the ${phrase} here</p>`));
            const problems = await checks.starterText(p);
            expect(problems.join()).toContain(phrase);
        }
    });

    test('checkPage runs all five checks', async ({ page: p }) => {
        await p.setContent(
            page('<div style="width:3000px">TODO</div><button></button>')
        );
        const problems = await checks.checkPage(p);
        const text = problems.join('\n');
        expect(text).toMatch(/overflow/i);
        expect(text).toContain('TODO');
        expect(text).toMatch(/button-name/);
    });

    test('checkPage returns nothing for a clean page', async ({ page: p }) => {
        await p.setContent(FIXTURES.axeProblems.good);
        expect(await checks.checkPage(p)).toEqual([]);
    });
});
