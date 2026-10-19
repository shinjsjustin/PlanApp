import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { todayKey } from '../lib/dates';

// The right panel's dated sequences, grouped by day.
//
// There is no calendar-specific pool endpoint. `GET /api/projects` already
// carries each project's `datedSequences`, so the pool is one request. Only
// Justin's sequences dated today or later are listed: Bourne's belong to
// Bourne, and a day that has passed is no longer something to schedule.
//
// Loaded separately from the calendar, and failing separately: a calendar you
// cannot schedule into is still worth reading, and a pool you cannot drag from
// is still worth seeing (design section 10). There is no mutation here —
// `usePool` only reads, so it carries none of `useCalendar`'s optimistic-apply
// machinery.

export const POOL_STATUS = { loading: 'loading', ready: 'ready', error: 'error' };

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/** A visit length rides along only when the server sent one. */
const visitMinutesOf = (item) =>
    typeof item.visitMinutes === 'number' ? { visitMinutes: item.visitMinutes } : {};

const OWNER = 'justin';

const toPoolTodo = (todo, project, sequence) => ({
    id: todo.id,
    todoId: todo.id,
    text: todo.text,
    status: todo.status,
    position: todo.position,
    projectId: project.id,
    projectTitle: project.title,
    sequenceId: sequence.id,
    sequenceTitle: sequence.title,
    ...visitMinutesOf(todo),
});

const toPoolSequence = (sequence, project) => ({
    kind: 'sequence',
    sequenceId: sequence.id,
    todoId: null,
    text: sequence.title,
    title: sequence.title,
    description: sequence.description,
    isBlocked: sequence.isBlocked,
    layerId: sequence.layerId,
    date: sequence.date,
    projectId: project.id,
    projectTitle: project.title,
    ...visitMinutesOf(sequence),
    todos: sequence.todos.map((todo) => toPoolTodo(todo, project, sequence)),
});

/**
 * Justin's sequences dated today or later, grouped by date ascending. Within a
 * date they keep the server's order: project order, then each project's own.
 * 'YYYY-MM-DD' keys compare correctly as strings.
 */
const toPoolDays = (projects) => {
    const today = todayKey();
    const byDate = new Map();

    projects.forEach((project) => {
        project.datedSequences
            .filter((sequence) => sequence.owner === OWNER && sequence.date >= today)
            .forEach((sequence) => {
                const sequences = byDate.get(sequence.date) ?? [];
                byDate.set(sequence.date, [...sequences, toPoolSequence(sequence, project)]);
            });
    });

    return [...byDate.keys()]
        .sort()
        .map((date) => ({ date, sequences: byDate.get(date) }));
};

/**
 * The panel's whole read-derived state, written in one place and only ever from
 * the outcome of a read.
 *
 * INVARIANT: the newest read that has SETTLED is the only thing that may write
 * any of this — the rows, the status and the notice alike. A read is numbered
 * when it is issued and the counter advances the moment one settles, whether it
 * answered or failed, so a read that answers after a newer one has already
 * settled says nothing at all: it cannot install its rows, cannot set a status,
 * and cannot raise or clear the notice.
 *
 * That is one rule for three pieces of state on purpose. Deciding the rows by
 * one test, the status by another and the notice by a third is what left an
 * older read able to wipe a newer read's failure off the screen, and it is what
 * makes every new ordering a new defect. Change the rule here, deliberately,
 * rather than adding a condition to one of the writes below.
 *
 * Two reads are in the air whenever bookings are ticked in quick succession, so
 * the orderings are reachable rather than theoretical.
 */
const settledFrom = (current, outcome) => {
    if (!outcome.error) {
        return {
            status: POOL_STATUS.ready,
            days: outcome.days,
            loadError: '',
            refreshError: '',
        };
    }

    // Rows on screen are the last thing the server actually said, and they are
    // worth more than a blank panel: the failure is reported from above them
    // rather than in place of them, so no open card is folded shut over a read
    // nobody asked to wait for. With nothing on screen there is nothing to
    // preserve, so the failure is the panel's whole answer, retry included.
    return current.status === POOL_STATUS.ready
        ? { ...current, refreshError: outcome.error }
        : { ...current, status: POOL_STATUS.error, loadError: outcome.error, refreshError: '' };
};

const INITIAL_POOL = {
    status: POOL_STATUS.loading,
    days: [],
    loadError: '',
    refreshError: '',
};

/** Reads the dated sequences, turning either ending into a value rather than a throw. */
const readDays = async () => {
    try {
        return { days: toPoolDays(await api.get('/projects')) };
    } catch (err) {
        return { error: messageOf(err) };
    }
};

const usePool = () => {
    const [pool, setPool] = useState(INITIAL_POOL);

    // Numbers the reads as they are issued, and remembers the newest to settle.
    // See `settledFrom` for what that buys and why both callers go through it.
    const requestRef = useRef(0);
    const settledRef = useRef(0);

    const read = useCallback(async () => {
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;

        const outcome = await readDays();

        if (requestId < settledRef.current) return;

        settledRef.current = requestId;
        setPool((current) => settledFrom(current, outcome));
    }, []);

    /**
     * The opening read, and the retry button's. Only this one empties the panel
     * to its loading state first, because on this path there is either nothing
     * on screen yet or nothing on screen worth keeping. Everything after that
     * opening move is the same read every caller makes.
     */
    const load = useCallback(async () => {
        setPool((current) => ({
            ...current,
            status: POOL_STATUS.loading,
            loadError: '',
            refreshError: '',
        }));

        await read();
    }, [read]);

    useEffect(() => {
        load();
    }, [load]);

    // The quiet re-read behind rows already on screen, after work was ticked off
    // and its status changed. It is the bare read: what a failure means is
    // `settledFrom`'s decision, taken from what is on screen rather than from
    // which caller asked.
    return { ...pool, reload: load, refresh: read };
};

export default usePool;
