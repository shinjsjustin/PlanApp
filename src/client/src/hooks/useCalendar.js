import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { ApiError, api } from '../lib/api';
import { toBulkRequest } from '../lib/calendarRequest';
import { appendDay, removeDay, unscheduleItem } from '../lib/schedule';
import { isTempId } from '../lib/tempIds';
import { calendarReducer, initialCalendarState, scheduleOf } from '../state/calendarReducer';
import {
    actionErrorCleared,
    actionErrorRaised,
    loadFailed,
    loadStarted,
    loadSucceeded,
    rolledBack,
    scheduleReplaced,
} from '../state/calendarActions';

// Loads the calendar and applies changes to it optimistically, mirroring
// `useProjectGraph`.
//
// Each mutation dispatches its change immediately, sends the request, and then
// either installs what the server stored or rolls the whole schedule back to the
// snapshot taken beforehand and raises `actionError` for the page to surface.
// Nothing fails quietly.
//
// What is different here is the unit of change. A project mutation moves one row
// and a few neighbours; a calendar gesture is one arithmetic result over the
// whole schedule, computed by `lib/schedule` before it ever reaches this file.
// So the optimistic step is "replace the schedule", and the snapshot a rollback
// restores is the schedule as it was.

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const TODO_COMPLETE = 'complete';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/**
 * Records a failure for whoever has to work out why, without changing a word of
 * what the user is told.
 *
 * Both halves on purpose. A refused gesture or a payload the reducer would not
 * ingest says why on screen — that wording is deliberate and pinned by tests —
 * while the error itself, stack and all, goes where a string in a toast could
 * never carry it.
 *
 * An `ApiError` is not recorded. That class is the wire saying one of the things
 * the wire says: offline, 500, 409. The user is already being shown it, the
 * server has its own log of it, and repeating every one here would bury the
 * entries that mean a defect on this side under the ones that do not. What is
 * left is exactly that: an error this code did not expect to be possible.
 */
const logFailure = (context, error) => {
    if (error instanceof ApiError || error?.alreadyLogged) return;

    console.error(`[calendar] ${context}`, error);
};


const UNREADABLE_CALENDAR = 'The server sent an unreadable calendar.';

/**
 * The wire is a boundary, and `api` guarantees a parsed body and nothing at all
 * about its shape.
 *
 * Handed on unchecked, a body missing a collection reaches `loadSucceeded` as
 * `undefined.forEach` — which lands in `fetchCalendar`'s `catch` and puts a
 * stack trace's wording beside the retry button, with nothing anywhere saying
 * what the server actually sent. So the shape is checked where it enters, the
 * user is told something about the server, and the body goes to the console for
 * whoever has to work out why.
 *
 * Only that both collections are there: what is *in* them is `assertIngestible`'s
 * question, and it already answers it one item at a time.
 */
const readCalendar = (payload) => {
    if (!Array.isArray(payload?.days) || !Array.isArray(payload?.items)) {
        console.error('[calendar] unreadable response body:', payload);

        // The body is the diagnostic here, and it is already on the record, so
        // `logFailure` does not repeat it with a stack pointing at this line.
        const error = new Error(UNREADABLE_CALENDAR);
        error.alreadyLogged = true;

        throw error;
    }

    return payload;
};

/** A gesture that asks the server for nothing — a drag let go where it started. */
const isNoOp = (request) =>
    request.appendDays === 0 &&
    request.placements.length === 0 &&
    request.unschedule.length === 0;

/**
 * Whether anything has settled into the state tree since `installed` was put
 * there — another mutation, or a reload.
 *
 * Exact rather than a heuristic, and cheap: `calendarReducer` installs both
 * collections by reference, so the identity survives for as long as nothing has
 * replaced them. That is the same reference contract the reducer's own tests
 * pin, and it is what makes this a fact about the state rather than a guess.
 *
 * A landed load is always visible to it for a second reason worth keeping in
 * mind: the arrays it installs are freshly parsed from the response, so they
 * can never be the ones a mutation is holding, however alike the contents. The
 * tests reuse one fixture object across mocks and so do not exercise that;
 * `api` parsing each response separately is what makes it true in the app.
 */
const hasSettledSince = (state, installed) =>
    state.days !== installed.days || state.items !== installed.items;

/**
 * Swaps an optimistic day for the row the server stored, carrying any bookings
 * that were pointing at the temporary id across with it.
 *
 * Both maps are lookups by id rather than by position, which is what lets this
 * run against a schedule that has moved on since the day was added: a day that
 * is no longer there is simply not found, and nothing is put back.
 */
const reconcileDay = (schedule, tempId, saved) => ({
    days: schedule.days.map((day) => (day.id === tempId ? saved : day)),
    items: schedule.items.map((item) =>
        item.dayId === tempId ? { ...item, dayId: saved.id } : item
    ),
});

/**
 * The same swap for the days a *spill* invented, which is the one thing a
 * gesture's answer carries that nothing else can supply.
 *
 * A booking dragged past midnight draws its new day at once under a temporary
 * id, and only the reply to the write that stored it knows the real one. So this
 * runs even when that reply is otherwise too old to install: dropping it whole
 * would leave a day in the strip the server has never heard of, and
 * `hasUnsavedDay` true for good, which disables every gesture on the page.
 *
 * Paired from the end of both lists rather than by position across them. A day
 * is only ever appended — `spillFrom` mints them in order, and the server lists
 * the rows it just created last — so the trailing ones correspond however many
 * real days sit in front of them, including any a `deleteDay` removed in the
 * meantime.
 */
const reconcileSpilledDays = (schedule, optimistic, saved) => {
    const invented = optimistic.days.filter((day) => isTempId(day.id));
    const created = saved.days.slice(saved.days.length - invented.length);

    return created.reduce(
        (settled, day, index) => reconcileDay(settled, invented[index].id, day),
        schedule
    );
};

/**
 * `onTodoCompleted` is called after a completion the server accepted, and is how
 * the pool refills: the frontier moves on when work is ticked off, and only the
 * page above both hooks knows they are on screen together. It is optional
 * because the hook is complete without it — a calendar with no pool beside it
 * still ticks bookings off.
 */
const useCalendar = ({ onTodoCompleted = null, onDayDeleted = null } = {}) => {
    const [state, rawDispatch] = useReducer(calendarReducer, initialCalendarState);

    // The state as the reducer has already been told to make it.
    //
    // Mutations need the schedule as it is at the moment they run — to snapshot
    // it for a rollback, and to rebase the server's answer onto it afterwards.
    // `state` in a callback closure is the render's value, which may already be
    // stale. So is a ref assigned during render: a dispatch only reaches `state`
    // on the next render, and a response can beat that render — the reconcile
    // below would then find no temporary day and drop the one it just added.
    //
    // Folded forward through the same reducer rather than tracked by hand, so
    // there is one definition of what an action does and no second copy to drift.
    const stateRef = useRef(initialCalendarState);

    /**
     * The only dispatcher this hook uses; nothing calls `rawDispatch` directly.
     *
     * Because the fold runs here, a reducer that refuses an action — the ingest
     * guard on a malformed item — throws in the caller's own frame rather than
     * during the next render, which is what lets `mutate` catch it and roll back
     * instead of the page's error boundary swallowing the whole calendar. React
     * state is left untouched when it throws, so the two stay in step.
     */
    const dispatch = useCallback((action) => {
        stateRef.current = calendarReducer(stateRef.current, action);

        rawDispatch(action);
    }, []);

    // Counts the loads that have replaced the schedule wholesale.
    //
    // The same guard `useProjectGraph` puts on a response for a project the page
    // has already left, pointed the other way: there a load checks whether it is
    // still wanted, here a mutation checks whether a load has overtaken it. A
    // mutation in flight across one is answering about a strip the server has
    // since described in full, and its answer is the older of the two.
    //
    // Only a *successful* load bumps it. A failed one leaves `days` and `items`
    // untouched, so nothing has overtaken anybody.
    const loadGenerationRef = useRef(0);

    /**
     * Reads the calendar and installs it, without saying anything about how the
     * page should look while that happens. Both outcomes set a terminal status
     * of their own, so this is the whole of a load bar its opening move.
     *
     * The generation is bumped on success only, and the line's position is load
     * bearing rather than tidy: a `finally` here would count a *failed* load,
     * which replaced nothing, as having overtaken the mutations in flight across
     * it. Each would then decline to install its own answer — an `addDay` would
     * strand its temporary day, and `hasUnsavedDay` would stay true, disabling
     * the + and every drop target until some later load happened to succeed.
     */
    const fetchCalendar = useCallback(async () => {
        try {
            dispatch(loadSucceeded(readCalendar(await api.get('/calendar'))));
            loadGenerationRef.current += 1;
        } catch (err) {
            logFailure('load failed', err);

            dispatch(loadFailed(messageOf(err)));
        }
    }, [dispatch]);

    /**
     * The opening load, and the retry button's. This is the one that empties the
     * page to its loading state first, because on this path there is either
     * nothing on screen yet or nothing on screen worth keeping.
     */
    const load = useCallback(async () => {
        dispatch(loadStarted());

        await fetchCalendar();
    }, [dispatch, fetchCalendar]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Runs one optimistic mutation: apply, send, then settle. `apply` turns the
     * schedule into what it should look like at once; `onSuccess` turns the
     * server's answer into what it should look like afterwards, and is omitted
     * when the optimistic change was already the final one.
     *
     * Resolves to whether the write landed, for the caller that has something to
     * do about it beyond the schedule itself. A mutation overtaken by a load
     * counts as landed: it declines to install its own answer, but the server
     * took the write.
     */
    const mutate = useCallback(async ({ apply, send, onSuccess }) => {
        const previous = scheduleOf(stateRef.current);
        const generation = loadGenerationRef.current;

        // What this mutation put on screen, once the reducer has accepted it.
        //
        // Compared by reference at the end and nothing else. It is deliberately
        // *not* what the server's answer is rebased onto — that reads
        // `stateRef.current` after the await, and must keep doing so, or the
        // interleaved-delete defect comes straight back. This is the opposite
        // question: not "what should the state become" but "is the state still
        // the one I changed".
        let installed = null;

        try {
            // Both of these are inside the `try`, not in front of it. This
            // function is `async`, so a throw out here would reject the returned
            // promise instead of reaching the caller's own frame — and a drop
            // handler fires a mutation without awaiting it. A gesture the
            // schedule refuses (`removeDay` on a day that is not in the strip,
            // `requireBooking` on an unbooked to-do) or an item the reducer's
            // ingest guard refuses would then leave no optimistic change, no
            // request, no rollback and no message: an unhandled rejection in the
            // console and nothing on screen. Caught here, either one is a
            // rolled-back mutation with a visible `actionError`, and the request
            // is never sent — `send` is downstream of both.
            const optimistic = apply(previous);

            dispatch(scheduleReplaced(optimistic));
            installed = optimistic;

            const saved = await send();

            // A load landed while this was out, so the server has already said
            // what the whole schedule is and this answer is the older of the
            // two. Saying nothing is the point: `commit` would otherwise install
            // its `PUT`'s answer over the refetch and quietly wind the calendar
            // back, and `addDay`'s reconcile would rewrite a strip it can no
            // longer find its own day in. The write happened either way — the
            // refetch reflects it, or the next one will.
            if (loadGenerationRef.current !== generation) return true;

            // Rebased on the schedule as it is *now*, not on the optimistic one
            // this mutation applied before the await. The two differ whenever
            // something settled in between — deleting a real day while an
            // `addDay` is still in flight, which the × stays live for — and
            // reconciling onto the stale copy would put the deleted day back on
            // screen while it is gone from the server, diverged until a reload.
            if (onSuccess) {
                dispatch(scheduleReplaced(onSuccess(scheduleOf(stateRef.current), saved)));
            }

            return true;
        } catch (err) {
            logFailure('write failed', err);

            // `previous` is an undo only while this mutation's change is still
            // the last thing that happened. Once something else has settled —
            // the × on a real day during a pending `addDay` — the snapshot has
            // stopped being an undo and become a stale copy, and restoring it
            // would put the deleted day back on screen after the server dropped
            // it. The toast would say "Nope", which is about the add; nothing
            // would say the calendar is now fiction, and dismissing it would
            // leave the user working against phantom data until a reload.
            //
            // So the message is raised without touching the schedule, and the
            // server is asked what is actually true. `load` cannot recurse here:
            // it dispatches only load actions, none of which route back through
            // `mutate`. It does re-enter the reducer while any *other* mutation
            // is still in flight — but that one lands on this same check, so a
            // failure of its own resyncs too rather than writing a stale
            // snapshot over the refetch.
            //
            // No generation check here, unlike the success path above: a load
            // replaces both collections, so `hasSettledSince` already sees it
            // and this takes the resync branch. The refetch that follows is one
            // more request than strictly needed and never a wrong answer.
            if (installed && hasSettledSince(stateRef.current, installed)) {
                dispatch(actionErrorRaised(messageOf(err)));

                // `fetchCalendar` rather than `load`: nothing about this asked
                // the user to wait. Emptying the page to its loading state would
                // unmount the strip and the pool over a mutation that merely
                // interleaved, taking every day column's scroll position and
                // every open card with it. A resync that *fails* still lands on
                // `loadFailed` and the retry screen, which is right — at that
                // point nothing on screen is trustworthy anyway.
                fetchCalendar();

                return false;
            }

            dispatch(rolledBack(previous, messageOf(err)));

            return false;
        }
    }, [dispatch, fetchCalendar]);

    /**
     * Saves a settled gesture — a drop, a resize, a reorder.
     *
     * `next` is the whole schedule as `lib/schedule` computed it. Only the
     * difference goes on the wire: a resize near the top of a busy day moves half
     * a dozen bookings and leaves twenty alone. A gesture that changed nothing —
     * a drag let go where it started — sends nothing at all rather than a request
     * the server would apply to no effect.
     *
     * `toBulkRequest` throws rather than diff against a schedule holding a day
     * the server has not named yet. That throw is left to escape: this function
     * is deliberately not `async`, so it lands in the drop handler's own frame,
     * and `hasUnsavedDay` below is what keeps a user from reaching it.
     */
    const commit = useCallback(
        (next) => {
            const request = toBulkRequest(scheduleOf(stateRef.current), next);

            if (isNoOp(request)) return Promise.resolve();

            return mutate({
                apply: () => next,
                send: () => api.put('/calendar/items', request),
                // The server answers with the whole schedule it stored, which
                // replaces the optimistic one outright rather than being merged
                // into it — the request was atomic, so its result is too.
                //
                // But only while this write is still the last thing that
                // happened. Two gestures inside one round trip — book a row,
                // then drag its edge, or drag it back to the pool — put a second
                // write on the wire before the first has answered, and the first
                // answers about a strip the second has already moved past.
                // Installing it winds the calendar back, and if the two answers
                // arrive out of order it stays wound back until a reload. A
                // whole-schedule answer is the truth only for the schedule it
                // was asked about, which is the same reason the rollback path
                // below stops treating its snapshot as an undo.
                //
                // Too old to install is not the same as worthless, though. The
                // ids of the days this write appended exist nowhere else, so
                // they are carried across onto whatever has settled since rather
                // than thrown away with the rest of the answer.
                onSuccess: (current, saved) =>
                    hasSettledSince(current, next)
                        ? reconcileSpilledDays(current, next, saved)
                        : saved,
            });
        },
        [mutate]
    );

    /** The + at the right of the strip. */
    const addDay = useCallback(() => {
        // Assigned by `apply`, which `mutate` calls once and synchronously,
        // before the request it is reconciled by can possibly answer.
        let tempId = null;

        return mutate({
            apply: (previous) => {
                const optimistic = appendDay(previous);
                tempId = optimistic.days[optimistic.days.length - 1].id;

                return optimistic;
            },
            send: () => api.post('/calendar/days', {}),
            onSuccess: (current, saved) => reconcileDay(current, tempId, saved),
        });
    }, [mutate]);

    /**
     * Deletes a day. Its bookings are released rather than pushed forward — the
     * container goes, the work does not (design decision 6) — and the to-dos
     * behind them reappear in the pool.
     *
     * Its notes go with it and do not come back. That is the schema's
     * `ON DELETE CASCADE` rather than anything here (design 2026-09-16, decision
     * 9); `onDayDeleted` only lets the notes plane drop rows the server has
     * already destroyed. On success only — a rolled-back deletion put the day
     * back, and its notes are still in the notes hook's state ready to be drawn
     * again.
     */
    const deleteDay = useCallback(
        async (dayId) => {
            const didDelete = await mutate({
                apply: (previous) => removeDay(previous, dayId),
                send: () => api.delete(`/calendar/days/${dayId}`),
            });

            if (didDelete) onDayDeleted?.(dayId);

            return didDelete;
        },
        [mutate, onDayDeleted]
    );

    /** Dropping a booking on the pool's remove overlay. */
    const unschedule = useCallback(
        (todoId) =>
            mutate({
                apply: (previous) => unscheduleItem(previous, todoId),
                send: () => api.delete(`/calendar/items/${todoId}`),
            }),
        [mutate]
    );

    /**
     * The bubble. The item stays exactly where it is and is struck through — the
     * point of ticking something on the calendar is to see what the day looked
     * like, which moving it would destroy.
     *
     * The same `PATCH /api/todos/:id` the project page sends, so a to-do
     * completed here is completed everywhere.
     *
     * A completion the server took also moves the frontier: the sequence this
     * to-do belonged to now offers its next step, so the pool is asked to read
     * itself again (design section “The bubble”). Only on success — a rolled-back
     * completion changed nothing to refill from.
     */
    const completeTodo = useCallback(
        async (todoId) => {
            const didComplete = await mutate({
                apply: (previous) => ({
                    ...previous,
                    items: previous.items.map((item) =>
                        item.todoId === todoId ? { ...item, status: TODO_COMPLETE } : item
                    ),
                }),
                send: () => api.patch(`/todos/${todoId}`, { status: TODO_COMPLETE }),
            });

            if (didComplete) await onTodoCompleted?.();
        },
        [mutate, onTodoCompleted]
    );

    const dismissActionError = useCallback(() => dispatch(actionErrorCleared()), [dispatch]);

    /** Whether a day is still waiting for the server to give it a real id. */
    const isUnsavedDay = useCallback((dayId) => isTempId(dayId), []);

    // Whether *any* day is, which is a different question: it asks whether the
    // strip as a whole can be diffed, and the answer gates the gestures.
    //
    // `toBulkRequest` refuses an unreconciled `previous` (see `lib/calendarRequest`
    // and commit `6a017dd` for why refusing beats scoping the count), and `commit`
    // runs straight out of a drop handler — where a throw is outside any error
    // boundary, per `lib/schedule`'s header, so the drag would die with nothing on
    // screen saying why. The page disables the + and the drop targets while this
    // is true, the way `DayColumn` already hides the × on an unsaved day, and the
    // throw stays underneath as the backstop for a wiring mistake. Narrowing what
    // can reach an assertion rather than catching it is the same bargain the
    // gestures make.
    const hasUnsavedDay = state.days.some((day) => isTempId(day.id));

    // Memoised because this object *is* the context value: `CalendarPage` hands
    // it straight to `CalendarProvider`, and a fresh literal every render would
    // change the context's identity on every render of the page — including the
    // ones the independently-loaded pool causes, which the strip has no stake in.
    // Every consumer would then re-render whether or not the schedule moved,
    // throwing away the per-row identity `lib/schedule` and the reducer go to
    // some trouble to preserve.
    //
    // Every callback below is already `useCallback`'d over stable deps, so the
    // only thing that genuinely varies is `state` — and `hasUnsavedDay`, which is
    // derived from it and listed because it is read here, not because it can move
    // independently.
    return useMemo(
        () => ({
            state,
            reload: load,
            commit,
            addDay,
            deleteDay,
            unschedule,
            completeTodo,
            dismissActionError,
            isUnsavedDay,
            hasUnsavedDay,
        }),
        [
            state,
            load,
            commit,
            addDay,
            deleteDay,
            unschedule,
            completeTodo,
            dismissActionError,
            isUnsavedDay,
            hasUnsavedDay,
        ]
    );
};

export default useCalendar;
