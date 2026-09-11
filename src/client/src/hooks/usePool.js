import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// The right panel's supply of schedulable work.
//
// There is no calendar endpoint behind this. `GET /api/projects` already answers
// with every project's ready frontier and the next to-do in each ready sequence,
// which is exactly what the pool is (design decision 3) — the same response the
// projects home page renders its cards from.
//
// One to-do per ready sequence, not every open to-do in it. That keeps the
// calendar honest to the app's central idea: the frontier is what you may start,
// and within a sequence that is one thing. It also means the pool refills as
// items are ticked off, which is what makes the completion bubble part of the
// planning loop rather than a dead end.
//
// Loaded separately from the calendar, and failing separately: a calendar you
// cannot schedule into is still worth reading, and a pool you cannot drag from
// is still worth seeing (design section 10). There is no mutation here —
// `usePool` only reads, so it carries none of `useCalendar`'s optimistic-apply
// machinery.

export const POOL_STATUS = { loading: 'loading', ready: 'ready', error: 'error' };

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/**
 * A frontier entry with no `nextTodo` is a sequence that is ready but has
 * nothing that can be picked up. That covers two entries the server tells
 * apart with `isStalled`: one whose outstanding to-dos are all blocked
 * (`isStalled: true`), and one that is ready but holds no to-dos at all
 * (`isStalled: false` — `readyFrontier` still lists an empty sequence, since
 * incomplete is not the same as finished). Both have nothing to schedule, so
 * the filter below reads `entry.nextTodo` rather than `!entry.isStalled`: the
 * latter lets the empty-sequence entry through, and the map after it
 * dereferences `nextTodo.id` unconditionally, so that would throw instead of
 * skipping it.
 *
 * A project with no startable work at all is kept, because the panel still has
 * to show its name and a count of zero rather than silently vanishing.
 */
const toPoolProjects = (projects) =>
    projects.map((project) => ({
        id: project.id,
        title: project.title,
        todos: project.frontier
            .filter((entry) => entry.nextTodo)
            .map((entry) => ({
                todoId: entry.nextTodo.id,
                text: entry.nextTodo.text,
                projectId: project.id,
                projectTitle: project.title,
                sequenceId: entry.sequenceId,
                sequenceTitle: entry.sequenceTitle,
            })),
    }));

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
            projects: outcome.projects,
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
    projects: [],
    loadError: '',
    refreshError: '',
};

/** Reads the frontier, turning either ending into a value rather than a throw. */
const readFrontier = async () => {
    try {
        return { projects: toPoolProjects(await api.get('/projects')) };
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

        const outcome = await readFrontier();

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
    // and the frontier moved on. It is the bare read: what a failure means is
    // `settledFrom`'s decision, taken from what is on screen rather than from
    // which caller asked.
    return { ...pool, reload: load, refresh: read };
};

export default usePool;
