import { gridCells, visibleKeys, countStates, walkKeys, nextUnfilledKey, cardKinds, toPairMap } from './combinations';

const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];
const P = (a, b, state, extra = {}) => ({ id: a * 100 + b, cardAId: a, cardBId: b, name: '', effect: '', notes: '', state, ...extra });

describe('recipe grid', () => {
    it('keeps the diagonal inert when recipe is false or omitted', () => {
        const diag = gridCells(cards).filter((c) => c.row.id === c.col.id);
        expect(diag.map((c) => c.kind)).toEqual(['diag', 'diag', 'diag']);
        expect(gridCells(cards, 'combinations', false)).toEqual(gridCells(cards));
        expect(visibleKeys(cards, 'combinations', false)).toEqual(['1|2', '1|3', '2|3']);
    });

    it('makes the diagonal live with key id|id when recipe is true', () => {
        const diag = gridCells(cards, 'combinations', true).filter((c) => c.row.id === c.col.id);
        expect(diag.map((c) => [c.kind, c.key])).toEqual([['live', '1|1'], ['live', '2|2'], ['live', '3|3']]);
    });

    it('lists diagonal keys in visibleKeys and counts them', () => {
        expect(visibleKeys(cards, 'combinations', true)).toEqual(['1|1', '1|2', '1|3', '2|2', '2|3', '3|3']);
        const map = toPairMap([P(2, 2, 'done')]);
        expect(countStates(cards, map, 'combinations', true)).toEqual({ total: 6, empty: 5, drafted: 0, done: 1, struck: 0 });
        expect(countStates(cards, map).total).toBe(3);
    });

    it('gives no diagonal cell to a card only on X', () => {
        const only = [{ id: 1, onY: false }, { id: 2 }];
        expect(visibleKeys(only, 'combinations', true)).toEqual(['1|2', '2|2']);
        expect(visibleKeys(only, 'combinations', true)).not.toContain('1|1');
    });

    it('lists the own key once in walkKeys, in partner order', () => {
        expect(walkKeys(cards, 2, 'combinations', true)).toEqual(['1|2', '2|2', '2|3']);
        expect(walkKeys(cards, 2)).toEqual(['1|2', '2|3']);
    });

    it('nextUnfilledKey steps onto an empty id|id key', () => {
        const keys = walkKeys(cards, 2, 'combinations', true);
        const pairs = toPairMap([P(1, 2, 'done')]);
        expect(nextUnfilledKey(keys, '1|2', pairs)).toBe('2|2');
    });
});

describe('cardKinds', () => {
    it('marks result cards of non-struck pairs as crafted, the rest base', () => {
        const pairs = [
            P(1, 2, 'done', { resultCardId: 3 }),
            P(1, 3, 'struck', { resultCardId: 2 }),
            P(2, 3, 'empty', { resultCardId: null }),
        ];
        expect(cardKinds(cards, pairs)).toEqual({ 1: 'base', 2: 'base', 3: 'crafted' });
    });
});
