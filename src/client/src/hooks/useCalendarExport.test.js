import { act, renderHook } from '@testing-library/react';

import useCalendarExport from './useCalendarExport';
import { api } from '../lib/api';

jest.mock('../lib/api', () => {
    const actual = jest.requireActual('../lib/api');

    return { ...actual, api: { get: jest.fn(), post: jest.fn() } };
});

const deferred = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
    });

    return { promise, ...settle };
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('useCalendarExport', () => {
    test('starts idle with no summary and no error', () => {
        const { result } = renderHook(() => useCalendarExport());

        expect(result.current.isExporting).toBe(false);
        expect(result.current.summary).toBeNull();
        expect(result.current.error).toBeNull();
    });

    test('exportAll POSTs {}, is exporting while in flight, then holds the counts', async () => {
        const pending = deferred();
        api.post.mockReturnValue(pending.promise);
        const { result } = renderHook(() => useCalendarExport());

        let done;
        act(() => {
            done = result.current.exportAll();
        });

        expect(api.post).toHaveBeenCalledWith('/calendar/export', {});
        expect(result.current.isExporting).toBe(true);

        await act(async () => {
            pending.resolve({ created: 3, updated: 2, deleted: 1 });
            await done;
        });

        expect(result.current.isExporting).toBe(false);
        expect(result.current.summary).toEqual({ created: 3, updated: 2, deleted: 1 });
    });

    test('counts missing or non-numeric fields as 0', async () => {
        api.post.mockResolvedValue({ created: '5', updated: null });
        const { result } = renderHook(() => useCalendarExport());

        await act(async () => {
            await result.current.exportAll();
        });

        expect(result.current.summary).toEqual({ created: 0, updated: 0, deleted: 0 });
    });

    test('a rejected export sets error, clears summary, and dismissError clears the error', async () => {
        api.post.mockResolvedValueOnce({ created: 1, updated: 1, deleted: 1 });
        const { result } = renderHook(() => useCalendarExport());
        await act(async () => {
            await result.current.exportAll();
        });

        api.post.mockRejectedValue(new Error('Google not connected'));
        await act(async () => {
            await result.current.exportAll();
        });

        expect(result.current.error).toBe('Google not connected');
        expect(result.current.summary).toBeNull();
        expect(result.current.isExporting).toBe(false);

        act(() => result.current.dismissError());

        expect(result.current.error).toBeNull();
    });
});
