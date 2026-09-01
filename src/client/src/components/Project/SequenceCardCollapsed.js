import React from 'react';

import { CARD_STATE } from '../../lib/sequenceCard';

// The folded card (design 2A). One title and, depending on the state, one line
// of status underneath it — which is the whole point of the redesign: a
// zoomed-out canvas should say what to do next without being opened.
//
// The state decides the second line, and only the state:
//
//   active       the next step, behind a purple NEXT label and a live checkbox
//   blocked      what it is waiting on, in red, with an inert circle
//   not started  nothing — just the title and how many to-dos are filed
//   complete     nothing — a check badge, a grey title, and the final count
//
// The checkbox on an active card is real: the next step can be ticked off
// without opening the card, which is the fastest path through a plan and the
// reason the folded card carries a control at all. A blocked card's circle is
// deliberately not one — the thing to do about a blocked sequence is unblock it,
// not tick its first to-do.
//
// `children` is the chevron, passed in rather than rendered here: it is the
// card's own control, carries the card's `aria-expanded`, and reads the same in
// both modes.

const CHECK = '✓';

/** The count on the right of a single-line card, which differs by state. */
const summaryOf = (state, counts) => {
    if (state === CARD_STATE.complete) return `${counts.done}/${counts.total} complete`;

    return `${counts.total} to-do${counts.total === 1 ? '' : 's'}`;
};

const SequenceCardCollapsed = ({ model, title, onCompleteTodo, children }) => {
    const { state, counts, next } = model;

    // A status line needs both a state that wants one and something to put in
    // it. A blocked sequence with nothing outstanding has nothing to wait on, so
    // it falls back to the quiet face rather than printing an empty line.
    const isActive = state === CARD_STATE.active;
    const isWaiting = state === CARD_STATE.blocked;
    const hasStatusLine = (isActive || isWaiting) && next !== null;

    if (!hasStatusLine) {
        return (
            <div className="sequence-card-collapsed sequence-card-collapsed--quiet">
                {children}

                {state === CARD_STATE.complete && (
                    <span className="sequence-card-complete-badge" aria-hidden="true">
                        {CHECK}
                    </span>
                )}

                <span className="sequence-card-collapsed-title">{title}</span>
                <span className="sequence-card-collapsed-summary">
                    {summaryOf(state, counts)}
                </span>
            </div>
        );
    }

    return (
        <div className="sequence-card-collapsed">
            {children}

            <div className="sequence-card-collapsed-lines">
                <div className="sequence-card-collapsed-line">
                    <span className="sequence-card-collapsed-title">{title}</span>
                    <span className="sequence-card-progress">
                        {counts.done}/{counts.total}
                    </span>
                </div>

                <div className="sequence-card-collapsed-line">
                    {/* Only the active card's circle is a control. On a blocked
                        card it is a marker: the same shape, in red, with nothing
                        behind it, because ticking the first to-do is not what
                        unblocks a sequence. */}
                    {isActive ? (
                        <button
                            type="button"
                            className="todo-check todo-check--next"
                            aria-label={`Complete “${next.text}”`}
                            onClick={() => onCompleteTodo(next)}
                        />
                    ) : (
                        <span className="todo-check todo-check--waiting" aria-hidden="true" />
                    )}

                    <span className="sequence-card-collapsed-label">
                        {isActive ? 'NEXT' : 'WAITING ON'}
                    </span>
                    <span className="sequence-card-collapsed-next">{next.text}</span>
                </div>
            </div>
        </div>
    );
};

export default SequenceCardCollapsed;
