import { render, screen, fireEvent, act } from '@testing-library/react';
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

describe('CombinationsPage walkthrough', () => {
    const THREE = [...CARDS, { id: 13, name: 'Earth', detail: 'Solid' }];
    const openWalk = (pairs = {}, cards = THREE) => {
        useCombinations.mockReturnValue({
            status: 'ready', decks: [DECK], deck: DECK, cards, pairs, error: null,
        });
        return render(
            <MemoryRouter initialEntries={['/combinations?deck=1&view=walk']}>
                <CombinationsPage />
            </MemoryRouter>,
        );
    };
    const side = (container) => container.querySelector('aside.side');
    const pos = (container) => side(container).querySelector('.walk-nav .pos').textContent;

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('defaults the walk card to the first card and lists its pairs', () => {
        const { container } = openWalk();
        expect(screen.getByRole('combobox', { name: 'Card' }).value).toBe('11');
        expect(container.querySelectorAll('.walk-list li')).toHaveLength(2);
        expect(pos(container)).toBe('Fire: – of 2');
    });

    it('has no walk nav on other tabs or with fewer than two cards', () => {
        const { container, unmount } = open('/combinations?deck=1');
        expect(container.querySelector('.walk-nav')).toBeNull();
        unmount();
        const walk = openWalk({}, [CARDS[0]]);
        expect(walk.container.querySelector('.walk-nav')).toBeNull();
    });

    it('Next and Previous open the matching pair and wrap', () => {
        const { container } = openWalk();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(pos(container)).toBe('Fire: 1 of 2');
        expect(container.querySelector('.walk-list button.sel')).toHaveTextContent('+ Water');
        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        expect(pos(container)).toBe('Fire: 2 of 2');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(pos(container)).toBe('Fire: 1 of 2');
    });

    it('Next unfilled opens the next empty pair', () => {
        const { container } = openWalk({ '11|12': { cardAId: 11, cardBId: 12, state: 'done', name: 'x' } });
        fireEvent.click(screen.getByRole('button', { name: 'Next unfilled' }));
        expect(pos(container)).toBe('Fire: 2 of 2');
    });

    it('toasts when every pair is filled, then hides it after a few seconds', () => {
        const filled = (a, b) => ({ cardAId: a, cardBId: b, state: 'done', name: 'x' });
        openWalk({ '11|12': filled(11, 12), '11|13': filled(11, 13) });
        fireEvent.click(screen.getByRole('button', { name: 'Next unfilled' }));
        expect(screen.getByRole('status')).toHaveTextContent('Every pair of Fire is filled.');
        act(() => jest.advanceTimersByTime(5000));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('closes an open pair that does not involve the new walk card', () => {
        const { container } = openWalk();
        fireEvent.click(screen.getByRole('button', { name: /\+ Water/ }));
        expect(side(container).querySelector('.editor, input')).not.toBeNull();
        fireEvent.change(screen.getByRole('combobox', { name: 'Card' }), { target: { value: '13' } });
        expect(pos(container)).toBe('Earth: – of 2');
        expect(side(container)).toHaveTextContent('Click a line in the ring');
    });

    it('keeps an open pair that belongs to the new walk card', () => {
        const { container } = openWalk();
        fireEvent.click(screen.getByRole('button', { name: /\+ Water/ }));
        fireEvent.change(screen.getByRole('combobox', { name: 'Card' }), { target: { value: '12' } });
        expect(pos(container)).toBe('Water: 1 of 2');
        expect(side(container)).not.toHaveTextContent('Click a line in the ring');
    });
});
