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

    // Numbers the reads in the order they were issued. Reachable because
    // `refresh` is: ticking two bookings in quick succession puts two reads in
    // the air, and the older one can answer last.
    const requestRef = useRef(0);

    // The id of the read whose rows are on screen. Whichever read was asked last
    // saw the most writes, so it is the one whose answer is true — but only once
    // it has actually answered. A read is superseded by a newer one that
    // *landed*, never by one that was merely issued: a newer read that fails, or
    // that has not come back yet, has said nothing, and discarding an answer in
    // favour of that is discarding the only answer there is.
    //
    // The distinction is what keeps this to one job. Deciding whose rows install
    // is all it decides; whether the caller that asked gets to settle the panel
    // is `load`'s business, below, and the two must not be the same question or
    // an overtaken load leaves the panel loading forever.
    const installedRef = useRef(0);

    /**
     * Reads the frontier and installs it, saying nothing about how the panel
     * should look while that happens — the same split `useCalendar` makes
     * between `fetchCalendar` and `load`, and for the same reason: a refetch
     * behind rows that are already on screen must not unmount them.
     *
     * Throws on failure rather than deciding what a failure means, because that
     * differs by caller: a first read has nothing on screen to lose, a refresh
     * has everything. A read a newer one has already answered says nothing
     * either way — its rows are stale, and its failure is a complaint about a
     * question somebody else has since answered.
     */
    const fetchPool = useCallback(async () => {
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;

        try {
            const next = toPoolProjects(await api.get('/projects'));

            if (requestId < installedRef.current) return;

            installedRef.current = requestId;
            setProjects(next);
            setLoadError('');
            setRefreshError('');
            setStatus(POOL_STATUS.ready);
        } catch (err) {
            if (requestId < installedRef.current) return;

            throw err;
        }
    }, []);

    /**
     * The opening read, and the retry button's. This is the one that empties the
     * panel to its loading state first, because on this path there is either
     * nothing on screen yet or nothing on screen worth keeping — so a failure
     * here is the whole panel's answer, the retry screen included.
     *
     * It settles the panel either way, and that is the point: `loading` is a
     * state the user cannot leave, so nothing that starts it may end without
     * ending it. Resolving without installing means a newer read already put its
     * rows on screen, so `ready` is the truth in that case as much as in the
     * ordinary one.
     */
    const load = useCallback(async () => {
        setStatus(POOL_STATUS.loading);
        setLoadError('');
        setRefreshError('');

        try {
            await fetchPool();
            setStatus(POOL_STATUS.ready);
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
