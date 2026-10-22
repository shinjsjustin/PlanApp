import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import useCombinations from '../../hooks/useCombinations';
import { countStates, getPair } from '../../lib/combinations';
import CardList from './CardList';
import CountsBar from './CountsBar';
import DeckBar from './DeckBar';
import GridView from './GridView';
import PairPanel from './PairPanel';
import RingView from './RingView';
import '../Styling/Combinations.css';

const PROJECT_PARAM = 'project';
const DECK_PARAM = 'deck';
const VIEW_PARAM = 'view';

const VIEWS = [
    { id: 'ring', label: 'Ring' },
    { id: 'grid', label: 'Grid' },
    { id: 'walk', label: 'Walkthrough' },
];
const DEFAULT_VIEW = 'ring';

const NARROW_WIDTH = 860;
const STATE_LEGEND = ['empty', 'drafted', 'done', 'struck'];

const toId = (value) => (value === null ? undefined : Number(value));

const CombinationsPage = () => {
    const [params, setParams] = useSearchParams();
    const projectId = toId(params.get(PROJECT_PARAM));
    const deckId = toId(params.get(DECK_PARAM));
    const { status, decks, deck, cards, pairs, error, createDeck, renameDeck, deleteDeck,
        addCard, updateCard, moveCard, deleteCard, savePair } =
        useCombinations({ projectId, deckId });

    const requestedView = params.get(VIEW_PARAM);
    const view = VIEWS.some((v) => v.id === requestedView) ? requestedView : DEFAULT_VIEW;

    const [selectedKey, setSelectedKey] = useState(null);
    const sideRef = useRef(null);

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

    const chooseView = (id) => {
        const next = new URLSearchParams(params);
        next.set(VIEW_PARAM, id);
        setParams(next, { replace: true });
    };

    const handleCreate = async (name) => {
        const created = await createDeck(name, projectId ?? null);
        chooseDeck(created.id);
    };

    const handleDelete = async () => {
        await deleteDeck(deckId);
        const next = decks.find((d) => d.id !== deckId);
        if (next) chooseDeck(next.id);
    };

    const openPair = (key) => {
        setSelectedKey(key);
        if (window.innerWidth <= NARROW_WIDTH && typeof sideRef.current?.scrollIntoView === 'function') {
            sideRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // A key left over from another deck or a deleted card opens nothing.
    const [selA, selB] = selectedKey ? selectedKey.split('|').map(Number) : [];
    const cardA = cards.find((c) => c.id === selA);
    const cardB = cards.find((c) => c.id === selB);

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
            {error && <p className="deck-error" role="alert">{error}</p>}
            {deck && <CountsBar cardCount={cards.length} counts={countStates(cards, pairs)} />}
            <div className="layout">
                <section className="panel view-panel">
                    <div className="tabs" role="tablist">
                        {VIEWS.map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={id === view}
                                onClick={() => chooseView(id)}
                            >
                                {label}
                            </button>
                        ))}
                        <div className="legend">
                            {STATE_LEGEND.map((state) => (
                                <span key={state}><i className={`dot st-${state}`} />{state}</span>
                            ))}
                        </div>
                    </div>
                    {deck && view === 'ring' && (
                        <RingView
                            key={deck.id}
                            cards={cards}
                            pairs={pairs}
                            selectedKey={selectedKey}
                            onOpen={openPair}
                        />
                    )}
                    {deck && view === 'grid' && (
                        <GridView cards={cards} pairs={pairs} selectedKey={selectedKey} onOpen={openPair} />
                    )}
                </section>
                <aside className="panel side" ref={sideRef}>
                    {cardA && cardB ? (
                        <PairPanel
                            key={selectedKey}
                            cardA={cardA}
                            cardB={cardB}
                            pair={getPair(pairs, cardA.id, cardB.id)}
                            savePair={savePair}
                            onClose={() => setSelectedKey(null)}
                        />
                    ) : (
                        <p className="placeholder">
                            Click a line in the ring, a cell in the grid or a row in the walkthrough to open that pair here.
                        </p>
                    )}
                </aside>
                <section className="panel cards">
                    {deck && (
                        <CardList
                            key={deck.id}
                            cards={cards}
                            pairs={pairs}
                            addCard={addCard}
                            updateCard={updateCard}
                            moveCard={moveCard}
                            deleteCard={deleteCard}
                        />
                    )}
                </section>
            </div>
        </div>
    );
};

export default CombinationsPage;
