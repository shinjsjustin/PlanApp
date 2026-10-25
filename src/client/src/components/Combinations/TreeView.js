import React, { useState } from 'react';

import { buildRecipeTree } from '../../lib/recipeTree';

const MAX_INDENT_DEPTH = 6; // deeper levels stop indenting so phones never scroll sideways

const BADGES = { base: 'base', 'no-recipe': 'no recipe', cycle: 'cycle' };

const TreeNode = ({ node, depth, onOpen }) => {
    const [isOpen, setIsOpen] = useState(true);
    const isCrafted = node.status === 'crafted' && node.recipes.length > 0;
    const hasAlternatives = node.recipes.length > 1;

    return (
        <li className={depth > MAX_INDENT_DEPTH ? 'tree-node flat' : 'tree-node'}>
            <div className="tree-label">
                {isCrafted && (
                    <button
                        type="button"
                        className="tree-toggle"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? '-' : '+'}
                    </button>
                )}
                <span className="tree-name">{node.name}</span>
                {BADGES[node.status] && <span className={`kind-badge ${node.status}`}>{BADGES[node.status]}</span>}
                {node.truncated && <span className="hint">Tree stopped here (too large to show in full).</span>}
            </div>
            {isCrafted && isOpen && (
                <ul className="tree-list">
                    {node.recipes.map((recipe, i) => (
                        <li className="tree-recipe" key={recipe.key}>
                            <button type="button" className="tree-recipe-row" onClick={() => onOpen(recipe.key)}>
                                {hasAlternatives && <strong>{`Recipe ${i + 1}`}</strong>}
                                <span>{recipe.ingredients.map((n) => n.name).join(' + ')}</span>
                            </button>
                            <ul className="tree-list">
                                {recipe.ingredients.map((ingredient, j) => (
                                    <TreeNode key={j} node={ingredient} depth={depth + 1} onOpen={onOpen} />
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
};

const TreeView = ({ cards, pairs, itemId, onSelectItem, onOpen }) => {
    if (cards.length < 1) {
        return <p className="placeholder">Add at least one card below to see its recipe tree.</p>;
    }

    const tree = cards.some((c) => c.id === itemId) ? buildRecipeTree(cards, pairs, itemId) : null;

    return (
        <>
            <div className="walk-head">
                <label>
                    Item
                    <select value={itemId} onChange={(event) => onSelectItem(Number(event.target.value))}>
                        {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
            </div>
            {tree && (
                <ul className="tree tree-list">
                    <TreeNode node={tree} depth={0} onOpen={onOpen} />
                </ul>
            )}
        </>
    );
};

export default TreeView;
