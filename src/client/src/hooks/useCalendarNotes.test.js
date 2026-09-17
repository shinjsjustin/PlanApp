import { act, renderHook, waitFor } from '@testing-library/react';

import useCalendarNotes from './useCalendarNotes';
import { NOTES_STATUS } from '../state/notesReducer';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            delete: jest.fn(),
        },
    };
});

const note = (id, overrides = {}) => ({
    id,
    dayId: 1,
    text: `note ${id}`,
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

const draft = (overrides = {}) => ({
    dayId: 1,
    text: 'on call',
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

/** A promise the test settles by hand, so mid-flight state can be asserted. */
const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

/** Renders the hook with the notes already loaded. */
const renderReady = async (notes = []) => {
    api.get.mockResolvedValue({ notes });

    const view = renderHook(() => useCalendarNotes());
    await waitFor(() => expect(view.result.current.state.status).toBe(NOTES_STATUS.ready));

    return view;
};

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    // Only the `console.error` spies below; the `api` doubles are module mocks,
    // which this does not touch.
    jest.restoreAllMocks();
});

describe('loading', () => {
    test('reads the notes on mount', async () => {
        // Act
        const { result } = await renderReady([note(1)]);

        // Assert
        expect(api.get).toHaveBeenCalledWith('/calendar/notes');
        expect(result.current.state.notes).toEqual([note(1)]);
    });

    test('reports a failed load without throwing', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('the server is down'));

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toBe('the server is down');
    });

    test('says it is loading until the notes land', async () => {
        // Arrange
        const pending = deferred();
        api.get.mockReturnValue(pending.promise);

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — the skeleton, not an empty plane pretending to be ready.
        expect(result.current.state.status).toBe(NOTES_STATUS.loading);

        // Act — the notes land
        await act(async () => {
            pending.resolve({ notes: [note(1)] });
            await pending.promise;
        });

        // Assert
        expect(result.current.state.status).toBe(NOTES_STATUS.ready);
    });

    test('reports a malformed note from the server rather than ingesting it', async () => {
        // Arrange — a note the reducer's ingest guard refuses.
        api.get.mockResolvedValue({ notes: [note(1, { durationMinutes: 0 })] });

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — the refusal lands on the retry screen rather than throwing
        // during a render, where the page's error boundary would take the plane.
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toMatch(/duration/);
        expect(result.current.state.notes).toEqual([]);
    });

    test.each([
        ['a body with no notes in it', {}],
        ['a body that is not an object at all', null],
        ['a notes key that is not a list', { notes: 'nope' }],
    ])('reports %s rather than reading through it', async (_label, payload) => {
        // Arrange — `api` guarantees a parsed body and nothing about its shape.
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        api.get.mockResolvedValue(payload);

        // Act
        const { result } = renderHook(() => useCalendarNotes());

        // Assert — a sentence about the server rather than `undefined.forEach`
        // beside the retry button …
        await waitFor(() => expect(result.current.state.status).toBe(NOTES_STATUS.error));
        expect(result.current.state.loadError).toMatch(/unreadable/);
        expect(result.current.state.notes).toEqual([]);
        // … and the body itself where a developer will find it.
        expect(logged).toHaveBeenCalledWith(expect.any(String), payload);
    });

    test('reload asks again', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.get.mockResolvedValue({ notes: [note(1)] });

        // Act
        await act(() => result.current.reload());

        // Assert
        expect(result.current.state.notes).toEqual([note(1)]);
    });
});

describe('createNote', () => {
    test('shows the note before the save lands, then takes the server’s id', async () => {
        // Arrange
        const { result } = await renderReady([]);
        let resolveSave;
        api.post.mockReturnValue(new Promise((resolve) => {
            resolveSave = resolve;
        }));

        // Act — optimistic
        let pending;
        act(() => {
            pending = result.current.createNote(draft());
        });

        // Assert — a temporary row is on screen with a negative id
        expect(result.current.state.notes).toHaveLength(1);
        expect(result.current.state.notes[0].id).toBeLessThan(0);
        expect(result.current.state.notes[0].text).toBe('on call');

        // Act — the save lands
        let landed;
        await act(async () => {
            resolveSave(note(7, { text: 'on call' }));
            landed = await pending;
        });

        // Assert
        expect(result.current.state.notes).toEqual([note(7, { text: 'on call' })]);
        expect(api.post).toHaveBeenCalledWith('/calendar/notes', draft());
        // Whether the write landed, for the caller with something to do about it.
        expect(landed).toBe(true);
    });

    test('rolls the note away when the save fails', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error('a day may hold at most 4 notes'));

        // Act
        let landed;
        await act(async () => {
            landed = await result.current.createNote(draft());
        });

        // Assert
        expect(result.current.state.notes).toEqual([]);
        expect(result.current.state.actionError).toBe('a day may hold at most 4 notes');
        expect(landed).toBe(false);
        // The load is the one from `renderReady` and no other: a rollback that
        // resynced instead would refetch, and that tells the two paths apart.
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('says something rather than nothing when the failure carries no message', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error());

        // Act
        await act(() => result.current.createNote(draft()));

        // Assert — an empty toast would tell the user less than the failure did.
        expect(result.current.state.actionError).toBe('Something went wrong. Please try again.');
    });

    test('refuses a malformed note without sending it', async () => {
        // Arrange — a gesture that produced an impossible length. The reducer's
        // ingest guard refuses it, and because the fold runs inside `dispatch`
        // the refusal lands in `mutate`'s own `try` rather than in a render.
        const { result } = await renderReady([]);

        // Act
        await act(() => result.current.createNote(draft({ durationMinutes: 0 })));

        // Assert — rolled back with a message, and the server never heard of it.
        expect(result.current.state.notes).toEqual([]);
        expect(result.current.state.actionError).toMatch(/duration/);
        expect(api.post).not.toHaveBeenCalled();
    });

    test('does not resurrect a note deleted while the new note’s save is in flight', async () => {
        // Arrange — a create still out, and the × on a real note still live.
        const { result } = await renderReady([note(1)]);
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        api.delete.mockResolvedValue({ id: 1 });

        let creation;
        act(() => {
            creation = result.current.createNote(draft());
        });

        // Act — the stored note goes while the new note's POST is still out.
        await act(() => result.current.deleteNote(1));
        const saved = note(7, { text: 'on call' });
        await act(async () => {
            pending.resolve(saved);
            await creation;
        });

        // Assert — the server's id is swapped in on the list as it now is,
        // rather than on the pre-delete one the create was applied to.
        expect(result.current.state.notes).toEqual([saved]);
    });

    test('re-syncs rather than rolling back when the list moved on beneath it', async () => {
        // Arrange — the interleaving a snapshot cannot undo: a create in flight,
        // a stored note deleted for good while it is out, and only then the POST
        // failing. Rolling back would put the deleted note back on screen.
        const { result } = await renderReady([note(1)]);
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        api.delete.mockResolvedValue({ id: 1 });

        let creation;
        act(() => {
            creation = result.current.createNote(draft());
        });
        await act(() => result.current.deleteNote(1));

        const resynced = [note(9)];
        const resync = deferred();
        api.get.mockReturnValue(resync.promise);

        // Act
        await act(async () => {
            pending.reject(new Error('nope'));
            await creation;
        });

        // Assert — the resync is out, and the plane stays readable while it is:
        // a failure that merely interleaved is no reason to blank the day back
        // to its loading state, which is what asking for a full `load` would do.
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(result.current.state.status).toBe(NOTES_STATUS.ready);

        // Act — the server says what is actually true
        await act(async () => {
            resync.resolve({ notes: resynced });
            await resync.promise;
        });

        // Assert — the server's own answer replaces the guesswork, and the
        // message survives the refetch so the failure is still on screen.
        await waitFor(() => expect(result.current.state.notes).toEqual(resynced));
        expect(result.current.state.actionError).toBe('nope');
    });
});

describe('updateNote', () => {
    test('applies the change at once and keeps the server’s answer', async () => {
        // Arrange
        const { result } = await renderReady([note(1)]);
        api.patch.mockResolvedValue(note(1, { startMinutes: 600 }));

        // Act
        await act(() => result.current.updateNote(1, { startMinutes: 600 }));

        // Assert
        expect(result.current.state.notes).toEqual([note(1, { startMinutes: 600 })]);
        expect(api.patch).toHaveBeenCalledWith('/calendar/notes/1', { startMinutes: 600 });
    });

    test('restores the note when the save fails', async () => {
        // Arrange
        const { result } = await renderReady([note(1)]);
        api.patch.mockRejectedValue(new Error('nope'));

        // Act
        await act(() => result.current.updateNote(1, { startMinutes: 600 }));

        // Assert
        expect(result.current.state.notes).toEqual([note(1)]);
        expect(result.current.state.actionError).toBe('nope');
    });

    test('refuses to address a note that is not there', async () => {
        // Arrange
        const { result } = await renderReady([]);

        // Act
        await act(() => result.current.updateNote(99, { text: 'ghost' }));

        // Assert — reported, not thrown out of a click handler
        expect(result.current.state.actionError).toMatch(/99/);
        expect(api.patch).not.toHaveBeenCalled();
        // A refusal changed nothing, so there is nothing to resync from: this is
        // still the one load `renderReady` did.
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('rolls back to the list as it is now, not as the last render saw it', async () => {
        // Arrange — two changes inside one tick, so no render lands between
        // them: a day is pruned, then a note in another day is dragged.
        const { result } = await renderReady([note(1, { dayId: 1 }), note(2, { dayId: 2 })]);
        api.patch.mockRejectedValue(new Error('nope'));

        // Act
        await act(async () => {
            result.current.pruneDay(1);
            await result.current.updateNote(2, { startMinutes: 600 });
        });

        // Assert — the rollback restores the snapshot the update itself took, so
        // the pruned day stays pruned. A snapshot read from the render's `state`
        // would be the pre-prune list and would put day 1's note back.
        expect(result.current.state.notes).toEqual([note(2, { dayId: 2 })]);
    });
});

describe('deleteNote', () => {
    test('removes it at once and leaves it gone', async () => {
        // Arrange
        const { result } = await renderReady([note(1), note(2)]);
        api.delete.mockResolvedValue({ id: 1 });

        // Act
        await act(() => result.current.deleteNote(1));

        // Assert
        expect(result.current.state.notes).toEqual([note(2)]);
        expect(api.delete).toHaveBeenCalledWith('/calendar/notes/1');
    });

    test('puts it back when the delete fails', async () => {
        // Arrange
        const { result } = await renderReady([note(1)]);
        api.delete.mockRejectedValue(new Error('nope'));

        // Act
        await act(() => result.current.deleteNote(1));

        // Assert
        expect(result.current.state.notes).toEqual([note(1)]);
    });

    test('refuses to delete a note that is not there', async () => {
        // Arrange
        const { result } = await renderReady([]);

        // Act
        await act(() => result.current.deleteNote(99));

        // Assert — reported, not thrown out of a click handler
        expect(result.current.state.actionError).toMatch(/99/);
        expect(api.delete).not.toHaveBeenCalled();
        expect(api.get).toHaveBeenCalledTimes(1);
    });
});

describe('pruneDay', () => {
    test('drops the notes of a day that has gone, and asks the server nothing', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 }), note(2, { dayId: 2 })]);

        // Act
        act(() => result.current.pruneDay(1));

        // Assert — the server already cascaded them; this is hygiene
        expect(result.current.state.notes).toEqual([note(2, { dayId: 2 })]);
        expect(api.delete).not.toHaveBeenCalled();
    });

    test('prunes a second day from the list the first prune left', async () => {
        // Arrange — two days deleted inside one tick, so no render lands between
        // them.
        const { result } = await renderReady([
            note(1, { dayId: 1 }),
            note(2, { dayId: 2 }),
            note(3, { dayId: 3 }),
        ]);

        // Act
        act(() => {
            result.current.pruneDay(1);
            result.current.pruneDay(2);
        });

        // Assert — neither prune undoes the other.
        expect(result.current.state.notes).toEqual([note(3, { dayId: 3 })]);
    });

    test('says nothing about a day that held no notes', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 })]);
        const before = result.current.state.notes;

        // Act
        act(() => result.current.pruneDay(99));

        // Assert — the same array, so nothing re-renders
        expect(result.current.state.notes).toBe(before);
    });
});

describe('notesForDay', () => {
    test('returns just that day’s notes', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 }), note(2, { dayId: 2 })]);

        // Act & Assert
        expect(result.current.notesForDay(2)).toEqual([note(2, { dayId: 2 })]);
    });

    test('hands back the same array for a day until the notes change', async () => {
        // Arrange
        const { result, rerender } = await renderReady([
            note(1, { dayId: 1 }),
            note(2, { dayId: 1 }),
            note(3, { dayId: 2 }),
        ]);

        // Act & Assert — twice in one render, and again across the next one.
        // `NotePlane` takes this array as a prop, so a fresh one per call would
        // re-render every lane whenever anything on the page moved.
        const before = result.current.notesForDay(1);
        expect(result.current.notesForDay(1)).toBe(before);

        rerender();

        expect(result.current.notesForDay(1)).toBe(before);
        expect(before).toEqual([note(1, { dayId: 1 }), note(2, { dayId: 1 })]);
    });

    test('hands back one shared empty list for every day that holds nothing', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 })]);

        // Act & Assert — an empty day is the common case in a fresh strip.
        expect(result.current.notesForDay(98)).toBe(result.current.notesForDay(99));
        expect(result.current.notesForDay(98)).toEqual([]);
    });

    test('regroups once the notes have changed', async () => {
        // Arrange
        const { result } = await renderReady([note(1, { dayId: 1 })]);
        const before = result.current.notesForDay(1);
        api.patch.mockResolvedValue(note(1, { dayId: 1, startMinutes: 600 }));

        // Act
        await act(() => result.current.updateNote(1, { startMinutes: 600 }));

        // Assert — held identity is not a stale answer.
        expect(result.current.notesForDay(1)).not.toBe(before);
        expect(result.current.notesForDay(1)).toEqual([note(1, { dayId: 1, startMinutes: 600 })]);
    });
});

describe('dismissActionError', () => {
    test('clears the message', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error('nope'));
        await act(() => result.current.createNote(draft()));

        // Act
        act(() => result.current.dismissActionError());

        // Assert
        expect(result.current.state.actionError).toBeNull();
    });
});

describe('the hook’s value', () => {
    test('hands back the same object across a render that changed nothing', async () => {
        // Arrange
        const { result, rerender } = await renderReady([note(1)]);
        const before = result.current;

        // Act — the kind of render the independently-loaded calendar and pool
        // cause, which the notes plane has no stake in.
        rerender();

        // Assert — a fresh object every render would re-render every ribbon.
        expect(result.current).toBe(before);
    });
});
