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

const usePool = () => {
    const [projects, setProjects] = useState([]);
    const [status, setStatus] = useState(POOL_STATUS.loading);
    const [loadError, setLoadError] = useState('');
    const [refreshError, setRefreshError] = useState('');

    // Numbers the reads in the order they were *issued*, so a read knows whether
    // it is still the newest one outstanding by the time it answers.
    //
    // The same defence `useCalendar` mounts with `loadGenerationRef`, shaped for
    // the question this hook has to ask. There the counter tracks loads that
    // landed, because what a mutation needs to know is whether the state it is
    // answering about has already been replaced. Here two reads race each other
    // rather than a read racing a write: whichever was asked last saw the most
    // writes, so it is the one whose answer is true, whichever order they come
    // back in. Counting landed reads instead would let an older read that
    // happened to answer first silence the newer one behind it.
    //
    // Reachable because `refresh` is: ticking two bookings in quick succession
    // puts two reads in the air, and the older one can answer last.
    const requestRef = useRef(0);

    /**
     * Reads the frontier and installs it, saying nothing about how the panel
     * should look while that happens — the same split `useCalendar` makes
     * between `fetchCalendar` and `load`, and for the same reason: a refetch
     * behind rows that are already on screen must not unmount them.
     *
     * Throws on failure rather than deciding what a failure means, because that
     * differs by caller: a first read has nothing on screen to lose, a refresh
     * has everything. An overtaken read says nothing either way — it is neither
     * an answer nor a failure worth reporting, because a newer read is already
     * speaking for the same question.
     */
    const fetchPool = useCallback(async () => {
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;

        try {
            const next = toPoolProjects(await api.get('/projects'));

            if (requestRef.current !== requestId) return;

            setProjects(next);
            setLoadError('');
            setRefreshError('');
            setStatus(POOL_STATUS.ready);
        } catch (err) {
            if (requestRef.current !== requestId) return;

            throw err;
        }
    }, []);

    /**
     * The opening read, and the retry button's. This is the one that empties the
     * panel to its loading state first, because on this path there is either
     * nothing on screen yet or nothing on screen worth keeping — so a failure
     * here is the whole panel's answer, the retry screen included.
     */
    const load = useCallback(async () => {
        setStatus(POOL_STATUS.loading);
        setLoadError('');
        setRefreshError('');

        try {
            await fetchPool();
        } catch (err) {
            setLoadError(messageOf(err));
            setStatus(POOL_STATUS.error);
        }
    }, [fetchPool]);

    /**
     * The quiet re-read behind rows that are already on screen, after work was
     * ticked off and the frontier moved on.
     *
     * A failure here is reported without being acted on: the rows stay, every
     * open card stays open, and the panel says what went wrong rather than
     * replacing itself with a retry screen over a read nobody asked to wait for.
     * What is on screen is the last thing the server actually said, which is
     * worth more than a blank panel — and the next completion reads again.
     */
    const refresh = useCallback(async () => {
        try {
            await fetchPool();
        } catch (err) {
            setRefreshError(messageOf(err));
        }
    }, [fetchPool]);

    useEffect(() => {
        load();
    }, [load]);

    return { projects, status, loadError, refreshError, reload: load, refresh };
};

export default usePool;
