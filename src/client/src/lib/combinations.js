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

// Walkthrough: the keys of one card's pairs, in deck order.
export const walkKeys = (cards, cardId) =>
    cards.filter((c) => c.id !== cardId).map((c) => pairKey(cardId, c.id));

// Moves one key forward or back, wrapping; with nothing open it starts at an end.
export const stepKey = (keys, selectedKey, dir) => {
    if (keys.length === 0) return null;
    const idx = keys.indexOf(selectedKey);
    if (idx < 0) return dir > 0 ? keys[0] : keys[keys.length - 1];
    return keys[(idx + dir + keys.length) % keys.length];
};

// The next empty pair after the open one (wrapping), or null when all are filled.
export const nextUnfilledKey = (keys, selectedKey, pairs) => {
    const idx = keys.indexOf(selectedKey);
    for (let n = 1; n <= keys.length; n += 1) {
        const key = keys[(idx + n + keys.length) % keys.length];
        const [a, b] = key.split('|').map(Number);
        if (getPair(pairs, a, b).state === 'empty') return key;
    }
    return null;
};

const DEFAULT_EXPORT_NAME = 'deck';

// The download name for an exported deck: the deck name as a slug plus .json.
export const exportFileName = (name) =>
    `${name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || DEFAULT_EXPORT_NAME}.json`;
