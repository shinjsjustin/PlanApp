// What a sequence card is showing, as a pure function of the graph.
//
// This is the card's *visual* state, which is a finer thing than the status in
// `graph.js`: `sequenceStatus` answers "how is this sequence doing", and every
// consumer of that — the projects home page, the ready frontier, the server's
// mirrored copy — keeps answering it exactly as before. This answers "which of
// the four faces does this card wear", which the redesign added a fourth case to:
// the one sequence in operation looks different from the ones merely waiting.
//
// The precedence is the app's, not the mock's. The design handoff orders it
// complete → blocked → active → not started; here `blocked` still wins over
// everything, because that is what `sequenceStatus` has always said and what the
// footer's status text, the frontier and the server all agree on. The two only
// disagree about a sequence that is manually blocked *and* has every to-do
// ticked — a state the mock never draws — and letting the card call that one
// "complete" while every other surface called it "blocked" would be the worse
// answer.

import { SEQUENCE_STATUS, TODO_STATUS, sortByPosition, todoCountsOf } from './graph';

/** The four faces of a card. `active` is the one in operation — at most one. */
export const CARD_STATE = {
    active: 'active',
    blocked: 'blocked',
    complete: 'complete',
    notStarted: 'not-started',
};

/**
 * Which face to wear. `blocked` first (see the note at the top of this file),
 * then a finished sequence, then the one in operation, and otherwise the quiet
 * default — a sequence with work outstanding that is not the one to do next.
 */
const cardStateOf = ({ sequence, counts, isActive }) => {
    if (sequence.isBlocked) return CARD_STATE.blocked;
    if (counts.total > 0 && counts.done === counts.total) return CARD_STATE.complete;
    if (isActive) return CARD_STATE.active;

    return CARD_STATE.notStarted;
};

/**
 * Everything a card renders from, in one pass over the project's to-dos.
 *
 * `todos` may be the whole project's; the sequence's own are picked out here so
 * no caller has to group them first, exactly as `sequenceStatus` does.
 *
 * `isActive` is decided above the card by `activeSequenceId`, because only the
 * canvas can see the whole graph and the ring has to be exclusive. A card
 * rendered outside a canvas — a test, a future preview — simply is not active.
 *
 * The returned lists are new arrays; nothing here touches its input.
 */
export const sequenceCardModel = ({ sequence, todos, isActive = false }) => {
    const own = sortByPosition(todos.filter((todo) => todo.sequenceId === sequence.id));
    const counts = todoCountsOf(sequence, todos);

    const done = own.filter((todo) => todo.status === TODO_STATUS.complete);
    const outstanding = own.filter((todo) => todo.status !== TODO_STATUS.complete);
    const [next = null, ...then] = outstanding;

    return {
        state: cardStateOf({ sequence, counts, isActive }),
        counts,
        // The whole of the sequence's to-dos in display order, for the callers
        // that still think in one list: the drop targets and the delete prompt.
        own,
        next,
        // What the THEN section lists: everything outstanding bar the one in the
        // spotlight, so no to-do is ever drawn twice.
        then,
        done,
    };
};

/**
 * The status word in the footer of an open card. Deliberately still driven by
 * `sequenceStatus` rather than by the card state above: it is the same sentence
 * the rest of the app says about this sequence, and the redesign only moved
 * where it is printed.
 */
export const STATUS_LABELS = {
    [SEQUENCE_STATUS.blocked]: 'Blocked',
    [SEQUENCE_STATUS.complete]: 'Complete',
    [SEQUENCE_STATUS.incomplete]: 'Incomplete',
};
