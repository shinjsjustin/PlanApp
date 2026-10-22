import { useCallback, useEffect, useRef, useState } from 'react';
import useDebouncedCallback from './useDebouncedCallback';

const AUTOSAVE_DELAY_MS = 800;

const pickDraft = ({ name, effect, notes, state }) => ({ name, effect, notes, state });

// Keeps a pair's editable fields locally and saves them as the user types.
// The draft is initialised from `pair` once: the panel is keyed by pair, so a
// different pair remounts it and flushes this one on unmount.
const usePairDraft = ({ pair, save }) => {
    const [draft, setDraft] = useState(() => pickDraft(pair));
    const [status, setStatus] = useState('saved');

    // Timers and unmount flushes run outside the render that scheduled them, so
    // they read the latest draft from a ref.
    const draftRef = useRef(draft);
    const isMountedRef = useRef(true);
    const requestRef = useRef(0);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const saveDraft = useCallback(async () => {
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
        const isCurrent = () => isMountedRef.current && requestRef.current === requestId;

        if (isMountedRef.current) setStatus('saving');
        try {
            await save(draftRef.current);
            if (isCurrent()) setStatus('saved');
        } catch (err) {
            if (isCurrent()) setStatus('error');
        }
    }, [save]);

    const { run, cancel } = useDebouncedCallback(saveDraft, AUTOSAVE_DELAY_MS, {
        shouldFlushOnUnmount: true,
    });

    const update = useCallback((changes) => {
        draftRef.current = { ...draftRef.current, ...changes };
        setDraft(draftRef.current);
    }, []);

    const setField = useCallback((field, value) => {
        update({ [field]: value });
        setStatus('pending');
        run();
    }, [update, run]);

    const setState = useCallback((state) => {
        update({ state });
        cancel();
        return saveDraft();
    }, [update, cancel, saveDraft]);

    const retry = useCallback(() => {
        cancel();
        return saveDraft();
    }, [cancel, saveDraft]);

    return { draft, setField, setState, status, retry };
};

export default usePairDraft;
