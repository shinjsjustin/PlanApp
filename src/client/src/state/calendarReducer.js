// The calendar, as state.
//
// Deliberately *not* normalised into objects keyed by id, unlike
// `projectReducer`. Two reasons, and both are about what the data is:
//
//   - The day strip is an ordering. Keying days by id throws that away and then
//     rebuilds it from `position` on every render, for a collection that is
//     already a list.
//   - Every gesture is computed by `lib/schedule`, which works on arrays. A
//     keyed store would mean converting both ways on every pointer move of a
//     drag, for at most a few hundred rows.
//
// The whole schedule is replaced in one action rather than patched row by row,
// for the same reason: a gesture is a single arithmetic result over both
// collections, not a set of independent edits. That also makes the rollback a
// plain assignment of a snapshot taken beforehand.

export const CALENDAR_STATUS = {
    idle: 'idle',
    loading: 'loading',
    ready: 'ready',
    error: 'error',
};

export const CALENDAR_ACTIONS = {
    loadStarted: 'loadStarted',
    loadSucceeded: 'loadSucceeded',
    loadFailed: 'loadFailed',
    scheduleReplaced: 'scheduleReplaced',
    rolledBack: 'rolledBack',
    actionErrorCleared: 'actionErrorCleared',
};

export const initialCalendarState = {
    status: CALENDAR_STATUS.idle,
    // The load failed and there is no calendar to show — the page offers a retry.
    loadError: null,
    // A mutation failed and was rolled back — the page raises a toast.
    actionError: null,
    days: [],
    items: [],
};

/** The part of the state a gesture changes, and a rollback restores. */
export const scheduleOf = (state) => ({ days: state.days, items: state.items });

const handlers = {
    [CALENDAR_ACTIONS.loadStarted]: (state) => ({
        ...state,
        status: CALENDAR_STATUS.loading,
        loadError: null,
    }),

    [CALENDAR_ACTIONS.loadSucceeded]: (state, { calendar }) => ({
        ...state,
        status: CALENDAR_STATUS.ready,
        loadError: null,
        days: calendar.days,
        items: calendar.items,
    }),

    [CALENDAR_ACTIONS.loadFailed]: (state, { error }) => ({
        ...state,
        status: CALENDAR_STATUS.error,
        loadError: error,
    }),

    [CALENDAR_ACTIONS.scheduleReplaced]: (state, { schedule }) => ({
        ...state,
        days: schedule.days,
        items: schedule.items,
    }),

    [CALENDAR_ACTIONS.rolledBack]: (state, { snapshot, error }) => ({
        ...state,
        ...snapshot,
        actionError: error,
    }),

    [CALENDAR_ACTIONS.actionErrorCleared]: (state) => ({ ...state, actionError: null }),
};

export const calendarReducer = (state, action) => {
    const handler = handlers[action.type];

    if (!handler) throw new Error(`Unknown calendar action "${action.type}"`);

    return handler(state, action);
};
