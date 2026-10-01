'use strict';

const cases = require('../../src/shared/planSchemaCases.json');
const { parsePlanSchema } = require('../../src/lib/planSchema');
const {
    PLAN_SCHEMA_MAX_LENGTH,
    PLAN_SCHEMA_MAX_SEQUENCES,
    PLAN_SCHEMA_MAX_TODOS,
    planSchemaTextSchema,
} = require('../../src/lib/validation');

const expect400 = (fn, message) => {
    let error;
    try {
        fn();
    } catch (e) {
        error = e;
    }
    expect(error).toBeDefined();
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(400);
    if (message instanceof RegExp) expect(error.message).toMatch(message);
};

describe('the shared table', () => {
    test('is loaded', () => {
        expect(cases.length).toBeGreaterThanOrEqual(4);
    });
});

describe.each(cases)('parsePlanSchema case: $name', (c) => {
    test('layer mode returns the layer title and sequences', () => {
        expect(parsePlanSchema(c.schema, { mode: 'layer' })).toEqual({
            layerTitle: c.layer.title,
            unorganized: [],
            sequences: c.sequences,
        });
    });
});

describe('parsePlanSchema', () => {
    test('sequences mode ignores a leading ## title', () => {
        const result = parsePlanSchema('## Ignored\n### A\n- x\n', { mode: 'sequences' });
        expect(result.sequences).toEqual([{ title: 'A', todos: ['x'] }]);
        expect(result.unorganized).toEqual([]);
    });

    test('sequences mode works without a ## line', () => {
        const result = parsePlanSchema('### A\n- x\n', { mode: 'sequences' });
        expect(result.sequences).toEqual([{ title: 'A', todos: ['x'] }]);
    });

    test('todos before the first ### go to unorganized', () => {
        const result = parsePlanSchema('## L\n- loose\n### A\n- x\n', { mode: 'layer' });
        expect(result.unorganized).toEqual(['loose']);
        expect(result.sequences).toEqual([{ title: 'A', todos: ['x'] }]);
    });

    test('trims lines and skips blanks', () => {
        const result = parsePlanSchema('  ## L  \n\n   \n  ###   A \n  -   x  \n', { mode: 'layer' });
        expect(result.layerTitle).toBe('L');
        expect(result.sequences).toEqual([{ title: 'A', todos: ['x'] }]);
    });

    test('layer mode requires ## as the first content line', () => {
        expect400(() => parsePlanSchema('### A\n', { mode: 'layer' }), /^line 1:/);
        expect400(() => parsePlanSchema('\n\n- x\n## L\n', { mode: 'layer' }), /^line 3:/);
    });

    test('rejects a second ## line with its line number', () => {
        expect400(() => parsePlanSchema('## L\n### A\n## M\n', { mode: 'layer' }), /^line 3:/);
    });

    test('rejects a ## that is not first in sequences mode', () => {
        expect400(() => parsePlanSchema('### A\n## M\n', { mode: 'sequences' }), /^line 2:/);
    });

    test.each([
        ['unknown line', '## L\nhello\n', /^line 2:/],
        ['#### heading', '## L\n#### Deep\n', /^line 2:/],
        ['# heading', '# Top\n## L\n', /^line 1:/],
        ['heading without space', '## L\n###A\n', /^line 2:/],
        ['empty sequence title', '## L\n### \n', /^line 2:/],
        ['empty layer title', '## \n', /^line 1:/],
        ['empty todo text', '## L\n-\n', /^line 2:/],
        ['over-long title', `## L\n### ${'a'.repeat(256)}\n`, /^line 2:/],
        ['over-long todo', `## L\n- ${'a'.repeat(501)}\n`, /^line 2:/],
    ])('rejects %s', (_name, text, pattern) => {
        expect400(() => parsePlanSchema(text, { mode: 'layer' }), pattern);
    });

    test('rejects empty input', () => {
        expect400(() => parsePlanSchema('', { mode: 'sequences' }));
        expect400(() => parsePlanSchema(' \n\n', { mode: 'sequences' }));
    });

    test('rejects text over the length cap', () => {
        const todos = '- a\n'.repeat(PLAN_SCHEMA_MAX_LENGTH / 4 + 1);
        expect400(() => parsePlanSchema(todos, { mode: 'sequences' }));
    });

    test('rejects more than the sequence cap and accepts exactly the cap', () => {
        const build = (n) => Array.from({ length: n }, (_, i) => `### S${i}\n`).join('');
        expect(
            parsePlanSchema(build(PLAN_SCHEMA_MAX_SEQUENCES), { mode: 'sequences' }).sequences
        ).toHaveLength(PLAN_SCHEMA_MAX_SEQUENCES);
        expect400(() => parsePlanSchema(build(PLAN_SCHEMA_MAX_SEQUENCES + 1), { mode: 'sequences' }));
    });

    test('rejects more than the todo cap and accepts exactly the cap', () => {
        const build = (n) => `### S\n${'- \n'.replace(' ', 'a').repeat(n)}`;
        expect(
            parsePlanSchema(build(PLAN_SCHEMA_MAX_TODOS), { mode: 'sequences' }).sequences[0].todos
        ).toHaveLength(PLAN_SCHEMA_MAX_TODOS);
        expect400(() => parsePlanSchema(build(PLAN_SCHEMA_MAX_TODOS + 1), { mode: 'sequences' }));
    });
});

describe('planSchemaTextSchema', () => {
    test('accepts text at the cap and rejects over it', () => {
        expect(planSchemaTextSchema.safeParse('a'.repeat(PLAN_SCHEMA_MAX_LENGTH)).success).toBe(true);
        expect(planSchemaTextSchema.safeParse('a'.repeat(PLAN_SCHEMA_MAX_LENGTH + 1)).success).toBe(false);
    });
});
