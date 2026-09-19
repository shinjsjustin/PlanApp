import React from 'react';

import { CARD_STATE } from '../../lib/sequenceCard';

// The folded card (design 2A). One title and, for a blocked sequence, the first
// outstanding item it is waiting on. Pin activity is expressed by the card ring
// around this content rather than by replacing the lifecycle summary.
//
// The state decides the second line, and only the state:
//
//   blocked      what it is waiting on, in red, with an inert circle
//   not started  nothing — just the title and how many to-dos are filed
//   complete     nothing — a check badge, a grey title, and the final count
//
// `children` is the chevron, and `grip` is the drag handle, both passed in
// rather than rendered here: each is the card's own control, carries state the
// card itself owns (the chevron's `aria-expanded`, the grip's sortable
// listeners), and reads the same in both modes.

const CHECK = '✓';

/** The count on the right of a single-line card, which differs by state. */
const summaryOf = (state, counts) => {
    if (state === CARD_STATE.complete) return `${counts.done}/${counts.total} complete`;

    return `${counts.total} to-do${counts.total === 1 ? '' : 's'}`;
};

const SequenceCardCollapsed = ({ model, title, children, grip }) => {
    const { state, counts, outstanding } = model;
    const [firstOutstanding = null] = outstanding;

    // A status line needs both a state that wants one and something to put in
    // it. A blocked sequence with nothing outstanding has nothing to wait on, so
    // it falls back to the quiet face rather than printing an empty line.
    const isWaiting = state === CARD_STATE.blocked;
    const hasStatusLine = isWaiting && firstOutstanding !== null;

    if (!hasStatusLine) {
        return (
            <div className="sequence-card-collapsed sequence-card-collapsed--quiet">
                {children}
                {grip}

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
            {grip}

            <div className="sequence-card-collapsed-lines">
                <div className="sequence-card-collapsed-line">
                    <span className="sequence-card-collapsed-title">{title}</span>
                    <span className="sequence-card-progress">
                        {counts.done}/{counts.total}
                    </span>
                </div>

                <div className="sequence-card-collapsed-line">
                    {/* A blocked card's circle is a marker, not a control:
                        ticking the first to-do is not what unblocks a sequence. */}
                    <span className="todo-check todo-check--waiting" aria-hidden="true" />

                    <span className="sequence-card-collapsed-label">WAITING ON</span>
                    <span className="sequence-card-collapsed-next">
                        {firstOutstanding.text}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default SequenceCardCollapsed;
