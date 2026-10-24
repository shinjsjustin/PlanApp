'use strict';

/**
 * Whether a pair shows in the grid. Combinations needs one card on X and the other
 * on Y; permutations needs card A on Y (row) and card B on X (column).
 * `cardsById` maps card id to a raw repo row.
 */
const isPairVisible = (pair, cardsById, mode) => {
    const a = cardsById.get(pair.card_a_id);
    const b = cardsById.get(pair.card_b_id);
    if (mode === 'permutations') return Boolean(a.on_y && b.on_x);
    return Boolean((a.on_x && b.on_y) || (b.on_x && a.on_y));
};

module.exports = { isPairVisible };
