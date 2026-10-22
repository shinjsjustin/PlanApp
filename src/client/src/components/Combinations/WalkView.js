import React from 'react';

import { getPair, walkKeys } from '../../lib/combinations';

const WalkView = ({ cards, pairs, walkCardId, selectedKey, onOpen, onSelectCard }) => {
    if (cards.length < 2) {
        return <p className="placeholder">Add at least two cards below to walk through their pairs.</p>;
    }

    const walkCard = cards.find((c) => c.id === walkCardId);

    return (
        <>
            <div className="walk-head">
                <label>
                    Card
                    <select value={walkCardId} onChange={(event) => onSelectCard(Number(event.target.value))}>
                        {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
            </div>
            {walkCard.detail && <p className="hint">{walkCard.detail}</p>}
            <ol className="walk-list">
                {walkKeys(cards, walkCardId).map((key, i) => {
                    const partnerId = Number(key.split('|').find((id) => Number(id) !== walkCardId));
                    const partner = cards.find((c) => c.id === partnerId);
                    const pair = getPair(pairs, walkCardId, partnerId);
                    return (
                        <li key={key}>
                            <button type="button" className={key === selectedKey ? 'sel' : undefined} onClick={() => onOpen(key)}>
                                <span className="num">{i + 1}.</span>
                                <i className={`dot st-${pair.state}`} title={pair.state} />
                                <span className="partner">+ {partner.name}</span>
                                <span className="pname">{pair.name || pair.state}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            <p className="hint">Pick a pair to edit it beside the list; use Previous / Next to step through.</p>
        </>
    );
};

export default WalkView;
