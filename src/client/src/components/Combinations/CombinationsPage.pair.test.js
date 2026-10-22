import React, { useState } from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const CARDS = [
    { id: 11, name: 'Fire', detail: 'hot' },
    { id: 12, name: 'Ice', detail: 'cold' },
    { id: 13, name: 'Wind', detail: '' },
];
const AUTOSAVE_MS = 800;
const PLACEHOLDER = /Click a line in the ring, a cell in the grid/;
const saveSpy = jest.fn();

const useStatefulHook = () => {
    const [pairs, setPairs] = useState({ '11|12': { cardAId: 11, cardBId: 12, state: 'done', name: 'Steam', effect: '', notes: '' } });
    return {
        status: 'ready', decks: [{ id: 1, name: 'Alpha' }], deck: { id: 1, name: 'Alpha' },
        cards: CARDS, pairs, error: null,
        createDeck: jest.fn(), renameDeck: jest.fn(), deleteDeck: jest.fn(),
        addCard: jest.fn(), updateCard: jest.fn(), moveCard: jest.fn(), deleteCard: jest.fn(),
        savePair: async (fields) => {
            saveSpy(fields);
            const saved = { name: '', effect: '', notes: '', ...fields };
            setPairs((current) => ({ ...current, [`${fields.cardAId}|${fields.cardBId}`]: saved }));
            return saved;
        },
    };
};

const open = () => render(
    <MemoryRouter initialEntries={['/combinations?deck=1&view=grid']}>
        <CombinationsPage />
    </MemoryRouter>,
);
const cell = (name) => screen.getByRole('button', { name });

beforeEach(() => {
    jest.useFakeTimers();
    saveSpy.mockReset();
    useCombinations.mockImplementation(useStatefulHook);
});
afterEach(() => jest.useRealTimers());

describe('CombinationsPage pair panel', () => {
    it('shows a tabs bar with the Grid tab selected, and the legend', () => {
        const { container } = open();
        const tabs = within(container.querySelector('.tabs')).getAllByRole('tab');
        expect(tabs.map((t) => t.textContent)).toEqual(['Ring', 'Grid', 'Walkthrough']);
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        const legend = container.querySelector('.legend');
        ['empty', 'drafted', 'done', 'struck'].forEach((s) => expect(legend).toHaveTextContent(s));
    });

    it('starts with the side placeholder and the grid', () => {
        const { container } = open();
        expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
        expect(container.querySelectorAll('td.cell')).toHaveLength(3);
    });

    it('opens a pair in the side panel and marks its cell sel', () => {
        const { container } = open();
        fireEvent.click(cell('Fire + Ice: done · Steam'));
        const side = container.querySelector('.side');
        expect(within(side).getByRole('heading', { name: 'Fire + Ice' })).toBeInTheDocument();
        expect(within(side).getByLabelText('Name')).toHaveValue('Steam');
        expect(cell('Fire + Ice: done · Steam').closest('td')).toHaveClass('sel');
        expect(cell('Fire + Wind: empty').closest('td')).not.toHaveClass('sel');
    });

    it('updates the grid cell and counts bar after editing', async () => {
        const { container } = open();
        fireEvent.click(cell('Fire + Wind: empty'));
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'drafted' })); });
        expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ cardAId: 11, cardBId: 13, state: 'drafted' }));
        expect(cell('Fire + Wind: drafted').closest('td')).toHaveClass('st-drafted', 'sel');
        expect(container.querySelector('.counts')).toHaveTextContent(/drafted 1/);

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gust' } });
        await act(async () => { jest.advanceTimersByTime(AUTOSAVE_MS); });
        expect(cell('Fire + Wind: drafted · Gust')).toBeInTheDocument();
    });

    it('flushes the old draft when another pair opens', async () => {
        open();
        fireEvent.click(cell('Fire + Ice: done · Steam'));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mist' } });
        await act(async () => { fireEvent.click(cell('Ice + Wind: empty')); });
        expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ cardAId: 11, cardBId: 12, name: 'Mist' }));
        expect(screen.getByLabelText('Name')).toHaveValue('');
    });

    it('Close returns the side panel to its placeholder', () => {
        const { container } = open();
        fireEvent.click(cell('Fire + Ice: done · Steam'));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
        expect(container.querySelector('td.sel')).toBeNull();
    });

    it('scrolls the side panel into view on narrow screens only', () => {
        const scroll = jest.fn();
        window.HTMLElement.prototype.scrollIntoView = scroll;
        window.innerWidth = 1200;
        open();
        fireEvent.click(cell('Fire + Ice: done · Steam'));
        expect(scroll).not.toHaveBeenCalled();
        window.innerWidth = 600;
        fireEvent.click(cell('Fire + Wind: empty'));
        expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
        window.innerWidth = 1024;
        delete window.HTMLElement.prototype.scrollIntoView;
    });
});
