import React, { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import useCombinations from '../../hooks/useCombinations';
import { countStates } from '../../lib/combinations';
import CountsBar from './CountsBar';
import DeckBar from './DeckBar';
import '../Styling/Combinations.css';

const PROJECT_PARAM = 'project';
const DECK_PARAM = 'deck';

const toId = (value) => (value === null ? undefined : Number(value));

const CombinationsPage = () => {
    const [params, setParams] = useSearchParams();
    const projectId = toId(params.get(PROJECT_PARAM));
    const deckId = toId(params.get(DECK_PARAM));
    const { status, decks, deck, cards, pairs, error, createDeck, renameDeck, deleteDeck } =
        useCombinations({ projectId, deckId });

    const chooseDeck = (id) => {
        const next = new URLSearchParams(params);
        next.set(DECK_PARAM, id);
        setParams(next, { replace: true });
    };

    // Covers a missing ?deck and a deck that was just deleted.
    const isDeckListed = decks.some((d) => d.id === deckId);
    useEffect(() => {
        if (status === 'ready' && decks.length > 0 && !isDeckListed) chooseDeck(decks[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, decks, isDeckListed]);

    const handleCreate = async (name) => {
        const created = await createDeck(name, projectId ?? null);
        chooseDeck(created.id);
    };

    const handleDelete = async () => {
        await deleteDeck(deckId);
        const next = decks.find((d) => d.id !== deckId);
        if (next) chooseDeck(next.id);
    };

    const backTo = projectId === undefined ? '/projects' : `/projects/${projectId}`;

    return (
        <div className="combinations-page">
            <header>
                <Link to={backTo}>← Back</Link>
                <h1>Combinatorics <span>explorer</span></h1>
                <DeckBar
                    decks={decks}
                    deckId={isDeckListed ? deckId : undefined}
                    onSelect={chooseDeck}
                    onCreate={handleCreate}
                    onRename={(name) => renameDeck(deckId, name)}
                    onDelete={handleDelete}
                />
            </header>
            {status === 'error' && <p className="deck-error" role="alert">{error}</p>}
            {deck && <CountsBar cardCount={cards.length} counts={countStates(cards, pairs)} />}
            <div className="layout">
                <section className="panel view-panel" />
                <aside className="panel side" />
                <section className="panel cards" />
            </div>
        </div>
    );
};

export default CombinationsPage;
