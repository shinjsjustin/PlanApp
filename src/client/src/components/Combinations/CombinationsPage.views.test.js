import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const DECK = { id: 1, name: 'Alpha' };
const CARDS = [{ id: 11, name: 'Fire', detail: '' }, { id: 12, name: 'Water', detail: '' }];

const Where = () => <p data-testid="where">{useLocation().search}</p>;

const open = (url) => {
    useCombinations.mockReturnValue({
        status: 'ready', decks: [DECK], deck: DECK, cards: CARDS, pairs: {}, error: null,
    });
    return render(
        <MemoryRouter initialEntries={[url]}>
            <CombinationsPage />
            <Where />
        </MemoryRouter>,
    );
};

const tab = (name) => screen.getByRole('tab', { name });

beforeEach(() => jest.resetAllMocks());

describe('CombinationsPage view tabs', () => {
    it('has Ring, Grid and Walkthrough tabs', () => {
        open('/combinations?deck=1');
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Ring', 'Grid', 'Walkthrough']);
    });

    it('shows the ring by default', () => {
        const { container } = open('/combinations?deck=1');
        expect(tab('Ring')).toHaveAttribute('aria-selected', 'true');
        expect(container.querySelector('svg.ring')).not.toBeNull();
        expect(container.querySelector('table.grid')).toBeNull();
    });

    it.each([
        ['ring', 'Ring'], ['grid', 'Grid'], ['walk', 'Walkthrough'], ['bogus', 'Ring'],
    ])('?view=%s selects the %s tab', (view, name) => {
        open(`/combinations?deck=1&view=${view}`);
        expect(tab(name)).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    });

    it('shows the grid for ?view=grid and neither view for walk', () => {
        const { container, unmount } = open('/combinations?deck=1&view=grid');
        expect(container.querySelector('table.grid')).not.toBeNull();
        expect(container.querySelector('svg.ring')).toBeNull();
        unmount();
        const walk = open('/combinations?deck=1&view=walk');
        expect(walk.container.querySelector('table.grid')).toBeNull();
        expect(walk.container.querySelector('svg.ring')).toBeNull();
    });

    it('writes ?view when a tab is clicked, keeping the deck', () => {
        open('/combinations?deck=1');
        fireEvent.click(tab('Grid'));
        expect(screen.getByTestId('where')).toHaveTextContent('deck=1');
        expect(screen.getByTestId('where')).toHaveTextContent('view=grid');
        expect(tab('Grid')).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(tab('Walkthrough'));
        expect(screen.getByTestId('where')).toHaveTextContent('view=walk');
    });
});
