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
        await act(async () => {
            resolveSave(note(7, { text: 'on call' }));
            await pending;
        });

        // Assert
        expect(result.current.state.notes).toEqual([note(7, { text: 'on call' })]);
        expect(api.post).toHaveBeenCalledWith('/calendar/notes', draft());
    });

    test('rolls the note away when the save fails', async () => {
        // Arrange
        const { result } = await renderReady([]);
        api.post.mockRejectedValue(new Error('a day may hold at most 4 notes'));

        // Act
        await act(() => result.current.createNote(draft()));

        // Assert
        expect(result.current.state.notes).toEqual([]);
        expect(result.current.state.actionError).toBe('a day may hold at most 4 notes');
        // The load is the one from `renderReady` and no other: a rollback that
        // resynced instead would refetch, and that tells the two paths apart.
        expect(api.get).toHaveBeenCalledTimes(1);
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
        api.get.mockResolvedValue({ notes: resynced });

        // Act
        await act(async () => {
            pending.reject(new Error('nope'));
            await creation;
        });

        // Assert — the server's own answer replaces the guesswork, and the
        // message survives the refetch so the failure is still on screen.
        await waitFor(() => expect(result.current.state.notes).toEqual(resynced));
        expect(result.current.state.actionError).toBe('nope');
        expect(api.get).toHaveBeenCalledTimes(2);
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
