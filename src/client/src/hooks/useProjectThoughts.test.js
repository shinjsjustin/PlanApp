import { renderHook, act, waitFor } from '@testing-library/react';

import useProjectThoughts, { SAVE_DELAY_MS } from './useProjectThoughts';
import { api } from '../lib/api';

jest.mock('../lib/api');

const PATH = '/projects/7/thoughts';
const LOADED = { projectId: 7, projectTitle: 'Kitchen', text: 'hello', version: 3, updatedAt: '2026-01-01T00:00:00.000Z' };

const mountReady = async () => {
    api.get.mockResolvedValue(LOADED);
    const hook = renderHook(() => useProjectThoughts(7));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
};

const typeAndWait = async (hook, text) => {
    act(() => hook.result.current.setText(text));
    await act(async () => {
        jest.advanceTimersByTime(SAVE_DELAY_MS);
    });
};

beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useProjectThoughts', () => {
    it('loads: loading, then ready with text, projectTitle and updatedAt', async () => {
        api.get.mockResolvedValue(LOADED);
        const { result } = renderHook(() => useProjectThoughts(7));

        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(api.get).toHaveBeenCalledWith(PATH);
        expect(result.current).toMatchObject({
            text: 'hello',
            projectTitle: 'Kitchen',
            updatedAt: '2026-01-01T00:00:00.000Z',
            saveState: 'saved',
        });
    });

    it('sets status error with the message when the load fails', async () => {
        api.get.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useProjectThoughts(7));

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('down');
    });

    it('setText updates text and marks unsaved without sending yet', async () => {
        const hook = await mountReady();
        act(() => hook.result.current.setText('hello!'));

        expect(hook.result.current.text).toBe('hello!');
        expect(hook.result.current.saveState).toBe('unsaved');
        act(() => {
            jest.advanceTimersByTime(SAVE_DELAY_MS - 1);
        });
        expect(api.put).not.toHaveBeenCalled();
    });

    it('sends one PUT with text and version after the delay: saving, then saved', async () => {
        const hook = await mountReady();
        let finish;
        api.put.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

        act(() => hook.result.current.setText('a'));
        act(() => hook.result.current.setText('ab'));
        await act(async () => {
            jest.advanceTimersByTime(SAVE_DELAY_MS);
        });

        expect(api.put).toHaveBeenCalledTimes(1);
        expect(api.put).toHaveBeenCalledWith(PATH, { text: 'ab', version: 3 });
        expect(hook.result.current.saveState).toBe('saving');

        await act(async () => {
            finish({ ...LOADED, text: 'ab', version: 4, updatedAt: '2026-02-02T00:00:00.000Z' });
        });
        expect(hook.result.current.saveState).toBe('saved');
        expect(hook.result.current.updatedAt).toBe('2026-02-02T00:00:00.000Z');
    });

    it('sends edits made during an in-flight PUT after it, with the new version', async () => {
        const hook = await mountReady();
        let finish;
        api.put.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        api.put.mockResolvedValueOnce({ ...LOADED, text: 'abc', version: 5 });

        await typeAndWait(hook, 'ab');
        act(() => hook.result.current.setText('abc'));
        await act(async () => {
            jest.advanceTimersByTime(SAVE_DELAY_MS);
        });
        expect(api.put).toHaveBeenCalledTimes(1);

        await act(async () => {
            finish({ ...LOADED, text: 'ab', version: 4 });
        });

        expect(api.put).toHaveBeenCalledTimes(2);
        expect(api.put).toHaveBeenLastCalledWith(PATH, { text: 'abc', version: 4 });
        expect(hook.result.current.saveState).toBe('saved');
        expect(hook.result.current.text).toBe('abc');
    });

    it('a 409 sets conflict, keeps the typed text and sends no more PUTs', async () => {
        const hook = await mountReady();
        api.put.mockRejectedValue(Object.assign(new Error('changed elsewhere'), { status: 409 }));

        await typeAndWait(hook, 'mine');
        expect(hook.result.current.saveState).toBe('conflict');
        expect(hook.result.current.text).toBe('mine');

        await typeAndWait(hook, 'mine more');
        expect(api.put).toHaveBeenCalledTimes(1);
        expect(hook.result.current.text).toBe('mine more');
        expect(hook.result.current.saveState).toBe('conflict');
    });

    it('reload re-fetches, replaces the text and clears the conflict', async () => {
        const hook = await mountReady();
        api.put.mockRejectedValue(Object.assign(new Error('x'), { status: 409 }));
        await typeAndWait(hook, 'mine');

        api.get.mockResolvedValue({ ...LOADED, text: 'theirs', version: 9 });
        await act(() => hook.result.current.reload());
        expect(hook.result.current.text).toBe('theirs');
        expect(hook.result.current.saveState).toBe('saved');

        api.put.mockResolvedValue({ ...LOADED, text: 'next', version: 10 });
        await typeAndWait(hook, 'next');
        expect(api.put).toHaveBeenLastCalledWith(PATH, { text: 'next', version: 9 });
    });

    it('a non-409 failure sets error and the next edit retries', async () => {
        const hook = await mountReady();
        api.put.mockRejectedValueOnce(new Error('offline'));
        api.put.mockResolvedValueOnce({ ...LOADED, text: 'two', version: 4 });

        await typeAndWait(hook, 'one');
        expect(hook.result.current.saveState).toBe('error');
        expect(hook.result.current.error).toBe('offline');
        expect(hook.result.current.text).toBe('one');

        await typeAndWait(hook, 'two');
        expect(api.put).toHaveBeenLastCalledWith(PATH, { text: 'two', version: 3 });
        expect(hook.result.current.saveState).toBe('saved');
    });

    it('unmounting with a pending edit flushes the save', async () => {
        const hook = await mountReady();
        api.put.mockResolvedValue({ ...LOADED, version: 4 });

        act(() => hook.result.current.setText('bye'));
        hook.unmount();

        expect(api.put).toHaveBeenCalledWith(PATH, { text: 'bye', version: 3 });
    });
});
