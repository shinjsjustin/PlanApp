import { act, renderHook, waitFor } from '@testing-library/react';

import usePool, { POOL_STATUS } from './usePool';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
        },
    };
});

const FUTURE = '2999-05-02';

const todoRow = (id, text, overrides = {}) => ({
    id,
    text,
    status: 'incomplete',
    position: 0,
    visitMinutes: null,
    ...overrides,
});

const datedSequence = (id, todos, overrides = {}) => ({
    id,
    title: 'Session handling',
    date: FUTURE,
    owner: 'justin',
    description: null,
    isBlocked: false,
    layerId: 4,
    visitMinutes: null,
    todos,
    ...overrides,
});

const projects = [
    {
        id: 2,
        title: 'Auth rewrite',
        datedSequences: [datedSequence(9, [todoRow(7, 'Wire up the token refresh')])],
    },
    { id: 3, title: 'Empty project', datedSequences: [] },
];

const firstTodoId = (result) => result.current.days[0].sequences[0].todos[0].todoId;

/** Renders the hook with the pool already loaded. */
const renderReady = async () => {
    api.get.mockResolvedValue(projects);

    const view = renderHook(() => usePool());
    await waitFor(() => expect(view.result.current.status).toBe(POOL_STATUS.ready));

    return view;
};

/** One project with one dated sequence holding exactly one to-do, for telling reads apart. */
const pinnedProjectsOf = (todoId, text, overrides) => [
    {
        id: 2,
        title: 'Auth rewrite',
        datedSequences: [datedSequence(9, [todoRow(todoId, text, overrides)])],
    },
];

/** Another selection, for distinguishing concurrent reads. */
const updatedProjects = pinnedProjectsOf(8, 'Rotate the signing keys');

const OLDER_FAILED = 'The older read could not reach the server.';
const NEWER_FAILED = 'The newer read could not reach the server.';

const LANDS_OLD = { projects: updatedProjects };
const LANDS_NEW = { projects: pinnedProjectsOf(9, 'Expire the old sessions') };

/**
 * Two reads in the air, settling in either order with either ending each. One
 * rule decides the rows, the status and the notice together, so this matrix is
 * that rule's specification: whichever read settles last among the newest ones
 * speaks, and an answer a newer read has already overtaken is silence — it
 * cannot install its rows, set a status, or raise or clear the notice.
 *
 * The pool starts ready on to-do 7, so an unchanged `todoId` of 7 means neither
 * read installed anything.
 */
const RACE_CASES = [
    {
        name: 'both land, oldest answering first',
        settleOrder: ['older', 'newer'],
        older: LANDS_OLD,
        newer: LANDS_NEW,
        expected: { todoId: 9, refreshError: '' },
    },
    {
        name: 'both land, newest answering first',
        settleOrder: ['newer', 'older'],
        older: LANDS_OLD,
        newer: LANDS_NEW,
        expected: { todoId: 9, refreshError: '' },
    },
    {
        name: 'the older lands and the newer fails, oldest answering first',
        settleOrder: ['older', 'newer'],
        older: LANDS_OLD,
        newer: { error: NEWER_FAILED },
        expected: { todoId: 8, refreshError: NEWER_FAILED },
    },
    {
        name: 'the older lands and the newer fails, newest answering first',
        settleOrder: ['newer', 'older'],
        older: LANDS_OLD,
        newer: { error: NEWER_FAILED },
        expected: { todoId: 7, refreshError: NEWER_FAILED },
    },
    {
        name: 'the older fails and the newer lands, oldest answering first',
        settleOrder: ['older', 'newer'],
        older: { error: OLDER_FAILED },
        newer: LANDS_NEW,
        expected: { todoId: 9, refreshError: '' },
    },
    {
        name: 'the older fails and the newer lands, newest answering first',
        settleOrder: ['newer', 'older'],
        older: { error: OLDER_FAILED },
        newer: LANDS_NEW,
        expected: { todoId: 9, refreshError: '' },
    },
    {
        name: 'both fail, oldest answering first',
        settleOrder: ['older', 'newer'],
        older: { error: OLDER_FAILED },
        newer: { error: NEWER_FAILED },
        expected: { todoId: 7, refreshError: NEWER_FAILED },
    },
    {
        name: 'both fail, newest answering first',
        settleOrder: ['newer', 'older'],
        older: { error: OLDER_FAILED },
        newer: { error: NEWER_FAILED },
        expected: { todoId: 7, refreshError: NEWER_FAILED },
    },
];

/** A promise the test settles by hand, so mid-flight state can be asserted. */
const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

/** Settles one of the pending reads with the ending the case calls for. */
const settleWith = async (pending, outcome) => {
    await act(async () => {
        if (outcome.error) {
            pending.reject(new Error(outcome.error));
            await pending.promise.catch(() => {});
        } else {
            pending.resolve(outcome.projects);
            await pending.promise;
        }
    });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('usePool', () => {
    test('reads /projects with no query string and groups sequences into a day', async () => {
        // Arrange + Act
        const { result } = await renderReady();

        // Assert
        expect(api.get).toHaveBeenCalledWith('/projects');
        expect(result.current.days).toHaveLength(1);
        expect(result.current.days[0].date).toBe(FUTURE);
        expect(result.current.days[0].sequences[0].todos).toEqual([
            {
                id: 7,
                todoId: 7,
                text: 'Wire up the token refresh',
                status: 'incomplete',
                position: 0,
                projectId: 2,
                projectTitle: 'Auth rewrite',
                sequenceId: 9,
                sequenceTitle: 'Session handling',
            },
        ]);
    });

    test('keeps complete and blocked to-dos in their sequence, in order', async () => {
        api.get.mockResolvedValue([{
            id: 6,
            title: 'Every kind',
            datedSequences: [datedSequence(9, [
                todoRow(20, 'Done', { status: 'complete' }),
                todoRow(2, 'Waiting', { status: 'blocked' }),
                todoRow(3, 'Open'),
            ])],
        }]);

        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        expect(result.current.days[0].sequences[0].todos.map((todo) => [todo.todoId, todo.status]))
            .toEqual([[20, 'complete'], [2, 'blocked'], [3, 'incomplete']]);
    });

    test('maps frozen payloads without mutating the server response', async () => {
        const row = Object.freeze(todoRow(7, 'Work'));
        const source = Object.freeze([Object.freeze({
            id: 2,
            title: 'Auth rewrite',
            datedSequences: Object.freeze([Object.freeze(datedSequence(9, Object.freeze([row])))]),
        })]);
        api.get.mockResolvedValue(source);

        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));

        expect(result.current.days[0].sequences[0].todos[0]).not.toBe(row);
        expect(row).toEqual(todoRow(7, 'Work'));
    });

    test('a project with no dated sequences adds no day', async () => {
        const { result } = await renderReady();

        expect(result.current.days.map((day) => day.date)).toEqual([FUTURE]);
    });

    test('reports a failed load without emptying the panel silently', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('Could not reach the server.'));

        // Act
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));

        // Assert
        expect(result.current.loadError).toBe('Could not reach the server.');
        expect(result.current.days).toEqual([]);
    });

    test('starts in the loading status before the request settles', () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        const { result } = renderHook(() => usePool());

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.loading);
        expect(result.current.days).toEqual([]);
    });

    test('reload re-fetches, clearing the prior error along with the rows it left behind', async () => {
        // Arrange
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));

        // Act
        api.get.mockResolvedValueOnce(projects);
        await act(() => result.current.reload());

        // Assert
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));
        expect(result.current.days).toHaveLength(1);
        expect(result.current.loadError).toBe('');
    });

    test('refresh re-reads behind the rows already on screen', async () => {
        // Arrange — a completed booking refills the pool, and that must not
        // unmount the rows: dropping to loading would collapse every open
        // accordion card over a read the user did not ask to wait for.
        const { promise, resolve } = deferred();
        const { result } = await renderReady();
        api.get.mockReturnValueOnce(promise);

        // Act
        act(() => {
            result.current.refresh();
        });

        // Assert — still ready, still listing what it listed, mid-flight.
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(firstTodoId(result)).toBe(7);

        // Act — and the answer replaces the rows without a reload.
        await act(async () => {
            resolve(pinnedProjectsOf(7, 'Wire up the token refresh', { status: 'complete' }));
            await promise;
        });

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(result.current.days[0].sequences[0].todos[0]).toMatchObject({ todoId: 7, status: 'complete' });
    });

    test('a failed refresh says so without taking the rows down with it', async () => {
        // Arrange — nobody asked to wait for this read, so what is on screen is
        // still the last thing the server actually said.
        const { result } = await renderReady();
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));

        // Act
        await act(() => result.current.refresh());

        // Assert
        expect(result.current.refreshError).toBe('Could not reach the server.');
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(firstTodoId(result)).toBe(7);
        expect(result.current.loadError).toBe('');
    });

    test('a refresh that lands clears the message the last one left', async () => {
        // Arrange
        const { result } = await renderReady();
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));
        await act(() => result.current.refresh());
        expect(result.current.refreshError).toBe('Could not reach the server.');

        // Act
        api.get.mockResolvedValueOnce(projects);
        await act(() => result.current.refresh());

        // Assert
        expect(result.current.refreshError).toBe('');
    });

    test('the newest read wins when two answer out of order', async () => {
        // Arrange — two bookings ticked in quick succession put two reads in the
        // air. The second was asked after the first write committed, so it is
        // the one that saw the truth; the first must not overwrite it when it
        // straggles in.
        const stale = deferred();
        const fresh = deferred();
        const { result } = await renderReady();
        api.get.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);

        // Act
        act(() => {
            result.current.refresh();
            result.current.refresh();
        });

        await act(async () => {
            fresh.resolve(updatedProjects);
            await fresh.promise;
        });
        expect(firstTodoId(result)).toBe(8);

        await act(async () => {
            stale.resolve(projects);
            await stale.promise;
        });

        // Assert
        expect(firstTodoId(result)).toBe(8);
    });

    test('an overtaken read that fails is not reported over the answer that won', async () => {
        // Arrange — the straggler has nothing to say either way.
        const stale = deferred();
        const { result } = await renderReady();
        api.get.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(projects);

        // Act
        await act(async () => {
            result.current.refresh();
            await result.current.refresh();
        });

        await act(async () => {
            stale.reject(new Error('Could not reach the server.'));
            await stale.promise.catch(() => {});
        });

        // Assert
        expect(result.current.refreshError).toBe('');
        expect(result.current.status).toBe(POOL_STATUS.ready);
    });

    RACE_CASES.forEach(({ name, settleOrder, older, newer, expected }) => {
        test(`two overlapping reads: ${name}`, async () => {
            // Arrange — ticking two bookings in quick succession puts two reads
            // in the air, and either can answer first.
            const reads = { older: deferred(), newer: deferred() };
            const { result } = await renderReady();
            api.get
                .mockReturnValueOnce(reads.older.promise)
                .mockReturnValueOnce(reads.newer.promise);

            act(() => {
                result.current.refresh();
                result.current.refresh();
            });

            // Act
            for (const which of settleOrder) {
                await settleWith(reads[which], which === 'older' ? older : newer);
            }

            // Assert
            expect(firstTodoId(result)).toBe(expected.todoId);
            expect(result.current.refreshError).toBe(expected.refreshError);
            expect(result.current.status).toBe(POOL_STATUS.ready);
        });
    });

    test('a load answered behind a failing refresh still settles the panel', async () => {
        // Arrange — the calendar beside the pool stays usable while the pool is
        // still loading, so a tick can put a second read in the air before the
        // first is back. `loading` is a state the user cannot leave, so the read
        // that started it has to end it however the race turns out.
        const opening = deferred();
        const refill = deferred();
        api.get.mockReturnValueOnce(opening.promise).mockReturnValueOnce(refill.promise);
        const { result } = renderHook(() => usePool());
        expect(result.current.status).toBe(POOL_STATUS.loading);

        // Act
        act(() => {
            result.current.refresh();
        });

        await act(async () => {
            opening.resolve(projects);
            await opening.promise;
        });
        await act(async () => {
            refill.reject(new Error('Could not reach the server.'));
            await refill.promise.catch(() => {});
        });

        // Assert — the only answer anybody got is the one on screen, and the
        // refill says what went wrong from above it.
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(firstTodoId(result)).toBe(7);
        expect(result.current.refreshError).toBe('Could not reach the server.');
    });

    test('a load answered behind a refresh that won settles on the newer rows', async () => {
        // Arrange — same race, the other outcome: the refill was asked after the
        // completion committed, so its answer is the true one.
        const opening = deferred();
        const refill = deferred();
        api.get.mockReturnValueOnce(opening.promise).mockReturnValueOnce(refill.promise);
        const { result } = renderHook(() => usePool());

        // Act
        act(() => {
            result.current.refresh();
        });

        await act(async () => {
            refill.resolve(updatedProjects);
            await refill.promise;
        });
        await act(async () => {
            opening.resolve(projects);
            await opening.promise;
        });

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(firstTodoId(result)).toBe(8);
        expect(result.current.refreshError).toBe('');
    });

    test('a first read that fails behind a refresh still reaches the retry', async () => {
        // Arrange — neither read landed, so there is nothing on screen and the
        // panel owes the user a way to ask again.
        const opening = deferred();
        const refill = deferred();
        api.get.mockReturnValueOnce(opening.promise).mockReturnValueOnce(refill.promise);
        const { result } = renderHook(() => usePool());

        // Act
        act(() => {
            result.current.refresh();
        });

        await act(async () => {
            refill.reject(new Error('Still offline.'));
            await refill.promise.catch(() => {});
        });
        await act(async () => {
            opening.reject(new Error('Could not reach the server.'));
            await opening.promise.catch(() => {});
        });

        // Assert — the newest read to settle is the one that speaks, and the
        // first read's later failure is not reported over it.
        expect(result.current.status).toBe(POOL_STATUS.error);
        expect(result.current.loadError).toBe('Still offline.');

        // Act — and the retry still works from there.
        api.get.mockResolvedValueOnce(projects);
        await act(() => result.current.reload());

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.ready);
        expect(firstTodoId(result)).toBe(7);
        expect(result.current.refreshError).toBe('');
    });

    test('reload passes back through loading, since it only ever runs from the error screen', async () => {
        // Arrange — the retry button is the only thing that calls `reload`
        // today, and it is only reachable from the error screen, which has no
        // rows on it to preserve while the retry is in flight.
        const { promise, resolve } = deferred();
        api.get.mockRejectedValueOnce(new Error('Could not reach the server.'));
        const { result } = renderHook(() => usePool());
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.error));
        api.get.mockReturnValueOnce(promise);

        // Act
        act(() => {
            result.current.reload();
        });

        // Assert
        expect(result.current.status).toBe(POOL_STATUS.loading);

        await act(async () => {
            resolve(projects);
            await promise;
        });
        await waitFor(() => expect(result.current.status).toBe(POOL_STATUS.ready));
    });
});
