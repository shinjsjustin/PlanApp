import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const D1 = { id: 1, name: 'Alpha', mode: 'permutations' };
const CARDS = [
    { id: 11, name: 'A', onX: true, onY: true },
    { id: 12, name: 'B', onX: true, onY: false },
    { id: 13, name: 'C', onX: false, onY: true },
];

const ALL_ON = CARDS.map((c) => ({ ...c, onX: true, onY: true }));

const mockHook = (overrides = {}) => {
    const hook = {
        status: 'ready', decks: [D1], deck: D1, cards: CARDS, pairs: {}, error: null,
        setMode: jest.fn().mockResolvedValue({}),
        setCardAxes: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
    useCombinations.mockReturnValue(hook);
    return hook;
};

const open = (view = 'grid') => render(
    <MemoryRouter initialEntries={[`/combinations?deck=1&view=${view}`]}>
        <CombinationsPage />
    </MemoryRouter>,
);

beforeEach(() => jest.resetAllMocks());

describe('CombinationsPage axes', () => {
    it('renders the tray with the deck mode and wires its actions to the hook', () => {
        const hook = mockHook();
        open();
        expect(screen.getByRole('button', { name: 'Permutations' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Combinations' }));
        expect(hook.setMode).toHaveBeenCalledWith('combinations');
        fireEvent.click(screen.getByRole('button', { name: 'Remove A from X' }));
        expect(hook.setCardAxes).toHaveBeenCalledWith(11, { onX: false, onY: true });
    });

    it('counts only the visible pairs for the deck mode', () => {
        mockHook({ cards: ALL_ON });
        open();
        expect(within(screen.getByLabelText('Counts')).getByText('Pairs').parentElement).toHaveTextContent('Pairs 6');
    });

    it('treats a missing mode as combinations', () => {
        mockHook({ deck: { id: 1, name: 'Alpha' }, cards: ALL_ON });
        open();
        expect(screen.getByRole('button', { name: 'Combinations' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(screen.getByLabelText('Counts')).getByText('Pairs').parentElement).toHaveTextContent('Pairs 3');
    });

    it('walks the visible keys of the deck mode', () => {
        // Permutations: A has 4 visible keys (A|B, B|A, A|C, C|A) over all-on cards.
        mockHook({ cards: ALL_ON });
        open('walk');
        expect(screen.getByText(/A: – of 4/)).toBeInTheDocument();
    });

    it('shows the server message when a flip is refused', () => {
        mockHook({ error: 'Remove the pairs first' });
        open();
        expect(screen.getByRole('alert')).toHaveTextContent('Remove the pairs first');
    });
});
