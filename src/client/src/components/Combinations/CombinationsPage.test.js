import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const D1 = { id: 1, name: 'Alpha' };
const D2 = { id: 2, name: 'Beta' };
const CARDS = [{ id: 11 }, { id: 12 }, { id: 13 }];
const PAIRS = {
    '11|12': { state: 'done' },
    '11|13': { state: 'drafted' },
};

const Where = () => <p data-testid="where">{useLocation().search}</p>;

const mockHook = (overrides = {}) => {
    const hook = {
        status: 'ready', decks: [D1, D2], deck: D1, cards: CARDS, pairs: PAIRS, error: null,
        createDeck: jest.fn().mockResolvedValue({ id: 3, name: 'Gamma' }),
        renameDeck: jest.fn().mockResolvedValue({}),
        deleteDeck: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
    useCombinations.mockReturnValue(hook);
    return hook;
};

const open = (url) => render(
    <MemoryRouter initialEntries={[url]}>
        <CombinationsPage />
        <Where />
    </MemoryRouter>,
);

beforeEach(() => jest.resetAllMocks());

describe('CombinationsPage', () => {
    it('passes ?project and ?deck to the hook as numbers', () => {
        mockHook();
        open('/combinations?project=7&deck=2');
        expect(useCombinations).toHaveBeenCalledWith({ projectId: 7, deckId: 2 });
    });

    it('passes undefined for absent params', () => {
        mockHook({ decks: [] });
        open('/combinations');
        expect(useCombinations).toHaveBeenCalledWith({ projectId: undefined, deckId: undefined });
    });

    it('writes the first deck to ?deck when it is missing, keeping ?project', async () => {
        mockHook({ deck: null });
        open('/combinations?project=7');
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('deck=1'));
        expect(screen.getByTestId('where')).toHaveTextContent('project=7');
    });

    it('does not pick a deck while the list is still loading', () => {
        mockHook({ status: 'loading', decks: [] });
        open('/combinations');
        expect(screen.getByTestId('where')).toHaveTextContent('');
        expect(screen.getByTestId('where').textContent).toBe('');
    });

    it('writes the chosen deck to ?deck', () => {
        mockHook();
        open('/combinations?project=7&deck=1');
        fireEvent.change(screen.getByLabelText('Deck'), { target: { value: '2' } });
        expect(screen.getByTestId('where')).toHaveTextContent('deck=2');
        expect(screen.getByTestId('where')).toHaveTextContent('project=7');
    });

    it('files a new deck under ?project and opens it', async () => {
        const hook = mockHook({ decks: [D1, D2, { id: 3, name: 'Gamma' }] });
        open('/combinations?project=7&deck=1');
        fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
        const input = screen.getByLabelText('Deck name');
        fireEvent.change(input, { target: { value: 'Gamma' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(hook.createDeck).toHaveBeenCalledWith('Gamma', 7));
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('deck=3'));
    });

    it('files a new deck with no project when ?project is absent', async () => {
        const hook = mockHook();
        open('/combinations?deck=1');
        fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
        const input = screen.getByLabelText('Deck name');
        fireEvent.change(input, { target: { value: 'Gamma' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(hook.createDeck).toHaveBeenCalledWith('Gamma', null));
    });

    it('renames the open deck', async () => {
        const hook = mockHook();
        open('/combinations?deck=1');
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        const input = screen.getByLabelText('Deck name');
        fireEvent.change(input, { target: { value: 'Alpha 2' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(hook.renameDeck).toHaveBeenCalledWith(1, 'Alpha 2'));
    });

    it('deletes the open deck after confirming and moves to the next deck', async () => {
        const hook = mockHook();
        open('/combinations?deck=1');
        fireEvent.click(screen.getByRole('button', { name: 'Delete deck' }));
        expect(hook.deleteDeck).not.toHaveBeenCalled();
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete deck' })[1]);
        await waitFor(() => expect(hook.deleteDeck).toHaveBeenCalledWith(1));
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('deck=2'));
    });

    it('links back to the project when ?project is set', () => {
        mockHook();
        open('/combinations?project=7&deck=1');
        expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/projects/7');
    });

    it('links back to the projects list when ?project is absent', () => {
        mockHook();
        open('/combinations?deck=1');
        expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/projects');
    });

    it('shows the counts for the open deck', () => {
        mockHook();
        open('/combinations?deck=1');
        const counts = screen.getByLabelText('Counts');
        expect(counts).toHaveTextContent('Cards 3');
        expect(counts).toHaveTextContent('Pairs 3');
        expect(counts).toHaveTextContent('done 1');
        expect(counts).toHaveTextContent('drafted 1');
        expect(counts).toHaveTextContent('struck 0');
        expect(counts).toHaveTextContent('empty 1');
    });

    it('shows the load error message', () => {
        mockHook({ status: 'error', error: 'Could not load', decks: [], deck: null });
        open('/combinations');
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    });

    it('shows the hook error when status is ready', () => {
        mockHook({ error: 'Could not refresh decks' });
        const { container } = open('/combinations?deck=1');
        expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh decks');
        expect(container.querySelector('.deck-error')).toBe(screen.getByRole('alert'));
    });

    it('renders the empty slots with the prototype class names', () => {
        mockHook();
        const { container } = open('/combinations?deck=1');
        expect(container.querySelector('.layout .view-panel')).not.toBeNull();
        expect(container.querySelector('.layout .side')).not.toBeNull();
        expect(container.querySelector('.layout .cards')).not.toBeNull();
    });
});
