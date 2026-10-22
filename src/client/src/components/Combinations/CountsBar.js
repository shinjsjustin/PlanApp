import React from 'react';

const STATE_ITEMS = ['done', 'drafted', 'struck', 'empty'];

// Mirrors the prototype's renderCounts: cards, pairs, then each pair state.
const CountsBar = ({ cardCount, counts }) => (
    <div className="counts" aria-label="Counts" aria-live="polite">
        <span>Cards <b>{cardCount}</b></span>
        <span className="sep">·</span>
        <span>Pairs <b>{counts.total}</b></span>
        {STATE_ITEMS.map((state) => (
            <React.Fragment key={state}>
                <span className="sep">·</span>
                <span><i className={`dot st-${state}`} />{state} <b>{counts[state]}</b></span>
            </React.Fragment>
        ))}
    </div>
);

export default CountsBar;
