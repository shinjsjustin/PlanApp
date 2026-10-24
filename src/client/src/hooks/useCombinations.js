import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { pairKey, toPairMap } from '../lib/combinations';

// One source of state for the Combinations page: the deck list, the open deck,
// its cards and pairs. Every action calls its route, updates state from the
// answer and re-throws a failure (after putting its message in `error`) so the
// caller can react. A failed call leaves state as it was. Answers that belong
// to a deck that is no longer open are dropped.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';
const DECKS_PATH = '/combinations/decks';

const byName = (a, b) => a.name.localeCompare(b.name);

const useCombinations = ({ projectId, deckId } = {}) => {
    const listPath = projectId === undefined || projectId === null
        ? DECKS_PATH
        : `${DECKS_PATH}?projectId=${projectId}`;
    const [status, setStatus] = useState('loading');
    const [decks, setDecks] = useState([]);
    const [deck, setDeck] = useState(null);
    const [cards, setCards] = useState([]);
    const [pairs, setPairs] = useState({});
    const [error, setError] = useState(null);
    const isMounted = useRef(true);
    const latestRequest = useRef(0);
    const deckIdRef = useRef(deckId);
    const listPathRef = useRef(listPath);
    const modeRef = useRef(undefined);
    modeRef.current = deck?.mode;
    deckIdRef.current = deckId;
    listPathRef.current = listPath;

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        latestRequest.current += 1;
        const requestId = latestRequest.current;
        const isStale = () => !isMounted.current || requestId !== latestRequest.current;
        setStatus('loading');
        const loadDeck = deckId === undefined || deckId === null
            ? Promise.resolve(null)
            : api.get(`${DECKS_PATH}/${deckId}`);
        Promise.all([api.get(listPath), loadDeck])
            .then(([list, open]) => {
                if (isStale()) return;
                setDecks(list.decks);
                setDeck(open ? open.deck : null);
                setCards(open ? open.cards : []);
                setPairs(open ? toPairMap(open.pairs, open.deck.mode) : {});
                setError(null);
                setStatus('ready');
            })
            .catch((err) => {
                if (isStale()) return;
                setError(err?.message || GENERIC_FAILURE);
                setStatus('error');
            });
    }, [listPath, deckId]);

    // Refetches the list so each deck's card and pair counts stay right. A
    // failure is shown in `error`; the change that triggered it still stands.
    const refreshDecks = useCallback(async () => {
        try {
            const list = await api.get(listPathRef.current);
            if (isMounted.current) setDecks(list.decks);
        } catch (err) {
            if (isMounted.current) setError(err?.message || GENERIC_FAILURE);
        }
    }, []);

    // Runs a call and hands its answer to `apply` only while the deck that was
    // open when the call started is still open. Transfer callers show their own
    // failures, so they pass `reportsFailure: false` to keep `error` unchanged.
    const run = useCallback(async (call, apply, { reportsFailure = true } = {}) => {
        const openDeckId = deckIdRef.current;
        let data;
        try {
            data = await call();
        } catch (err) {
            if (reportsFailure && isMounted.current) setError(err?.message || GENERIC_FAILURE);
            throw err;
        }
        if (!isMounted.current) return data;
        setError(null);
        if (deckIdRef.current === openDeckId) apply(data);
        return data;
    }, []);

    const createDeck = useCallback((name, linkedProjectId = null) => run(
        () => api.post(DECKS_PATH, { name, projectId: linkedProjectId }),
        (created) => setDecks((current) => [...current, created].sort(byName)),
    ), [run]);

    const importDecks = useCallback((data) => run(
        () => api.post('/combinations/import', data),
        ({ decks: imported }) => setDecks((current) => [...current, ...imported].sort(byName)),
        { reportsFailure: false },
    ), [run]);

    const exportDeck = useCallback((id) => run(
        () => api.get(`${DECKS_PATH}/${id}/export`),
        () => {},
        { reportsFailure: false },
    ), [run]);

    const promoteDeck = useCallback((id) => run(
        () => api.post(`${DECKS_PATH}/${id}/promote`),
        (created) => setDecks((current) => [...current, created].sort(byName)),
        { reportsFailure: false },
    ), [run]);

    const renameDeck = useCallback((id, name) => run(
        () => api.patch(`${DECKS_PATH}/${id}`, { name }),
        (renamed) => {
            setDecks((current) => current.map((d) => (d.id === id ? renamed : d)).sort(byName));
            setDeck((current) => (current && current.id === id ? renamed : current));
        },
    ), [run]);

    const deleteDeck = useCallback((id) => run(
        () => api.delete(`${DECKS_PATH}/${id}`),
        () => {
            setDecks((current) => current.filter((d) => d.id !== id));
            if (deckIdRef.current !== id) return;
            setDeck(null);
            setCards([]);
            setPairs({});
        },
    ), [run]);

    const addCard = useCallback(async (name, detail) => {
        const card = await run(
            () => api.post(`${DECKS_PATH}/${deckIdRef.current}/cards`, { name, detail }),
            (added) => setCards((current) => [...current, added]),
        );
        await refreshDecks();
        return card;
    }, [run, refreshDecks]);

    const updateCard = useCallback((id, fields) => run(
        () => api.patch(`/combinations/cards/${id}`, fields),
        (updated) => setCards((current) => current.map((c) => (c.id === id ? updated : c))),
    ), [run]);

    const setCardAxes = useCallback((id, { onX, onY }) => updateCard(id, { onX, onY }), [updateCard]);

    // Reloads the deck after the flip because going back to combinations folds
    // pair rows on the server.
    const setMode = useCallback((mode) => run(
        async () => {
            await api.patch(`${DECKS_PATH}/${deckIdRef.current}`, { mode });
            return api.get(`${DECKS_PATH}/${deckIdRef.current}`);
        },
        (open) => {
            setDeck(open.deck);
            setCards(open.cards);
            setPairs(toPairMap(open.pairs, open.deck.mode));
        },
    ), [run]);

    const moveCard = useCallback((id, direction) => run(
        () => api.put(`/combinations/cards/${id}/move`, { direction }),
        (moved) => setCards(moved.cards),
    ), [run]);

    const deleteCard = useCallback(async (id) => {
        const result = await run(
            () => api.delete(`/combinations/cards/${id}`),
            () => {
                setCards((current) => current.filter((c) => c.id !== id));
                setPairs((current) => Object.fromEntries(
                    Object.entries(current).filter(([, p]) => p.cardAId !== id && p.cardBId !== id),
                ));
            },
        );
        await refreshDecks();
        return result;
    }, [run, refreshDecks]);

    const savePair = useCallback(async (fields) => {
        const pair = await run(
            () => api.put(`${DECKS_PATH}/${deckIdRef.current}/pairs`, fields),
            (saved) => setPairs((current) => ({ ...current, [pairKey(saved.cardAId, saved.cardBId, modeRef.current)]: saved })),
        );
        await refreshDecks();
        return pair;
    }, [run, refreshDecks]);

    return {
        status, decks, deck, cards, pairs, error,
        createDeck, renameDeck, deleteDeck, importDecks, exportDeck, promoteDeck, addCard, updateCard, moveCard, deleteCard, savePair, setMode, setCardAxes,
    };
};

export default useCombinations;
