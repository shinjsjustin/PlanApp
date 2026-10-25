import { render, screen, fireEvent } from '@testing-library/react';

import AxisTray from './AxisTray';

const CARDS = [{ id: 1, name: 'Stone', onX: true, onY: true }];

const setup = (props = {}) => {
    const setRecipe = jest.fn().mockResolvedValue({});
    render(<AxisTray cards={CARDS} mode="combinations" recipe={false} setCardAxes={jest.fn()} setMode={jest.fn()} setRecipe={setRecipe} {...props} />);
    return { setRecipe };
};

const button = (name) => screen.getByRole('button', { name });

describe('AxisTray recipe toggle', () => {
    it('turns recipe on when pressed off', () => {
        const { setRecipe } = setup();
        expect(button('Recipe deck')).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(button('Recipe deck'));
        expect(setRecipe).toHaveBeenCalledWith(true);
    });

    it('turns recipe off when pressed on', () => {
        const { setRecipe } = setup({ recipe: true });
        expect(button('Recipe deck')).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(button('Recipe deck'));
        expect(setRecipe).toHaveBeenCalledWith(false);
    });

    it('disables Permutations in a recipe deck', () => {
        setup({ recipe: true });
        expect(button('Permutations')).toBeDisabled();
        expect(button('Combinations')).toBeEnabled();
    });

    it('disables Recipe deck in permutations', () => {
        setup({ mode: 'permutations' });
        expect(button('Recipe deck')).toBeDisabled();
        expect(button('Permutations')).toBeEnabled();
    });

    it('swallows a refused toggle', async () => {
        const setRecipe = jest.fn().mockRejectedValue(new Error('409'));
        setup({ setRecipe });
        fireEvent.click(button('Recipe deck'));
        await Promise.resolve();
        expect(setRecipe).toHaveBeenCalledTimes(1);
    });
});
