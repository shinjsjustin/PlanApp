// Turns a recipe deck into a tree tracing one item back to base resources.
// Node statuses:
//   crafted   - a non-struck pair makes it; `recipes` lists every such pair.
//   base      - nothing makes it and the card is not crafted (a raw resource).
//   no-recipe - nothing makes it but the card is crafted (its recipe was lost).
//   cycle     - already on the path from the root, so it is not expanded again.
// `truncated` marks the node where the maxNodes cap stopped expansion.

const DEFAULT_MAX_NODES = 500;

export const buildRecipeTree = (cards, pairs, itemId, { maxNodes = DEFAULT_MAX_NODES } = {}) => {
    const byId = new Map(cards.map((c, i) => [c.id, { card: c, index: i }]));
    const entries = Array.isArray(pairs)
        ? pairs.map((p) => [`${p.cardAId}|${p.cardBId}`, p])
        : Object.entries(pairs);
    const order = (id) => byId.get(id)?.index ?? Infinity;
    const makers = new Map();
    entries
        .filter(([, p]) => p.state !== 'struck' && p.resultCardId != null)
        .sort(([, a], [, b]) => order(a.cardAId) - order(b.cardAId) || order(a.cardBId) - order(b.cardBId))
        .forEach(([key, p]) => {
            makers.set(p.resultCardId, [...(makers.get(p.resultCardId) || []), [key, p]]);
        });

    let created = 1; // the root
    const node = (id, path) => {
        const { card } = byId.get(id);
        const base = { id, name: card.name, recipes: [], truncated: false };
        if (path.has(id)) return { ...base, status: 'cycle' };
        const making = makers.get(id);
        if (!making) return { ...base, status: card.crafted ? 'no-recipe' : 'base' };
        if (created + making.length * 2 > maxNodes) return { ...base, status: 'crafted', truncated: true };
        created += making.length * 2; // reserve both ingredients of every recipe before descending
        const nextPath = new Set(path).add(id);
        const recipes = making.map(([key, p]) => ({
            key,
            ingredients: [node(p.cardAId, nextPath), node(p.cardBId, nextPath)],
        }));
        return { ...base, status: 'crafted', recipes };
    };

    return node(itemId, new Set());
};
