import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { click } from '../../testUtils/interact';

import ContextMenu from './ContextMenu';

const renderMenu = (props = {}) => {
    const onClose = jest.fn();
    const items = [
        { label: 'One', onSelect: jest.fn() },
        { label: 'Two', onSelect: jest.fn() },
        { label: 'Three', onSelect: jest.fn() },
    ];
    render(<ContextMenu x={10} y={20} label="Layer actions" items={items} onClose={onClose} {...props} />);
    return { items, onClose };
};

describe('ContextMenu', () => {
    test('renders a labelled menu of menuitems at the given position, first focused', () => {
        renderMenu();

        const menu = screen.getByRole('menu', { name: 'Layer actions' });
        expect(menu).toHaveStyle({ left: '10px', top: '20px' });
        expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['One', 'Two', 'Three']);
        expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    });

    test('ArrowDown and ArrowUp move focus and wrap', () => {
        renderMenu();
        const [one, two, three] = screen.getAllByRole('menuitem');

        fireEvent.keyDown(one, { key: 'ArrowDown' });
        expect(two).toHaveFocus();
        fireEvent.keyDown(two, { key: 'ArrowDown' });
        fireEvent.keyDown(three, { key: 'ArrowDown' });
        expect(one).toHaveFocus();
        fireEvent.keyDown(one, { key: 'ArrowUp' });
        expect(three).toHaveFocus();
    });

    test('Escape closes', () => {
        const { onClose } = renderMenu();

        fireEvent.keyDown(screen.getByRole('menuitem', { name: 'One' }), { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('an outside pointerdown closes, an inside one does not', () => {
        const { onClose } = renderMenu();

        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Two' }));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.pointerDown(document.body);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('choosing an item calls its onSelect then closes', async () => {
        const { items, onClose } = renderMenu();

        await click(screen.getByRole('menuitem', { name: 'Two' }));

        expect(items[1].onSelect).toHaveBeenCalledTimes(1);
        expect(items[0].onSelect).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
