// Pure helpers for a deck's pairs. A pair is unordered, so it is looked up by a
// key with the numerically smaller card id first (mirrors the prototype).

export const PAIR_STATES = ['empty', 'drafted', 'done', 'struck'];

const EMPTY_PAIR = { name: '', effect: '', notes: '', state: 'empty' };

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const toPairMap = (pairs) =>
    pairs.reduce((map, pair) => ({ ...map, [pairKey(pair.cardAId, pair.cardBId)]: pair }), {});

export const getPair = (pairs, a, b) => pairs[pairKey(a, b)] || EMPTY_PAIR;

// Counts every pair the deck's cards can form; unsaved pairs read as empty.
export const countStates = (cards, pairs) => {
    const counts = { total: 0, empty: 0, drafted: 0, done: 0, struck: 0 };
    cards.forEach((card, i) => {
        cards.slice(i + 1).forEach((other) => {
            counts.total += 1;
            counts[getPair(pairs, card.id, other.id).state] += 1;
        });
    });
    return counts;
};
