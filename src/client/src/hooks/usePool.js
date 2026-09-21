import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// The right panel's pinned work, including completed pins for review.
//
// There is no calendar-specific pool endpoint. `GET /api/projects` already
// carries each project's pinned to-dos, which are the same explicit choices the
// projects home page shows. Every pin stays visible regardless of lifecycle
// status or whether it belongs to a sequence.
//
// Loaded separately from the calendar, and failing separately: a calendar you
// cannot schedule into is still worth reading, and a pool you cannot drag from
// is still worth seeing (design section 10). There is no mutation here —
// `usePool` only reads, so it carries none of `useCalendar`'s optimistic-apply
// machinery.

export const POOL_STATUS = { loading: 'loading', ready: 'ready', error: 'error' };

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const messageOf = (error) => error?.message || GENERIC_FAILURE;

/** A project with no pins is kept so its card can say so explicitly. */
const toPoolProjects = (projects) =>
    projects.map((project) => ({
        id: project.id,
        title: project.title,
        todos: project.pinnedTodos.map((todo) => ({
            todoId: todo.id,
            text: todo.text,
            status: todo.status,
            isPinned: todo.isPinned,
            projectId: project.id,
            projectTitle: project.title,
            sequenceId: todo.sequenceId,
            sequenceTitle: todo.sequenceTitle,
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

/** Reads pinned projects, turning either ending into a value rather than a throw. */
const readPinnedProjects = async () => {
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

        const outcome = await readPinnedProjects();

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
    // and its pin changed status. It is the bare read: what a failure means is
    // `settledFrom`'s decision, taken from what is on screen rather than from
    // which caller asked.
    return { ...pool, reload: load, refresh: read };
};

export default usePool;
