import { renderHook, act, waitFor } from '@testing-library/react';

import useCombinations from './useCombinations';
import { api } from '../lib/api';

jest.mock('../lib/api');

const { ApiError } = jest.requireActual('../lib/api');

const D1 = { id: 1, name: 'A deck', cardCount: 3, counts: { drafted: 0, done: 1, struck: 0 } };
const D2 = { id: 2, name: 'B deck', cardCount: 0, counts: { drafted: 0, done: 0, struck: 0 } };
const C1 = { id: 11, deckId: 1, name: 'Fire', detail: '', position: 0 };
const C2 = { id: 12, deckId: 1, name: 'Ice', detail: '', position: 1 };
const C3 = { id: 13, deckId: 1, name: 'Wind', detail: '', position: 2 };
const P12 = { id: 1, cardAId: 11, cardBId: 12, name: 'Steam', effect: '', notes: '', state: 'done' };
const P13 = { id: 2, cardAId: 11, cardBId: 13, name: '', effect: '', notes: '', state: 'drafted' };
const P23 = { id: 3, cardAId: 12, cardBId: 13, name: '', effect: '', notes: '', state: 'struck' };

const route = (overrides = {}) => {
    api.get.mockImplementation(async (path) => {
        if (overrides[path]) return overrides[path]();
        if (path.startsWith('/combinations/decks/1')) return { deck: D1, cards: [C1, C2, C3], pairs: [P12, P13, P23] };
        if (path.startsWith('/combinations/decks/2')) return { deck: D2, cards: [], pairs: [] };
        return { decks: [D1, D2] };
    });
};

const mountReady = async (props = { deckId: 1 }) => {
    route();
    const hook = renderHook((p) => useCombinations(p), { initialProps: props });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useCombinations load', () => {
    it('loads the deck list and the open deck', async () => {
        const { result } = await mountReady();
        expect(api.get).toHaveBeenCalledWith('/combinations/decks');
        expect(api.get).toHaveBeenCalledWith('/combinations/decks/1');
        expect(result.current.decks).toEqual([D1, D2]);
        expect(result.current.deck).toEqual(D1);
        expect(result.current.cards).toEqual([C1, C2, C3]);
        expect(result.current.pairs).toEqual({ '11|12': P12, '11|13': P13, '12|13': P23 });
        expect(result.current.error).toBeNull();
    });

    it('limits the list to the project', async () => {
        await mountReady({ projectId: 5, deckId: 1 });
        expect(api.get).toHaveBeenCalledWith('/combinations/decks?projectId=5');
    });

    it('loads only the list when no deck is open', async () => {
        route();
        const { result } = renderHook(() => useCombinations({}));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.deck).toBeNull();
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('sets status error and the message when the load fails', async () => {
        api.get.mockRejectedValue(new ApiError('down', 500));
        const { result } = renderHook(() => useCombinations({ deckId: 1 }));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
    });

    it('drops the answer for an older deckId', async () => {
        let releaseOld;
        route({
            '/combinations/decks/1': () => new Promise((resolve) => {
                releaseOld = () => resolve({ deck: D1, cards: [C1], pairs: [] });
            }),
        });
        const hook = renderHook((p) => useCombinations(p), { initialProps: { deckId: 1 } });
        hook.rerender({ deckId: 2 });
        await waitFor(() => expect(hook.result.current.deck).toEqual(D2));
        await act(async () => { releaseOld(); });
        expect(hook.result.current.deck).toEqual(D2);
        expect(hook.result.current.cards).toEqual([]);
    });
});

describe('useCombinations actions', () => {
    it('createDeck posts and adds the deck to the list', async () => {
        const { result } = await mountReady();
        const created = { id: 3, name: '0 deck', cardCount: 0, counts: {} };
        api.post.mockResolvedValue(created);
        let returned;
        await act(async () => { returned = await result.current.createDeck('0 deck', 5); });
        expect(api.post).toHaveBeenCalledWith('/combinations/decks', { name: '0 deck', projectId: 5 });
        expect(returned).toEqual(created);
        expect(result.current.decks.map((d) => d.id)).toEqual([3, 1, 2]);
    });

    it('renameDeck patches and updates the list and the open deck', async () => {
        const { result } = await mountReady();
        api.patch.mockResolvedValue({ ...D1, name: 'Z' });
        await act(async () => { await result.current.renameDeck(1, 'Z'); });
        expect(api.patch).toHaveBeenCalledWith('/combinations/decks/1', { name: 'Z' });
        expect(result.current.decks.map((d) => d.name)).toEqual(['B deck', 'Z']);
        expect(result.current.deck.name).toBe('Z');
    });

    it('deleteDeck removes it from the list and clears the open deck', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ id: 1 });
        await act(async () => { await result.current.deleteDeck(1); });
        expect(api.delete).toHaveBeenCalledWith('/combinations/decks/1');
        expect(result.current.decks).toEqual([D2]);
        expect(result.current.deck).toBeNull();
        expect(result.current.cards).toEqual([]);
        expect(result.current.pairs).toEqual({});
    });

    it('deleteDeck of another deck keeps the open deck', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ id: 2 });
        await act(async () => { await result.current.deleteDeck(2); });
        expect(result.current.decks).toEqual([D1]);
        expect(result.current.deck).toEqual(D1);
    });

    it('addCard posts, appends the card and refetches the list', async () => {
        const { result } = await mountReady();
        const card = { id: 14, deckId: 1, name: 'Rock', detail: 'hard', position: 3 };
        api.post.mockResolvedValue(card);
        api.get.mockClear();
        await act(async () => { await result.current.addCard('Rock', 'hard'); });
        expect(api.post).toHaveBeenCalledWith('/combinations/decks/1/cards', { name: 'Rock', detail: 'hard' });
        expect(result.current.cards).toEqual([C1, C2, C3, card]);
        expect(api.get).toHaveBeenCalledWith('/combinations/decks');
    });

    it('updateCard patches and replaces that card', async () => {
        const { result } = await mountReady();
        api.patch.mockResolvedValue({ ...C2, name: 'Frost' });
        await act(async () => { await result.current.updateCard(12, { name: 'Frost' }); });
        expect(api.patch).toHaveBeenCalledWith('/combinations/cards/12', { name: 'Frost' });
        expect(result.current.cards.map((c) => c.name)).toEqual(['Fire', 'Frost', 'Wind']);
    });

    it('moveCard replaces the cards with the returned order', async () => {
        const { result } = await mountReady();
        const moved = [{ ...C2, position: 0 }, { ...C1, position: 1 }, C3];
        api.put.mockResolvedValue({ cards: moved });
        await act(async () => { await result.current.moveCard(11, 'down'); });
        expect(api.put).toHaveBeenCalledWith('/combinations/cards/11/move', { direction: 'down' });
        expect(result.current.cards).toEqual(moved);
    });

    it('deleteCard drops the card and its pairs, then refetches the list', async () => {
        const { result } = await mountReady();
        api.delete.mockResolvedValue({ removedPairs: 2 });
        api.get.mockClear();
        await act(async () => { await result.current.deleteCard(11); });
        expect(api.delete).toHaveBeenCalledWith('/combinations/cards/11');
        expect(result.current.cards).toEqual([C2, C3]);
        expect(result.current.pairs).toEqual({ '12|13': P23 });
        expect(api.get).toHaveBeenCalledWith('/combinations/decks');
    });

    it('savePair puts the fields and merges the returned pair', async () => {
        const { result } = await mountReady();
        const saved = { ...P13, state: 'done', name: 'Dust' };
        api.put.mockResolvedValue(saved);
        api.get.mockClear();
        await act(async () => { await result.current.savePair({ cardAId: 13, cardBId: 11, state: 'done', name: 'Dust' }); });
        expect(api.put).toHaveBeenCalledWith('/combinations/decks/1/pairs', { cardAId: 13, cardBId: 11, state: 'done', name: 'Dust' });
        expect(result.current.pairs).toEqual({ '11|12': P12, '11|13': saved, '12|13': P23 });
        expect(api.get).toHaveBeenCalledWith('/combinations/decks');
    });

    it('a failed call rejects with the ApiError, sets error and keeps state', async () => {
        const { result } = await mountReady();
        const failure = new ApiError('That name is taken', 409);
        api.delete.mockRejectedValue(failure);
        let caught;
        await act(async () => { caught = await result.current.deleteCard(11).catch((e) => e); });
        expect(caught).toBe(failure);
        expect(result.current.error).toBe('That name is taken');
        expect(result.current.cards).toEqual([C1, C2, C3]);
        expect(result.current.pairs).toEqual({ '11|12': P12, '11|13': P13, '12|13': P23 });
    });

    it('a failed list refetch after a change sets error without rejecting', async () => {
        const { result } = await mountReady();
        api.put.mockResolvedValue(P12);
        api.get.mockRejectedValue(new ApiError('down', 500));
        await act(async () => { await result.current.savePair({ cardAId: 11, cardBId: 12 }); });
        expect(result.current.error).toBe('down');
    });

    it('ignores a result that lands after the deck changed', async () => {
        const { result, rerender } = await mountReady();
        let release;
        api.put.mockReturnValue(new Promise((resolve) => { release = () => resolve({ ...P13, name: 'Late' }); }));
        let pending;
        act(() => { pending = result.current.savePair({ cardAId: 11, cardBId: 13, name: 'Late' }); });
        rerender({ deckId: 2 });
        await waitFor(() => expect(result.current.deck).toEqual(D2));
        await act(async () => { release(); await pending; });
        expect(result.current.pairs).toEqual({});
    });
});

describe('useCombinations transfer', () => {
    const NEW1 = { id: 5, name: 'Zed', cardCount: 1, counts: { drafted: 0, done: 0, struck: 0 } };
    const NEW2 = { id: 6, name: 'Aaa', cardCount: 0, counts: { drafted: 0, done: 0, struck: 0 } };

    it('importDecks posts the data, adds the new decks sorted and returns them', async () => {
        const { result } = await mountReady();
        api.post.mockResolvedValue({ decks: [NEW1, NEW2] });
        let answer;
        await act(async () => { answer = await result.current.importDecks({ decks: [{ name: 'x' }] }); });
        expect(api.post).toHaveBeenCalledWith('/combinations/import', { decks: [{ name: 'x' }] });
        expect(answer).toEqual({ decks: [NEW1, NEW2] });
        expect(result.current.decks.map((d) => d.name)).toEqual(['A deck', 'Aaa', 'B deck', 'Zed']);
    });

    it('importDecks re-throws a failure and leaves the list alone', async () => {
        const { result } = await mountReady();
        const failure = new ApiError('Deck name is blank', 400);
        api.post.mockRejectedValue(failure);
        let caught;
        await act(async () => { caught = await result.current.importDecks([]).catch((e) => e); });
        expect(caught).toBe(failure);
        expect(result.current.error).toBeNull();
        expect(result.current.decks).toEqual([D1, D2]);
    });

    it('exportDeck gets the deck export and returns it without changing state', async () => {
        const { result } = await mountReady();
        const exported = { id: 'd_1', name: 'A deck', cards: [], pairs: {} };
        api.get.mockResolvedValue(exported);
        let answer;
        await act(async () => { answer = await result.current.exportDeck(1); });
        expect(api.get).toHaveBeenLastCalledWith('/combinations/decks/1/export');
        expect(answer).toEqual(exported);
        expect(result.current.decks).toEqual([D1, D2]);
    });

    it('exportDeck re-throws a failure', async () => {
        const { result } = await mountReady();
        api.get.mockRejectedValue(new ApiError('Not found', 404));
        let caught;
        await act(async () => { caught = await result.current.exportDeck(1).catch((e) => e); });
        expect(caught.status).toBe(404);
        expect(result.current.error).toBeNull();
    });

    it('promoteDeck posts to the promote route and adds the new deck sorted', async () => {
        const { result } = await mountReady();
        api.post.mockResolvedValue(NEW1);
        let answer;
        await act(async () => { answer = await result.current.promoteDeck(1); });
        expect(api.post).toHaveBeenCalledWith('/combinations/decks/1/promote');
        expect(answer).toEqual(NEW1);
        expect(result.current.decks.map((d) => d.id)).toEqual([1, 2, 5]);
    });

    it('promoteDeck re-throws a failure', async () => {
        const { result } = await mountReady();
        api.post.mockRejectedValue(new ApiError('Nope', 500));
        let caught;
        await act(async () => { caught = await result.current.promoteDeck(1).catch((e) => e); });
        expect(caught.message).toBe('Nope');
        expect(result.current.error).toBeNull();
        expect(result.current.decks).toEqual([D1, D2]);
    });

    it('a successful transfer call clears an earlier error', async () => {
        const { result } = await mountReady();
        api.delete.mockRejectedValue(new ApiError('Earlier', 500));
        await act(async () => { await result.current.deleteCard(11).catch(() => {}); });
        expect(result.current.error).toBe('Earlier');
        api.get.mockResolvedValue({ id: 'd_1' });
        await act(async () => { await result.current.exportDeck(1); });
        expect(result.current.error).toBeNull();
    });
});
