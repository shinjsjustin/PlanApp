import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const CARDS = [
    { id: 1, name: 'Stone', onX: true, onY: true },
    { id: 2, name: 'Stick', onX: true, onY: true },
    { id: 3, name: 'Axe', crafted: true, onX: true, onY: true },
];
const PAIRS = { '1|2': { cardAId: 1, cardBId: 2, state: 'filled', resultCardId: 3 } };
const RECIPE = { id: 1, name: 'Craft', mode: 'combinations', recipe: true };
const PLAIN = { ...RECIPE, recipe: false };

const mockHook = (deck, cards = CARDS) => {
    const hook = {
        status: 'ready', decks: [deck], deck, cards, pairs: PAIRS, error: null,
        savePair: jest.fn(), setMode: jest.fn(), setCardAxes: jest.fn(),
    };
    useCombinations.mockReturnValue(hook);
};

const page = () => (
    <MemoryRouter initialEntries={['/combinations?deck=1&view=tree']}>
        <CombinationsPage />
    </MemoryRouter>
);
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent);

beforeEach(() => jest.resetAllMocks());

describe('CombinationsPage tree tab', () => {
    it('adds a Tree tab on a recipe deck only', () => {
        mockHook(RECIPE);
        const { unmount } = render(page());
        expect(tabNames()).toEqual(['Ring', 'Grid', 'Walkthrough', 'Tree']);
        unmount();
        mockHook(PLAIN);
        render(page());
        expect(tabNames()).toEqual(['Ring', 'Grid', 'Walkthrough']);
    });

    it('selects Tree and renders the tree on a recipe deck', () => {
        mockHook(RECIPE);
        render(page());
        expect(screen.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('combobox', { name: 'Item' })).toBeInTheDocument();
    });

    it('falls back to Ring for ?view=tree on another deck', () => {
        mockHook(PLAIN);
        render(page());
        expect(screen.getByRole('tab', { name: 'Ring' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('combobox', { name: 'Item' })).toBeNull();
    });

    it('defaults to the first card, keeps Tree after picking, and resets when the item leaves', () => {
        mockHook(RECIPE);
        const { rerender } = render(page());
        const picker = () => screen.getByRole('combobox', { name: 'Item' });
        expect(picker()).toHaveValue('1');
        fireEvent.change(picker(), { target: { value: '3' } });
        expect(picker()).toHaveValue('3');
        expect(screen.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true');
        mockHook(RECIPE, CARDS.slice(0, 2));
        rerender(page());
        expect(picker()).toHaveValue('1');
    });

    it('opens the pair of a clicked recipe row in the pair panel', () => {
        mockHook(RECIPE);
        render(page());
        fireEvent.change(screen.getByRole('combobox', { name: 'Item' }), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: 'Stone + Stick' }));
        expect(screen.getByRole('heading', { name: 'Stone + Stick' })).toBeInTheDocument();
    });
});
