import { renderHook, act, waitFor } from '@testing-library/react';

import useCombinations from './useCombinations';
import { api } from '../lib/api';

jest.mock('../lib/api');

const { ApiError } = jest.requireActual('../lib/api');

const DECK = { id: 1, name: 'A deck', mode: 'combinations', recipe: false, cardCount: 2 };
const RDECK = { ...DECK, recipe: true };
const WOOD = { id: 11, deckId: 1, name: 'Wood', detail: '', position: 0, crafted: false };
const STONE = { id: 12, deckId: 1, name: 'Stone', detail: '', position: 1, crafted: false };
const PLANK = { id: 13, deckId: 1, name: 'Plank', detail: '', position: 2, crafted: true };
const WS = { id: 1, cardAId: 11, cardBId: 12, resultCardId: 13, name: 'Plank', effect: '', notes: '', state: 'done' };
const WP = { id: 2, cardAId: 11, cardBId: 13, resultCardId: null, name: '', effect: '', notes: '', state: 'drafted' };

const mount = async (deck, cards, pairs) => {
    api.get.mockImplementation(async (path) => (path.startsWith('/combinations/decks/1')
        ? { deck, cards, pairs }
        : { decks: [deck] }));
    const hook = renderHook(() => useCombinations({ deckId: 1 }));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe('useCombinations recipe decks', () => {
    it('setRecipe patches then reloads the deck, cards and pairs', async () => {
        const { result } = await mount(DECK, [WOOD, STONE], [{ ...WS, resultCardId: null, name: 'Plank' }]);
        api.patch.mockResolvedValue(RDECK);
        api.get.mockImplementation(async () => ({ deck: RDECK, cards: [WOOD, STONE, PLANK], pairs: [WS] }));
        await act(async () => { await result.current.setRecipe(true); });
        expect(api.patch).toHaveBeenCalledWith('/combinations/decks/1', { recipe: true });
        expect(result.current.deck).toEqual(RDECK);
        expect(result.current.cards).toEqual([WOOD, STONE, PLANK]);
        expect(result.current.pairs).toEqual({ '11|12': WS });
    });

    it('a failed setRecipe sets error, re-throws and keeps state', async () => {
        const { result } = await mount(DECK, [WOOD, STONE], [WS]);
        const failure = new ApiError('A recipe deck cannot use permutations', 409);
        api.patch.mockRejectedValue(failure);
        let caught;
        await act(async () => { caught = await result.current.setRecipe(true).catch((e) => e); });
        expect(caught).toBe(failure);
        expect(result.current.error).toBe('A recipe deck cannot use permutations');
        expect(result.current.deck).toEqual(DECK);
        expect(result.current.cards).toEqual([WOOD, STONE]);
        expect(result.current.pairs).toEqual({ '11|12': WS });
    });

    it('savePair adds a crafted card from the answer and strips cards from the stored pair', async () => {
        const { result } = await mount(RDECK, [WOOD, STONE], [{ ...WS, resultCardId: null, name: '', state: 'drafted' }]);
        api.put.mockResolvedValue({ ...WS, cards: [WOOD, STONE, PLANK] });
        await act(async () => { await result.current.savePair({ cardAId: 11, cardBId: 12, name: 'Plank' }); });
        expect(result.current.cards).toEqual([WOOD, STONE, PLANK]);
        expect(result.current.pairs).toEqual({ '11|12': WS });
    });

    it('savePair drops pairs whose cards are gone', async () => {
        const { result } = await mount(RDECK, [WOOD, STONE, PLANK], [WS, WP]);
        const cleared = { ...WS, resultCardId: null, name: '' };
        api.put.mockResolvedValue({ ...cleared, cards: [WOOD, STONE] });
        await act(async () => { await result.current.savePair({ cardAId: 11, cardBId: 12, name: '' }); });
        expect(result.current.cards).toEqual([WOOD, STONE]);
        expect(result.current.pairs).toEqual({ '11|12': cleared });
    });

    it('updateCard with a name renames the pairs that make the card', async () => {
        const other = { ...WP, id: 3, cardAId: 12, cardBId: 13, resultCardId: 11, name: 'Wood' };
        const { result } = await mount(RDECK, [WOOD, STONE, PLANK], [WS, WP, other]);
        api.patch.mockResolvedValue({ ...PLANK, name: 'Board' });
        await act(async () => { await result.current.updateCard(13, { name: 'Board' }); });
        expect(result.current.pairs).toEqual({
            '11|12': { ...WS, name: 'Board' }, '11|13': WP, '12|13': other,
        });
    });

    it('updateCard without a name leaves pair names alone', async () => {
        const { result } = await mount(RDECK, [WOOD, STONE, PLANK], [WS]);
        api.patch.mockResolvedValue({ ...PLANK, onX: false });
        await act(async () => { await result.current.updateCard(13, { onX: false }); });
        expect(result.current.pairs).toEqual({ '11|12': WS });
    });

    it('deleteCard blanks the names and nulls resultCardId of the pairs that make it', async () => {
        const { result } = await mount(RDECK, [WOOD, STONE, PLANK], [WS, WP]);
        api.delete.mockResolvedValue({ removedPairs: 1 });
        await act(async () => { await result.current.deleteCard(13); });
        expect(result.current.cards).toEqual([WOOD, STONE]);
        expect(result.current.pairs).toEqual({ '11|12': { ...WS, name: '', resultCardId: null } });
    });

    it('deleteCard still removes pairs that use the card as an ingredient', async () => {
        const { result } = await mount(RDECK, [WOOD, STONE, PLANK], [WS, WP]);
        api.delete.mockResolvedValue({ removedPairs: 1 });
        await act(async () => { await result.current.deleteCard(11); });
        expect(result.current.pairs).toEqual({});
    });

    it('other decks keep pair names on rename and delete', async () => {
        const plain = { ...WS, name: 'Plank' };
        const { result } = await mount(DECK, [WOOD, STONE, PLANK], [plain]);
        api.patch.mockResolvedValue({ ...PLANK, name: 'Board' });
        await act(async () => { await result.current.updateCard(13, { name: 'Board' }); });
        expect(result.current.pairs).toEqual({ '11|12': plain });
        api.delete.mockResolvedValue({ removedPairs: 0 });
        await act(async () => { await result.current.deleteCard(13); });
        expect(result.current.pairs).toEqual({ '11|12': plain });
    });

    it('savePair in a non-recipe deck keeps its cards untouched', async () => {
        const { result } = await mount(DECK, [WOOD, STONE], [WS]);
        api.put.mockResolvedValue({ ...WS, name: 'X' });
        await act(async () => { await result.current.savePair({ cardAId: 11, cardBId: 12, name: 'X' }); });
        expect(result.current.cards).toEqual([WOOD, STONE]);
        expect(result.current.pairs).toEqual({ '11|12': { ...WS, name: 'X' } });
    });
});
