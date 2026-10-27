import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';

import TreeView from './TreeView';

const card = (id, name, crafted = false) => ({ id, name, crafted });
const pair = (a, b, resultCardId) => ({ cardAId: a, cardBId: b, state: 'filled', resultCardId });

// 1 Wood, 2 Stone base; 3 Plank = Wood+Wood; 4 Table = Plank+Stone or Plank+Plank;
// 5 Ghost crafted without recipe; 6 Egg / 7 Hen cycle.
const cards = [
    card(1, 'Wood'), card(2, 'Stone'), card(3, 'Plank', true), card(4, 'Table', true),
    card(5, 'Ghost', true), card(6, 'Egg', true), card(7, 'Hen', true),
];
const pairs = {
    '1|1': pair(1, 1, 3),
    '2|3': pair(2, 3, 4),
    '3|3': pair(3, 3, 4),
    '6|7': pair(6, 7, 6),
    '1|6': pair(1, 6, 7),
};

const setup = (itemId, props = {}) => {
    const onSelectItem = jest.fn();
    const onOpen = jest.fn();
    render(<TreeView cards={cards} pairs={pairs} itemId={itemId} onSelectItem={onSelectItem} onOpen={onOpen} {...props} />);
    return { onSelectItem, onOpen };
};

describe('TreeView', () => {
    it('shows a placeholder when there are no cards', () => {
        render(<TreeView cards={[]} pairs={{}} itemId={null} onSelectItem={jest.fn()} onOpen={jest.fn()} />);
        expect(screen.getByText(/add at least one card/i)).toBeInTheDocument();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('calls onSelectItem with the numeric card id from the picker', () => {
        const { onSelectItem } = setup(4);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
        expect(onSelectItem).toHaveBeenCalledWith(2);
    });

    it('renders a nested outline of the item with labelled alternatives', () => {
        setup(4);
        expect(screen.getByRole('button', { name: /Recipe 1/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Recipe 2/ })).toBeInTheDocument();
        expect(screen.getAllByRole('list').length).toBeGreaterThan(1);
        expect(screen.getAllByText('Plank').length).toBeGreaterThanOrEqual(3);
    });

    it('does not label a single recipe', () => {
        setup(3);
        expect(screen.queryByText(/Recipe 1/)).toBeNull();
        expect(screen.getByRole('button', { name: /Wood \+ Wood/ })).toBeInTheDocument();
    });

    it('collapses and expands a crafted node with aria-expanded', () => {
        setup(3);
        const toggle = screen.getByRole('button', { expanded: true });
        expect(screen.getByRole('button', { name: /Wood \+ Wood/ })).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: /Wood \+ Wood/ })).toBeNull();
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: /Wood \+ Wood/ })).toBeInTheDocument();
    });

    it('badges the base ingredients as base', () => {
        setup(3);
        expect(screen.getAllByText('base').length).toBe(2);
    });

    it('badges a crafted item with no recipe', () => {
        setup(5);
        expect(screen.getByText('no recipe')).toBeInTheDocument();
        expect(screen.queryByRole('button', { expanded: true })).toBeNull();
    });

    it('badges a node already on its own path as cycle', () => {
        setup(6);
        const badges = screen.getAllByText('cycle');
        expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('says the tree stopped where it was truncated', () => {
        // Each level doubles its ingredients, so 12 levels exceed the node cap.
        const deep = Array.from({ length: 13 }, (_, i) => card(i + 1, `L${i}`, i > 0));
        const deepPairs = Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [`${i + 1}|${i + 1}`, pair(i + 1, i + 1, i + 2)]),
        );
        render(<TreeView cards={deep} pairs={deepPairs} itemId={13} onSelectItem={jest.fn()} onOpen={jest.fn()} />);
        expect(screen.getAllByText(/tree stopped here/i).length).toBeGreaterThan(0);
    });

    it('opens the pair when a recipe row is clicked', () => {
        const { onOpen } = setup(4);
        fireEvent.click(screen.getByRole('button', { name: /Recipe 2/ }));
        expect(onOpen).toHaveBeenCalledWith('3|3');
    });

    it('nests a recipe\'s ingredients under its row', () => {
        setup(3);
        const row = screen.getByRole('button', { name: /Wood \+ Wood/ });
        expect(within(row.closest('li')).getAllByText('Wood')).toHaveLength(2);
    });
});
