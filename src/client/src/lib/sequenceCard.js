// What a sequence card is showing, as a pure function of the graph.
//
// This is the card's lifecycle face, separate from pin activity. A pin adds
// emphasis to a card and one row; it never changes whether the work is blocked,
// complete or still outstanding.

import {
    SEQUENCE_STATUS,
    TODO_STATUS,
    sortByPosition,
    todoCountsOf,
    topPinnedTodoOf,
} from './graph';

/** The lifecycle faces of a card. Pin activity is rendered independently. */
export const CARD_STATE = {
    blocked: 'blocked',
    complete: 'complete',
    notStarted: 'not-started',
};

/**
 * Which lifecycle face to wear. The manual block wins over completion, matching
 * `sequenceStatus`; everything else with work left wears the quiet default.
 */
const cardStateOf = ({ sequence, counts }) => {
    if (sequence.isBlocked) return CARD_STATE.blocked;
    if (counts.total > 0 && counts.done === counts.total) return CARD_STATE.complete;
    return CARD_STATE.notStarted;
};

/**
 * Everything a card renders from, in one pass over the project's to-dos.
 *
 * `todos` may be the whole project's; the sequence's own are picked out here so
 * no caller has to group them first, exactly as `sequenceStatus` does.
 *
 * The returned lists are new arrays; nothing here touches its input.
 */
export const sequenceCardModel = ({ sequence, todos }) => {
    const own = sortByPosition(todos.filter((todo) => todo.sequenceId === sequence.id));
    const counts = todoCountsOf(sequence, todos);
    const topPinnedTodo = topPinnedTodoOf(sequence, todos);

    const done = own.filter((todo) => todo.status === TODO_STATUS.complete);
    const outstanding = own.filter((todo) => todo.status !== TODO_STATUS.complete);
    return {
        state: cardStateOf({ sequence, counts }),
        counts,
        // The whole of the sequence's to-dos in display order, for the callers
        // that still think in one list: the drop targets and the delete prompt.
        own,
        outstanding,
        topPinnedTodoId: topPinnedTodo?.id ?? null,
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
