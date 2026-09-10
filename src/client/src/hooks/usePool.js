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
 * nothing that can be picked up — empty, or with every outstanding to-do
 * blocked. There is nothing to schedule, so it is left out of both the list and
 * the count.
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
