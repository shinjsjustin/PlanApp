import { renderHook, waitFor } from '@testing-library/react';

import useCalendarNotes from './useCalendarNotes';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
    ...jest.requireActual('../lib/api'),
    api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const note = (id, text) => ({ id, dayId: 1, text, startMinutes: 540, durationMinutes: 60 });

test('notesForDay omits lived notes and keeps the rest', async () => {
    const plain = note(1, 'on call');
    const lookalike = note(3, 'Lived:no space');
    const middle = note(4, 'not Lived: here');
    api.get.mockResolvedValue({ notes: [plain, note(2, 'Lived: church'), lookalike, middle] });

    const { result } = renderHook(() => useCalendarNotes());
    await waitFor(() => expect(result.current.state.notes).toHaveLength(4));

    expect(result.current.notesForDay(1)).toEqual([plain, lookalike, middle]);
});

test('a day holding only lived notes reads as empty', async () => {
    api.get.mockResolvedValue({ notes: [note(1, 'Lived: church')] });

    const { result } = renderHook(() => useCalendarNotes());
    await waitFor(() => expect(result.current.state.notes).toHaveLength(1));

    expect(result.current.notesForDay(1)).toEqual([]);
});
