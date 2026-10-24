import { PAIR_STATES, pairKey, toPairMap, getPair, countStates, walkKeys, stepKey, nextUnfilledKey, exportFileName, axisCards, gridCells, visibleKeys } from './combinations';

const P = (a, b, state, name = '') => ({ id: a * 100 + b, cardAId: a, cardBId: b, name, effect: '', notes: '', state });

describe('combinations helpers', () => {
    it('lists the four pair states in order', () => {
        expect(PAIR_STATES).toEqual(['empty', 'drafted', 'done', 'struck']);
    });

    it.each([
        [2, 10, '2|10'],
        [10, 2, '2|10'],
        [5, 7, '5|7'],
    ])('pairKey(%i, %i) puts the numerically smaller id first: %s', (a, b, key) => {
        expect(pairKey(a, b)).toBe(key);
    });

    it('toPairMap keys saved pairs by their card ids', () => {
        const pairs = [P(2, 10, 'done', 'X'), P(1, 3, 'struck')];
        expect(toPairMap(pairs)).toEqual({ '2|10': pairs[0], '1|3': pairs[1] });
    });

    it('getPair returns the saved pair in either order', () => {
        const map = toPairMap([P(2, 10, 'done', 'X')]);
        expect(getPair(map, 10, 2).name).toBe('X');
    });

    it('getPair returns an empty pair when missing', () => {
        expect(getPair({}, 1, 2)).toEqual({ name: '', effect: '', notes: '', state: 'empty' });
    });

    it('countStates counts every card pair, unsaved ones as empty', () => {
        const cards = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const map = toPairMap([P(1, 2, 'done'), P(3, 4, 'done'), P(1, 4, 'drafted'), P(2, 3, 'struck')]);
        expect(countStates(cards, map)).toEqual({ total: 6, empty: 2, drafted: 1, done: 2, struck: 1 });
    });

    it('countStates ignores saved pairs of cards no longer in the deck', () => {
        const map = toPairMap([P(1, 9, 'done')]);
        expect(countStates([{ id: 1 }, { id: 2 }], map)).toEqual({ total: 1, empty: 1, drafted: 0, done: 0, struck: 0 });
    });
});

describe('walkthrough helpers', () => {
    const cards = [{ id: 3 }, { id: 1 }, { id: 2 }];

    it('walkKeys pairs the card with every other card in deck order', () => {
        expect(walkKeys(cards, 1)).toEqual(['1|3', '1|2']);
        expect(walkKeys(cards, 3)).toEqual(['1|3', '2|3']);
    });

    it('stepKey moves forward and back, wrapping at both ends', () => {
        const keys = ['a', 'b', 'c'];
        expect(stepKey(keys, 'a', 1)).toBe('b');
        expect(stepKey(keys, 'c', 1)).toBe('a');
        expect(stepKey(keys, 'b', -1)).toBe('a');
        expect(stepKey(keys, 'a', -1)).toBe('c');
    });

    it('stepKey starts at the first or last key when nothing in the list is open', () => {
        expect(stepKey(['a', 'b'], null, 1)).toBe('a');
        expect(stepKey(['a', 'b'], 'zzz', -1)).toBe('b');
    });

    it('stepKey returns null for an empty list', () => {
        expect(stepKey([], null, 1)).toBeNull();
    });

    it('nextUnfilledKey finds the next empty pair after the open one, wrapping', () => {
        const keys = ['1|2', '1|3', '1|4'];
        const pairs = { '1|2': { state: 'done' }, '1|4': { state: 'drafted' } };
        expect(nextUnfilledKey(keys, '1|2', pairs)).toBe('1|3');
        expect(nextUnfilledKey(keys, null, pairs)).toBe('1|3');
        expect(nextUnfilledKey(keys, '1|3', { ...pairs, '1|3': { state: 'done' }, '1|4': { state: 'struck' } })).toBeNull();
    });

    it('nextUnfilledKey wraps past the end and may return the open pair itself', () => {
        const keys = ['1|2', '1|3'];
        expect(nextUnfilledKey(keys, '1|3', { '1|3': { state: 'done' } })).toBe('1|2');
        expect(nextUnfilledKey(keys, '1|2', { '1|3': { state: 'done' } })).toBe('1|2');
    });
});

describe('exportFileName', () => {
    it.each([
        ['Fire and Ice', 'Fire-and-Ice.json'],
        ['  Hot / Cold!  ', 'Hot-Cold.json'],
        ['a_b-c', 'a_b-c.json'],
        ['', 'deck.json'],
        ['***', 'deck.json'],
    ])('names %j as %s', (name, expected) => {
        expect(exportFileName(name)).toBe(expected);
    });
});

describe('axes and mode', () => {
    const deck = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const rect = [
        { id: 5, onX: true, onY: false },
        { id: 6, onX: true, onY: false },
        { id: 7, onX: false, onY: true },
    ];

    it('pairKey keeps the order given in permutations', () => {
        expect(pairKey(10, 2, 'permutations')).toBe('10|2');
        expect(pairKey(10, 2, 'combinations')).toBe('2|10');
    });

    it('toPairMap keys rows by cardAId|cardBId in permutations', () => {
        const pairs = [P(10, 2, 'done'), P(2, 10, 'drafted')];
        expect(toPairMap(pairs, 'permutations')).toEqual({ '10|2': pairs[0], '2|10': pairs[1] });
    });

    it('getPair reads one ordered pair in permutations', () => {
        const map = toPairMap([P(10, 2, 'done', 'X')], 'permutations');
        expect(getPair(map, 10, 2, 'permutations').name).toBe('X');
        expect(getPair(map, 2, 10, 'permutations').state).toBe('empty');
    });

    it('axisCards puts onY cards in rows and onX in cols, missing flag counting as on', () => {
        expect(axisCards(rect)).toEqual({ rows: [rect[2]], cols: [rect[0], rect[1]] });
        expect(axisCards(deck)).toEqual({ rows: deck, cols: deck });
        expect(axisCards([{ id: 1, onX: false }])).toEqual({ rows: [{ id: 1, onX: false }], cols: [] });
    });

    it('gridCells of a rectangle are all live', () => {
        const cells = gridCells(rect, 'combinations');
        expect(cells.map((c) => [c.row.id, c.col.id, c.kind, c.key])).toEqual([
            [7, 5, 'live', '5|7'],
            [7, 6, 'live', '6|7'],
        ]);
    });

    it('gridCells marks the diagonal and the later-row mirror in combinations', () => {
        const cells = gridCells(deck, 'combinations');
        expect(cells.map((c) => `${c.row.id}${c.col.id}:${c.kind}`)).toEqual([
            '33:diag', '31:live', '32:live',
            '13:mirror', '11:diag', '12:live',
            '23:mirror', '21:mirror', '22:diag',
        ]);
        expect(cells[1].key).toBe('1|3');
        expect(cells[3].key).toBe('1|3');
    });

    it('gridCells makes both orders live in permutations', () => {
        const cells = gridCells([{ id: 1 }, { id: 2 }], 'permutations');
        expect(cells.map((c) => `${c.kind}:${c.key}`)).toEqual(['diag:1|1', 'live:1|2', 'live:2|1', 'diag:2|2']);
    });

    it('visibleKeys lists unique live keys', () => {
        expect(visibleKeys(deck)).toEqual(['1|3', '2|3', '1|2']);
        expect(visibleKeys(deck, 'permutations')).toEqual(['3|1', '3|2', '1|3', '1|2', '2|3', '2|1']);
        expect(visibleKeys(rect)).toEqual(['5|7', '6|7']);
    });

    it('countStates counts a mirror once and ordered pairs separately', () => {
        const two = [{ id: 1 }, { id: 2 }];
        const map = toPairMap([P(1, 2, 'done')], 'permutations');
        expect(countStates(two, map, 'permutations')).toEqual({ total: 2, empty: 1, drafted: 0, done: 1, struck: 0 });
        expect(countStates(rect, {})).toEqual({ total: 2, empty: 2, drafted: 0, done: 0, struck: 0 });
    });

    it('walkKeys lists visible keys with the card by partner, own-first in permutations', () => {
        expect(walkKeys(deck, 1, 'permutations')).toEqual(['1|3', '3|1', '1|2', '2|1']);
        expect(walkKeys(rect, 7)).toEqual(['5|7', '6|7']);
        expect(walkKeys(rect, 5)).toEqual(['5|7']);
    });

    it('nextUnfilledKey skips a filled ordered pair', () => {
        const keys = ['1|2', '2|1'];
        const pairs = toPairMap([P(1, 2, 'done')], 'permutations');
        expect(nextUnfilledKey(keys, null, pairs, 'permutations')).toBe('2|1');
        expect(nextUnfilledKey(keys, '2|1', pairs, 'permutations')).toBe('2|1');
    });
});
