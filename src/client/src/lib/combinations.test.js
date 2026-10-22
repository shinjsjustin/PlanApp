import { PAIR_STATES, pairKey, toPairMap, getPair, countStates } from './combinations';

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
