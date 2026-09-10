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
     * Every call — the mount and the manual "Try again" alike — resets to
     * loading rather than refetching quietly behind the rows already on
     * screen. That is deliberate for both callers this hook has today: the
     * mount has nothing to preserve, and `reload` is only ever wired to the
     * retry button on the error screen, which has nothing rendered either.
     * `useCalendar` splits its `load` from a silent `fetchCalendar` because a
     * mutation there can resync a schedule that is still on screen; `usePool`
     * has no such caller yet, and does not need the split until something
     * calls `reload` from a `ready` pool.
     */
    const load = useCallback(async () => {
        setStatus(POOL_STATUS.loading);
        setLoadError('');

        try {
            setProjects(toPoolProjects(await api.get('/projects')));
            setStatus(POOL_STATUS.ready);
        } catch (err) {
            setLoadError(messageOf(err));
            setStatus(POOL_STATUS.error);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { projects, status, loadError, reload: load };
};

export default usePool;
