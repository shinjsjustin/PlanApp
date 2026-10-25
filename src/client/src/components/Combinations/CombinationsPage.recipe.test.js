import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const CARDS = [
    { id: 1, name: 'Stone', onX: true, onY: true },
    { id: 2, name: 'Stick', onX: true, onY: true },
];

const mockHook = (deck) => {
    const hook = {
        status: 'ready', decks: [deck], deck, cards: CARDS, pairs: {}, error: null,
        savePair: jest.fn().mockResolvedValue({}),
        setMode: jest.fn(),
        setCardAxes: jest.fn(),
    };
    useCombinations.mockReturnValue(hook);
    return hook;
};

const open = (view = 'grid') => render(
    <MemoryRouter initialEntries={[`/combinations?deck=1&view=${view}`]}>
        <CombinationsPage />
    </MemoryRouter>,
);

const pairsCount = () => within(screen.getByLabelText('Counts')).getByText('Pairs').parentElement;

const RECIPE = { id: 1, name: 'Craft', mode: 'combinations', recipe: true };
const PLAIN = { id: 1, name: 'Craft', mode: 'combinations', recipe: false };

beforeEach(() => jest.resetAllMocks());

describe('CombinationsPage recipe', () => {
    it('counts same-item cells in a recipe deck', () => {
        mockHook(RECIPE);
        open();
        expect(pairsCount()).toHaveTextContent('Pairs 3');
    });

    it('does not count same-item cells in other decks', () => {
        mockHook(PLAIN);
        open();
        expect(pairsCount()).toHaveTextContent('Pairs 1');
    });

    it('walks the same-item step in a recipe deck', () => {
        mockHook(RECIPE);
        open('walk');
        expect(screen.getByText(/Stone: – of 2/)).toBeInTheDocument();
    });

    it('opens Stone + Stone and saves with equal card ids', () => {
        const hook = mockHook(RECIPE);
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Stone + Stone: empty' }));
        expect(screen.getByRole('heading', { name: 'Stone + Stone' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'done' }));
        expect(hook.savePair).toHaveBeenCalledWith(expect.objectContaining({ cardAId: 1, cardBId: 1 }));
    });

    it('next unfilled steps onto the same-item cell', () => {
        mockHook(RECIPE);
        open('walk');
        fireEvent.click(screen.getByRole('button', { name: /Next unfilled/i }));
        expect(screen.getByRole('heading', { name: 'Stone + Stone' })).toBeInTheDocument();
    });
});
