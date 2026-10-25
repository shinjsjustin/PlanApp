// Pure helpers for a deck's grid and pairs. Cards sit on the grid's rows (onY) and
// columns (onX); a missing flag counts as on. In combinations mode a pair is
// unordered, keyed with the numerically smaller card id first, and when both orders
// show, the cell whose row comes later in deck order is a mirror. In permutations
// mode a pair is ordered: the cell at row R, column C is the key 'R|C'. Every helper
// takes an optional mode, defaulting to combinations. The grid helpers also take an
// optional recipe flag after it: in a recipe deck a card paired with itself is a live
// cell keyed 'id|id' instead of an inert diagonal.

export const PAIR_STATES = ['empty', 'drafted', 'done', 'struck'];

const EMPTY_PAIR = { name: '', effect: '', notes: '', state: 'empty' };
const COMBINATIONS = 'combinations';
const PERMUTATIONS = 'permutations';

export const pairKey = (a, b, mode = COMBINATIONS) =>
    mode === PERMUTATIONS || a < b ? `${a}|${b}` : `${b}|${a}`;

export const toPairMap = (pairs, mode = COMBINATIONS) =>
    pairs.reduce((map, pair) => ({ ...map, [pairKey(pair.cardAId, pair.cardBId, mode)]: pair }), {});

export const getPair = (pairs, a, b, mode = COMBINATIONS) => pairs[pairKey(a, b, mode)] || EMPTY_PAIR;

export const axisCards = (cards) => ({
    rows: cards.filter((c) => c.onY !== false),
    cols: cards.filter((c) => c.onX !== false),
});

// Every row x column cell, row by row, as { row, col, kind, key }.
export const gridCells = (cards, mode = COMBINATIONS, recipe = false) => {
    const { rows, cols } = axisCards(cards);
    const rowIndex = (card) => rows.findIndex((r) => r.id === card.id);
    const isMirror = (row, col) =>
        mode === COMBINATIONS && rowIndex(col) >= 0 && cols.some((c) => c.id === row.id) && rowIndex(col) < rowIndex(row);
    return rows.flatMap((row) =>
        cols.map((col) => {
            const key = pairKey(row.id, col.id, mode);
            if (row.id === col.id) return recipe ? { row, col, kind: 'live', key } : { row, col, kind: 'diag', key };
            return { row, col, kind: isMirror(row, col) ? 'mirror' : 'live', key };
        }));
};

export const visibleKeys = (cards, mode = COMBINATIONS, recipe = false) =>
    gridCells(cards, mode, recipe).filter((cell) => cell.kind === 'live').map((cell) => cell.key);

// Counts every visible pair; unsaved pairs read as empty.
export const countStates = (cards, pairs, mode = COMBINATIONS, recipe = false) => {
    const counts = { total: 0, empty: 0, drafted: 0, done: 0, struck: 0 };
    visibleKeys(cards, mode, recipe).forEach((key) => {
        counts.total += 1;
        counts[(pairs[key] || EMPTY_PAIR).state] += 1;
    });
    return counts;
};

// Walkthrough: the visible keys holding one card, by partner in deck order; in
// permutations the card's own-first key comes before the partner-first one.
export const walkKeys = (cards, cardId, mode = COMBINATIONS, recipe = false) => {
    const order = (key) => {
        const [a, b] = key.split('|').map(Number);
        const partner = a === cardId ? b : a;
        return cards.findIndex((c) => c.id === partner) * 2 + (a === cardId ? 0 : 1);
    };
    return visibleKeys(cards, mode, recipe)
        .filter((key) => key.split('|').map(Number).includes(cardId))
        .sort((x, y) => order(x) - order(y));
};

// Each card's kind: crafted when a non-struck pair's result is that card, else base.
export const cardKinds = (cards, pairs) => {
    const craftedIds = new Set(pairs.filter((p) => p.state !== 'struck').map((p) => p.resultCardId));
    return Object.fromEntries(cards.map((c) => [c.id, craftedIds.has(c.id) ? 'crafted' : 'base']));
};

// Moves one key forward or back, wrapping; with nothing open it starts at an end.
export const stepKey = (keys, selectedKey, dir) => {
    if (keys.length === 0) return null;
    const idx = keys.indexOf(selectedKey);
    if (idx < 0) return dir > 0 ? keys[0] : keys[keys.length - 1];
    return keys[(idx + dir + keys.length) % keys.length];
};

// The next empty pair after the open one (wrapping), or null when all are filled.
export const nextUnfilledKey = (keys, selectedKey, pairs, mode = COMBINATIONS) => {
    const idx = keys.indexOf(selectedKey);
    for (let n = 1; n <= keys.length; n += 1) {
        const key = keys[(idx + n + keys.length) % keys.length];
        const [a, b] = key.split('|').map(Number);
        if (getPair(pairs, a, b, mode).state === 'empty') return key;
    }
    return null;
};

const DEFAULT_EXPORT_NAME = 'deck';

// The download name for an exported deck: the deck name as a slug plus .json.
export const exportFileName = (name) =>
    `${name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || DEFAULT_EXPORT_NAME}.json`;
