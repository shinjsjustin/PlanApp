import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const D1 = { id: 1, name: 'Alpha', mode: 'combinations' };
const tray = { onX: false, onY: false };
const on = { onX: true, onY: true };

const mockHook = (cards) => useCombinations.mockReturnValue({
    status: 'ready', decks: [D1], deck: D1, cards, pairs: {}, error: null,
    setMode: jest.fn(), setCardAxes: jest.fn(),
});

const ui = () => (
    <MemoryRouter initialEntries={['/combinations?deck=1&view=walk']}>
        <CombinationsPage />
    </MemoryRouter>
);

const walkList = () => document.querySelector('.walk-list');

beforeEach(() => jest.resetAllMocks());

describe('CombinationsPage walkthrough with cards in the tray', () => {
    it('opens on the first card that is on an axis and lists its pairs', () => {
        mockHook([
            { id: 11, name: 'A', ...tray },
            { id: 12, name: 'B', ...on },
            { id: 13, name: 'C', ...on },
        ]);
        render(ui());
        expect(screen.getByLabelText('Card')).toHaveValue('12');
        expect(within(walkList()).getAllByRole('listitem')).toHaveLength(1);
        expect(screen.getByText('+ C')).toBeInTheDocument();
    });

    it('falls back to the first axis card when the chosen card moves to the tray', () => {
        const cards = [
            { id: 11, name: 'A', ...on },
            { id: 12, name: 'B', ...on },
            { id: 13, name: 'C', ...on },
        ];
        mockHook(cards);
        const { rerender } = render(ui());
        fireEvent.change(screen.getByLabelText('Card'), { target: { value: '13' } });
        expect(screen.getByLabelText('Card')).toHaveValue('13');

        mockHook(cards.map((c) => (c.id === 13 ? { ...c, ...tray } : c)));
        rerender(ui());
        expect(screen.getByLabelText('Card')).toHaveValue('11');
        expect(within(walkList()).getAllByRole('listitem')).toHaveLength(1);
    });

    it('shows no pair list and Next unfilled does not throw when no card is on an axis', () => {
        mockHook([
            { id: 11, name: 'A', ...tray },
            { id: 12, name: 'B', ...tray },
        ]);
        render(ui());
        expect(document.querySelector('.walk-list')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Next unfilled' }));
        expect(document.querySelector('.walk-list')).toBeNull();
    });
});
