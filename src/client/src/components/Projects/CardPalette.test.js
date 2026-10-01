import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import CardPalette from './CardPalette';

const renderPalette = () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(
        <div>
            <button type="button">outside</button>
            <CardPalette onPick={onPick} onClose={onClose} />
        </div>
    );
    return { onPick, onClose };
};

describe('CardPalette', () => {
    test('is a dialog labelled Card color with 80 swatches plus Default', () => {
        renderPalette();

        const dialog = screen.getByRole('dialog', { name: 'Card color' });
        expect(within(dialog).getAllByRole('button')).toHaveLength(81);
        expect(within(dialog).getByRole('button', { name: 'Default' })).toBeInTheDocument();
    });

    test('names swatches by color', () => {
        renderPalette();

        expect(screen.getByRole('button', { name: 'red berry' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'dark gray 4' })).toBeInTheDocument();
    });

    test('picking a swatch calls onPick with its hex', () => {
        const { onPick } = renderPalette();

        fireEvent.click(screen.getByRole('button', { name: 'red berry' }));

        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith('#980000');
    });

    test('picking Default calls onPick with null', () => {
        const { onPick } = renderPalette();

        fireEvent.click(screen.getByRole('button', { name: 'Default' }));

        expect(onPick).toHaveBeenCalledWith(null);
    });

    test('Escape closes without picking', () => {
        const { onPick, onClose } = renderPalette();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onPick).not.toHaveBeenCalled();
    });

    test('a mousedown outside closes without picking', () => {
        const { onPick, onClose } = renderPalette();

        fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onPick).not.toHaveBeenCalled();
    });

    test('a mousedown inside does not close', () => {
        const { onClose } = renderPalette();

        fireEvent.mouseDown(screen.getByRole('button', { name: 'red berry' }));

        expect(onClose).not.toHaveBeenCalled();
    });
});
