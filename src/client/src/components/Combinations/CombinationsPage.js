import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import useCombinations from '../../hooks/useCombinations';
import { cardKinds, countStates, exportFileName, getPair, nextUnfilledKey, stepKey, walkKeys } from '../../lib/combinations';
import AxisTray from './AxisTray';
import CardList from './CardList';
import CountsBar from './CountsBar';
import DeckBar from './DeckBar';
import GridView from './GridView';
import PairPanel from './PairPanel';
import RingView from './RingView';
import Toast from './Toast';
import WalkNav from './WalkNav';
import WalkView from './WalkView';
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
        importDecks, exportDeck, promoteDeck, addCard, updateCard, moveCard, deleteCard, savePair, setMode, setRecipe, setCardAxes } =
        useCombinations({ projectId, deckId });

    const mode = deck?.mode || 'combinations';
    const recipe = Boolean(deck?.recipe);
    const requestedView = params.get(VIEW_PARAM);
    const view = VIEWS.some((v) => v.id === requestedView) ? requestedView : DEFAULT_VIEW;

    const [selectedKey, setSelectedKey] = useState(null);
    const [walkCardChoice, setWalkCardChoice] = useState(null);
    const [toast, setToast] = useState('');
    const clearToast = useCallback(() => setToast(''), []);
    const sideRef = useRef(null);

    // Only cards on an axis can be walked (a missing flag counts as on). Falls back to the first of
    // them when the choice is unset, left the deck or moved to the tray; undefined when none is on an axis.
    const walkable = cards.filter((c) => c.onX !== false || c.onY !== false);
    const walkCard = walkable.find((c) => c.id === walkCardChoice) || walkable[0];
    const keys = walkCard ? walkKeys(cards, walkCard.id, mode, recipe) : [];
    const isWalkNavShown = view === 'walk' && cards.length >= 2 && Boolean(walkCard);

    const chooseWalkCard = (id) => {
        setWalkCardChoice(id);
        if (selectedKey && !walkKeys(cards, id, mode, recipe).includes(selectedKey)) setSelectedKey(null);
    };

    const openStep = (key) => key && openPair(key);
    const handleNextUnfilled = () => {
        const key = nextUnfilledKey(keys, selectedKey, pairs, mode);
        if (key) openPair(key);
        else setToast(`Every pair of ${walkCard.name} is filled.`);
    };

    const chooseDeck = (id) => {
        const next = new URLSearchParams(params);
        next.set(DECK_PARAM, id);
        setParams(next, { replace: true });
        setWalkCardChoice(null);
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

    const handlePromote = async () => {
        if (countStates(cards, pairs, mode, recipe).done === 0) {
            setToast('No done pairs in this deck yet.');
            return;
        }
        const created = await promoteDeck(deckId);
        chooseDeck(created.id);
        setToast(`New deck with ${created.cardCount} cards from done pairs.`);
    };

    const handleExport = async () => {
        const exported = await exportDeck(deckId);
        const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = exportFileName(deck.name);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
    };

    const handleImport = async (file) => {
        try {
            const { decks: imported } = await importDecks(JSON.parse(await file.text()));
            chooseDeck(imported[0].id);
            setToast(imported.length === 1 ? `Imported "${imported[0].name}".` : `Imported ${imported.length} decks.`);
        } catch (err) {
            setToast(`Could not import ${file.name}: ${err.message}`);
        }
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
                    onPromote={handlePromote}
                    onExport={handleExport}
                    onImport={handleImport}
                />
            </header>
            {error && <p className="deck-error" role="alert">{error}</p>}
            {deck && <CountsBar cardCount={cards.length} counts={countStates(cards, pairs, mode, recipe)} />}
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
                    {deck && (
                        <AxisTray
                            cards={cards}
                            mode={mode}
                            recipe={recipe}
                            setCardAxes={setCardAxes}
                            setMode={setMode}
                            setRecipe={setRecipe}
                        />
                    )}
                    {deck && view === 'ring' && (
                        <RingView
                            key={deck.id}
                            cards={cards}
                            pairs={pairs}
                            mode={mode}
                            selectedKey={selectedKey}
                            onOpen={openPair}
                        />
                    )}
                    {deck && view === 'grid' && (
                        <GridView cards={cards} pairs={pairs} mode={mode} recipe={recipe} selectedKey={selectedKey} onOpen={openPair} />
                    )}
                    {deck && view === 'walk' && walkCard && (
                        <WalkView
                            cards={cards}
                            pairs={pairs}
                            mode={mode}
                            recipe={recipe}
                            walkCardId={walkCard.id}
                            selectedKey={selectedKey}
                            onOpen={openPair}
                            onSelectCard={chooseWalkCard}
                        />
                    )}
                </section>
                <aside className="panel side" ref={sideRef}>
                    {isWalkNavShown && (
                        <WalkNav
                            cardName={walkCard.name}
                            keys={keys}
                            selectedKey={selectedKey}
                            onPrevious={() => openStep(stepKey(keys, selectedKey, -1))}
                            onNext={() => openStep(stepKey(keys, selectedKey, 1))}
                            onNextUnfilled={handleNextUnfilled}
                        />
                    )}
                    {cardA && cardB ? (
                        <PairPanel
                            key={selectedKey}
                            cardA={cardA}
                            cardB={cardB}
                            pair={getPair(pairs, cardA.id, cardB.id, mode)}
                            recipe={recipe}
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
                            kinds={recipe ? cardKinds(cards, Object.values(pairs)) : undefined}
                            addCard={addCard}
                            updateCard={updateCard}
                            moveCard={moveCard}
                            deleteCard={deleteCard}
                        />
                    )}
                </section>
            </div>
            <Toast message={toast} onClear={clearToast} />
        </div>
    );
};

export default CombinationsPage;
