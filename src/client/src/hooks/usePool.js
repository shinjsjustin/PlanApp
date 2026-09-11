import { useCallback, useEffect, useState } from 'react';

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

    /**
     * Reads the frontier and installs it, saying nothing about how the panel
     * should look while that happens. Both outcomes set a terminal status of
     * their own, so this is the whole of a load bar its opening move — the same
     * split `useCalendar` makes between `fetchCalendar` and `load`, and for the
     * same reason: a refetch behind rows that are already on screen must not
     * unmount them.
     *
     * A failure still lands on the error status, which is the honest answer for
     * both callers: what is on screen has stopped being what the server says,
     * and the retry is how it comes back. It is the pool's own panel either way,
     * so the calendar beside it is untouched.
     */
    const fetchPool = useCallback(async () => {
        try {
            setProjects(toPoolProjects(await api.get('/projects')));
            setLoadError('');
            setStatus(POOL_STATUS.ready);
        } catch (err) {
            setLoadError(messageOf(err));
            setStatus(POOL_STATUS.error);
        }
    }, []);

    /**
     * The opening read, and the retry button's. This is the one that empties the
     * panel to its loading state first, because on this path there is either
     * nothing on screen yet or nothing on screen worth keeping.
     */
    const load = useCallback(async () => {
        setStatus(POOL_STATUS.loading);
        setLoadError('');

        await fetchPool();
    }, [fetchPool]);

    useEffect(() => {
        load();
    }, [load]);

    return { projects, status, loadError, reload: load, refresh: fetchPool };
};

export default usePool;
