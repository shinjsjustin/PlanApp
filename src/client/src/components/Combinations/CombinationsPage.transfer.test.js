import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CombinationsPage from './CombinationsPage';
import useCombinations from '../../hooks/useCombinations';

jest.mock('../../hooks/useCombinations');

const CARDS = [
    { id: 11, name: 'Fire', detail: '' },
    { id: 12, name: 'Ice', detail: '' },
    { id: 13, name: 'Wind', detail: '' },
];
const DONE = { '11|12': { cardAId: 11, cardBId: 12, state: 'done', name: '', effect: '', notes: '' } };
const DECKS = [{ id: 1, name: 'Alpha / Beta' }, { id: 2, name: 'Other' }];

const hook = {};
const setHook = (overrides = {}) => {
    Object.assign(hook, {
        status: 'ready', decks: DECKS, deck: DECKS[0], cards: CARDS, pairs: DONE, error: null,
        createDeck: jest.fn(), renameDeck: jest.fn(), deleteDeck: jest.fn(),
        addCard: jest.fn(), updateCard: jest.fn(), moveCard: jest.fn(), deleteCard: jest.fn(),
        savePair: jest.fn(),
        importDecks: jest.fn(), exportDeck: jest.fn(), promoteDeck: jest.fn(),
        ...overrides,
    });
};

const open = () => render(
    <MemoryRouter initialEntries={['/combinations?deck=1']}>
        <CombinationsPage />
    </MemoryRouter>,
);
const fileInput = () => document.querySelector('input[type="file"]');
const chooseFile = async (text, name = 'decks.json') => {
    const file = new File([text], name, { type: 'application/json' });
    file.text = () => Promise.resolve(text);
    await act(async () => { fireEvent.change(fileInput(), { target: { files: [file] } }); });
};

beforeEach(() => {
    setHook();
    useCombinations.mockImplementation(() => hook);
});

describe('CombinationsPage import', () => {
    it('sends the parsed JSON and toasts the single deck name', async () => {
        hook.importDecks.mockResolvedValue({ decks: [{ id: 7, name: 'Mine' }] });
        open();
        await chooseFile('{"name":"Mine"}');
        expect(hook.importDecks).toHaveBeenCalledWith({ name: 'Mine' });
        expect(await screen.findByText('Imported "Mine".')).toBeInTheDocument();
    });

    it('toasts the count when several decks come in', async () => {
        hook.importDecks.mockResolvedValue({ decks: [{ id: 7, name: 'A' }, { id: 8, name: 'B' }] });
        open();
        await chooseFile('[{},{}]');
        expect(await screen.findByText('Imported 2 decks.')).toBeInTheDocument();
    });

    it('opens the first new deck', async () => {
        hook.importDecks.mockResolvedValue({ decks: [{ id: 7, name: 'A' }, { id: 8, name: 'B' }] });
        open();
        await chooseFile('[{},{}]');
        await screen.findByText('Imported 2 decks.');
        expect(useCombinations).toHaveBeenCalledWith(expect.objectContaining({ deckId: 7 }));
    });

    it('toasts bad JSON with the file name and does not call the API', async () => {
        open();
        await chooseFile('{nope', 'broken.json');
        expect(hook.importDecks).not.toHaveBeenCalled();
        expect(await screen.findByText(/^Could not import broken\.json: /)).toBeInTheDocument();
    });

    it('toasts a rejected import with its message', async () => {
        hook.importDecks.mockRejectedValue(new Error('Deck name is blank'));
        open();
        await chooseFile('{}', 'x.json');
        expect(await screen.findByText('Could not import x.json: Deck name is blank')).toBeInTheDocument();
    });
});

describe('CombinationsPage export', () => {
    it('downloads the exported deck pretty-printed under its slug name', async () => {
        const exported = { id: 'd_1', name: 'Alpha / Beta', cards: [] };
        hook.exportDeck.mockResolvedValue(exported);
        const blobs = [];
        global.URL.createObjectURL = jest.fn((blob) => { blobs.push(blob); return 'blob:x'; });
        global.URL.revokeObjectURL = jest.fn();
        let download;
        const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { download = this.download; });
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
        await waitFor(() => expect(click).toHaveBeenCalled());
        expect(hook.exportDeck).toHaveBeenCalledWith(1);
        expect(download).toBe('Alpha-Beta.json');
        expect(blobs[0].type).toBe('application/json');
        const reader = new FileReader();
        const text = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); reader.readAsText(blobs[0]); });
        expect(text).toBe(JSON.stringify(exported, null, 2));
        click.mockRestore();
    });
});

describe('CombinationsPage promote', () => {
    it('toasts and skips the API when no pair is done', () => {
        setHook({ pairs: {} });
        open();
        fireEvent.click(screen.getByRole('button', { name: 'New deck from done pairs' }));
        expect(hook.promoteDeck).not.toHaveBeenCalled();
        expect(screen.getByText('No done pairs in this deck yet.')).toBeInTheDocument();
    });

    it('opens the new deck and toasts its card count', async () => {
        hook.promoteDeck.mockResolvedValue({ id: 9, name: 'Alpha / Beta · done pairs', cardCount: 1 });
        open();
        fireEvent.click(screen.getByRole('button', { name: 'New deck from done pairs' }));
        expect(await screen.findByText('New deck with 1 cards from done pairs.')).toBeInTheDocument();
        expect(hook.promoteDeck).toHaveBeenCalledWith(1);
        expect(useCombinations).toHaveBeenCalledWith(expect.objectContaining({ deckId: 9 }));
    });

    it('shows a failed promote in an alert', async () => {
        hook.promoteDeck.mockRejectedValue(new Error('Promote broke'));
        open();
        fireEvent.click(screen.getByRole('button', { name: 'New deck from done pairs' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Promote broke');
    });
});
