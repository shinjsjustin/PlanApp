'use strict';

const { parseImport, toExportDeck, PAIR_STATES } = require('../../src/lib/combinationTransfer');

const sample = () => ({
    id: 'd_horde',
    name: 'HordeGame augments',
    cards: [
        { id: 'c_b', name: 'Burn', detail: 'fire' },
        { id: 'c_a', name: 'Arc' },
        { id: 'c_z', name: 'Zap', detail: 'bolt' },
    ],
    pairs: {
        'c_b|c_a': { name: 'Steam', effect: 'hot', notes: 'n', state: 'done' },
        'c_a|c_z': { name: 'Spark', state: 'bogus' },
        'c_a|c_ghost': { name: 'Ghost', state: 'done' },
        'c_a|c_a': { name: 'Self', state: 'done' },
    },
});

const throwsFor = (body, text) => {
    try {
        parseImport(body);
    } catch (e) {
        expect(e.status).toBe(400);
        expect(e.message).toContain(text);
        return;
    }
    throw new Error('expected parseImport to throw');
};

describe('parseImport', () => {
    it('normalises one deck, accepting keys in either order', () => {
        expect(parseImport(sample())).toEqual([
            {
                name: 'HordeGame augments',
                cards: [
                    { key: 'c_b', name: 'Burn', detail: 'fire' },
                    { key: 'c_a', name: 'Arc', detail: '' },
                    { key: 'c_z', name: 'Zap', detail: 'bolt' },
                ],
                pairs: [
                    { aKey: 'c_a', bKey: 'c_b', name: 'Steam', effect: 'hot', notes: 'n', state: 'done' },
                    { aKey: 'c_a', bKey: 'c_z', name: 'Spark', effect: '', notes: '', state: 'empty' },
                ],
            },
        ]);
    });

    it('takes a list and { decks }, ignoring app fields', () => {
        const list = parseImport([sample(), { ...sample(), name: 'Two' }]);
        expect(list.map((d) => d.name)).toEqual(['HordeGame augments', 'Two']);
        const wrapped = parseImport({ decks: [sample()], currentId: 'x', view: 'grid', walkCard: 'c_a' });
        expect(wrapped).toHaveLength(1);
        expect(wrapped[0].name).toBe('HordeGame augments');
    });

    it('treats a deck without pairs as having none', () => {
        expect(parseImport({ name: 'N', cards: [] })).toEqual([{ name: 'N', cards: [], pairs: [] }]);
    });

    it.each([
        ['no name', { cards: [] }, 'deck'],
        ['cards not an array', { name: 'Bad', cards: {} }, 'Bad'],
        ['card id missing', { name: 'Bad', cards: [{ name: 'x' }] }, 'Bad'],
        ['card id with pipe', { name: 'Bad', cards: [{ id: 'a|b', name: 'x' }] }, 'Bad'],
        ['duplicate card id', { name: 'Bad', cards: [{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }] }, 'Bad'],
        ['card not an object', { name: 'Bad', cards: [null] }, 'Bad'],
        ['body not an object', 'nope', 'deck'],
    ])('throws 400 for %s', (_label, body, text) => {
        throwsFor(body, text);
    });

    it('throws 400 naming the bad deck inside a list', () => {
        throwsFor([sample(), { name: 'Second', cards: 3 }], 'Second');
    });
});

describe('toExportDeck', () => {
    const cards = [
        { id: 7, name: 'Burn', detail: 'fire', position: 0 },
        { id: 3, name: 'Arc', detail: '', position: 1 },
        { id: 12, name: 'Zap', detail: 'bolt', position: 2 },
    ];
    const pair = (a, b, state, name = '') => ({
        card_a_id: a, card_b_id: b, name, effect: 'e', notes: 'n', state,
    });

    it('exports in card order, smaller string id first, only filled pairs', () => {
        const out = toExportDeck(
            { id: 5, name: 'HordeGame augments' },
            cards,
            [pair(3, 7, 'done', 'Steam'), pair(7, 12, 'empty'), pair(12, 3, 'struck', 'Odd')],
        );
        expect(out).toEqual({
            id: 'd_5',
            name: 'HordeGame augments',
            cards: [
                { id: 'c_7', name: 'Burn', detail: 'fire' },
                { id: 'c_3', name: 'Arc', detail: '' },
                { id: 'c_12', name: 'Zap', detail: 'bolt' },
            ],
            pairs: {
                'c_3|c_7': { name: 'Steam', effect: 'e', notes: 'n', state: 'done' },
                // 'c_12' sorts before 'c_3' as a string
                'c_12|c_3': { name: 'Odd', effect: 'e', notes: 'n', state: 'struck' },
            },
        });
    });

    it('round-trips through parseImport', () => {
        const out = toExportDeck({ id: 5, name: 'D' }, cards, [pair(3, 7, 'drafted', 'Steam')]);
        expect(parseImport(out)).toEqual([
            {
                name: 'D',
                cards: [
                    { key: 'c_7', name: 'Burn', detail: 'fire' },
                    { key: 'c_3', name: 'Arc', detail: '' },
                    { key: 'c_12', name: 'Zap', detail: 'bolt' },
                ],
                pairs: [{ aKey: 'c_3', bKey: 'c_7', name: 'Steam', effect: 'e', notes: 'n', state: 'drafted' }],
            },
        ]);
    });
});

describe('PAIR_STATES', () => {
    it('lists the four states', () => {
        expect(PAIR_STATES).toEqual(['empty', 'drafted', 'done', 'struck']);
    });
});
