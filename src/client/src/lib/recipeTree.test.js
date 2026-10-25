import { buildRecipeTree } from './recipeTree';

const card = (id, name, crafted = false) => ({ id, name, crafted });
const pair = (a, b, resultCardId, state = 'filled') => ({ cardAId: a, cardBId: b, state, resultCardId });

const names = (ings) => ings.map((n) => n.name);

describe('buildRecipeTree', () => {
    const cards = [card(1, 'Wood'), card(2, 'Stone'), card(3, 'Axe', true), card(4, 'Hut', true), card(5, 'Ghost', true)];

    it('marks an item no pair makes as base when not crafted', () => {
        const tree = buildRecipeTree(cards, [], 1);
        expect(tree).toEqual({ id: 1, name: 'Wood', status: 'base', recipes: [], truncated: false });
    });

    it('marks an item no pair makes as no-recipe when crafted', () => {
        const tree = buildRecipeTree(cards, [], 5);
        expect(tree.status).toBe('no-recipe');
        expect(tree.recipes).toEqual([]);
    });

    it('lists the making pair with its two ingredient nodes', () => {
        const tree = buildRecipeTree(cards, [pair(1, 2, 3)], 3);
        expect(tree.status).toBe('crafted');
        expect(tree.recipes).toHaveLength(1);
        expect(tree.recipes[0].key).toBe('1|2');
        expect(names(tree.recipes[0].ingredients)).toEqual(['Wood', 'Stone']);
        expect(tree.recipes[0].ingredients[0].status).toBe('base');
    });

    it('accepts a key-to-pair map and uses its keys', () => {
        const tree = buildRecipeTree(cards, { 'x|y': pair(1, 2, 3) }, 3);
        expect(tree.recipes[0].key).toBe('x|y');
    });

    it('lists every making pair in deck card order', () => {
        const pairs = [pair(2, 4, 3), pair(1, 2, 3)];
        const tree = buildRecipeTree(cards, pairs, 3);
        expect(tree.recipes.map((r) => r.key)).toEqual(['1|2', '2|4']);
    });

    it('ignores struck pairs and pairs without a result', () => {
        const pairs = [pair(1, 2, 3, 'struck'), pair(1, 2, null), pair(1, 2, undefined)];
        expect(buildRecipeTree(cards, pairs, 3).status).toBe('no-recipe');
    });

    it('expands ingredients recursively down to base items', () => {
        const pairs = [pair(1, 2, 3), pair(3, 1, 4)];
        const tree = buildRecipeTree(cards, pairs, 4);
        const axe = tree.recipes[0].ingredients[0];
        expect(axe.name).toBe('Axe');
        expect(names(axe.recipes[0].ingredients)).toEqual(['Wood', 'Stone']);
    });

    it('turns Stone + Stone = Stone into cycle ingredients', () => {
        const deck = [card(2, 'Stone', true)];
        const tree = buildRecipeTree(deck, [pair(2, 2, 2)], 2);
        expect(tree.status).toBe('crafted');
        expect(tree.recipes).toHaveLength(1);
        tree.recipes[0].ingredients.forEach((n) => {
            expect(n.status).toBe('cycle');
            expect(n.recipes).toEqual([]);
        });
    });

    it('detects cycles only along the current path', () => {
        // Axe = Wood + Wood, Hut = Axe + Axe: Axe appears twice, neither is a cycle.
        const tree = buildRecipeTree(cards, [pair(1, 1, 3), pair(3, 3, 4)], 4);
        const [left, right] = tree.recipes[0].ingredients;
        expect(left.status).toBe('crafted');
        expect(right.status).toBe('crafted');
    });

    it('stops expanding past maxNodes and flags the stopping node', () => {
        const pairs = [pair(1, 2, 3), pair(3, 1, 4)];
        const tree = buildRecipeTree(cards, pairs, 4, { maxNodes: 3 });
        const axe = tree.recipes[0].ingredients[0];
        expect(axe.truncated).toBe(true);
        expect(axe.recipes).toEqual([]);
        expect(tree.truncated).toBe(false);
    });

    it('defaults maxNodes to 500', () => {
        // Chain of 600 crafted items, each made from the previous one and base item 0.
        const chain = [card(0, 'B')];
        const pairs = [];
        for (let i = 1; i <= 600; i += 1) {
            chain.push(card(i, `C${i}`, true));
            pairs.push(pair(i - 1, 0, i));
        }
        let count = 0;
        const walk = (n) => {
            count += 1;
            (n.recipes || []).forEach((r) => r.ingredients.forEach(walk));
        };
        const tree = buildRecipeTree(chain, pairs, 600);
        walk(tree);
        expect(count).toBeLessThanOrEqual(500);
        expect(count).toBeGreaterThan(400);
    });
});
