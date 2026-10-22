import React from 'react';

import usePairDraft from '../../hooks/usePairDraft';
import { PAIR_STATES } from '../../lib/combinations';

const Detail = ({ card }) => card.detail
    ? <div><b>{card.name}:</b> {card.detail}</div>
    : null;

// Keyed by pair on the page, so switching pairs remounts it and flushes the old draft.
const PairPanel = ({ cardA, cardB, pair, savePair, onClose }) => {
    const save = (fields) => savePair({ cardAId: cardA.id, cardBId: cardB.id, ...fields });
    const { draft, setField, setState, status, retry } = usePairDraft({ pair, save });
    const title = `${cardA.name} + ${cardB.name}`;

    return (
        <div className="editor">
            <h2>{title}</h2>
            <div className="details">
                <Detail card={cardA} />
                <Detail card={cardB} />
            </div>
            <span className="field-label">State</span>
            <div className="state-btns">
                {PAIR_STATES.map((state) => (
                    <button
                        key={state}
                        type="button"
                        className={`st-${state}`}
                        aria-pressed={draft.state === state}
                        onClick={() => setState(state)}
                    >
                        <i className={`dot st-${state}`} />{state}
                    </button>
                ))}
            </div>
            <label htmlFor="pair-name">Name</label>
            <input
                id="pair-name"
                value={draft.name}
                placeholder={title}
                onChange={(e) => setField('name', e.target.value)}
            />
            <label htmlFor="pair-effect">Effect</label>
            <textarea
                id="pair-effect"
                rows={3}
                value={draft.effect}
                placeholder="What the pair does"
                onChange={(e) => setField('effect', e.target.value)}
            />
            <label htmlFor="pair-notes">Notes</label>
            <textarea
                id="pair-notes"
                rows={4}
                value={draft.notes}
                placeholder="Anything else"
                onChange={(e) => setField('notes', e.target.value)}
            />
            <div className="editor-foot">
                {status === 'error' ? (
                    <span role="alert">Not saved <button type="button" onClick={retry}>Retry</button></span>
                ) : (
                    <span>Saved as you type.</span>
                )}
                <button type="button" onClick={onClose}>Close</button>
            </div>
        </div>
    );
};

export default PairPanel;
