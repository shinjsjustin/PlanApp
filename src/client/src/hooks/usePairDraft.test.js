import { act, renderHook } from '@testing-library/react';
import usePairDraft from './usePairDraft';

const pair = { name: 'A', effect: 'e', notes: 'n', state: 'idea' };

const setup = (save) => renderHook(() => usePairDraft({ pair, save }));

describe('usePairDraft', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('starts saved with the pair values', () => {
        const { result } = setup(jest.fn());
        expect(result.current.draft).toEqual(pair);
        expect(result.current.status).toBe('saved');
    });

    it('saves once, 800 ms after the last of two quick edits, with the last values', async () => {
        const save = jest.fn().mockResolvedValue();
        const { result } = setup(save);

        act(() => result.current.setField('name', 'AB'));
        act(() => jest.advanceTimersByTime(500));
        act(() => result.current.setField('notes', 'later'));
        expect(result.current.status).toBe('pending');

        act(() => jest.advanceTimersByTime(799));
        expect(save).not.toHaveBeenCalled();

        await act(async () => jest.advanceTimersByTime(1));
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ name: 'AB', effect: 'e', notes: 'later', state: 'idea' });
        expect(result.current.status).toBe('saved');
    });

    it('shows saving while the request is in flight', async () => {
        let resolve;
        const save = jest.fn(() => new Promise((r) => { resolve = r; }));
        const { result } = setup(save);

        act(() => result.current.setField('name', 'X'));
        act(() => jest.advanceTimersByTime(800));
        expect(result.current.status).toBe('saving');

        await act(async () => resolve());
        expect(result.current.status).toBe('saved');
    });

    it('setState saves at once with pending text', async () => {
        const save = jest.fn().mockResolvedValue();
        const { result } = setup(save);

        act(() => result.current.setField('effect', 'typed'));
        await act(async () => result.current.setState('tested'));

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ name: 'A', effect: 'typed', notes: 'n', state: 'tested' });
        expect(result.current.draft.state).toBe('tested');

        await act(async () => jest.advanceTimersByTime(2000));
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('flushes a pending change on unmount', () => {
        const save = jest.fn().mockResolvedValue();
        const { result, unmount } = setup(save);

        act(() => result.current.setField('name', 'bye'));
        unmount();

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ name: 'bye', effect: 'e', notes: 'n', state: 'idea' });
    });

    it('does not save on unmount when nothing changed', () => {
        const save = jest.fn();
        setup(save).unmount();
        expect(save).not.toHaveBeenCalled();
    });

    it('keeps the draft and reports error when save rejects, then retry recovers', async () => {
        const save = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue();
        const { result } = setup(save);

        act(() => result.current.setField('name', 'keep me'));
        await act(async () => jest.advanceTimersByTime(800));
        expect(result.current.status).toBe('error');
        expect(result.current.draft.name).toBe('keep me');

        await act(async () => result.current.retry());
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith({ name: 'keep me', effect: 'e', notes: 'n', state: 'idea' });
        expect(result.current.status).toBe('saved');
    });

    it('ignores a save result that lands after unmount', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let reject;
        const save = jest.fn(() => new Promise((_, r) => { reject = r; }));
        const { result, unmount } = setup(save);

        act(() => result.current.setField('name', 'x'));
        unmount();
        await act(async () => reject(new Error('late')));

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
