import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import useDebouncedCallback from './useDebouncedCallback';

// State behind a project's Thoughts page: one document, autosaved.
//
// The server rejects a PUT whose `version` is stale (409). One PUT runs at a
// time so each carries the version the previous one returned; edits made while
// one is in flight go out right after it. A conflict stops saving until reload,
// and never replaces what the user typed.

export const SAVE_DELAY_MS = 1000;

const CONFLICT_STATUS = 409;
const GENERIC_FAILURE = 'Something went wrong. Please try again.';

const useProjectThoughts = (projectId) => {
    const path = `/projects/${projectId}/thoughts`;
    const [status, setStatus] = useState('loading');
    const [text, setTextState] = useState('');
    const [projectTitle, setProjectTitle] = useState('');
    const [updatedAt, setUpdatedAt] = useState(null);
    const [saveState, setSaveState] = useState('saved');
    const [error, setError] = useState(null);

    const isMounted = useRef(true);
    const textRef = useRef('');
    const versionRef = useRef(0);
    const isDirty = useRef(false);
    const isSaving = useRef(false);
    const isConflict = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const save = useCallback(async () => {
        if (isSaving.current || isConflict.current || !isDirty.current) return;

        isSaving.current = true;
        isDirty.current = false;
        if (isMounted.current) setSaveState('saving');
        try {
            const saved = await api.put(path, { text: textRef.current, version: versionRef.current });
            versionRef.current = saved.version;
            isSaving.current = false;
            if (isMounted.current) {
                setUpdatedAt(saved.updatedAt);
                setError(null);
                setSaveState(isDirty.current ? 'unsaved' : 'saved');
            }
            if (isDirty.current) save();
        } catch (err) {
            isSaving.current = false;
            isDirty.current = true;
            isConflict.current = err?.status === CONFLICT_STATUS;
            if (!isMounted.current) return;
            setSaveState(isConflict.current ? 'conflict' : 'error');
            setError(err?.message || GENERIC_FAILURE);
        }
    }, [path]);

    const { run: scheduleSave, cancel: cancelSave } = useDebouncedCallback(save, SAVE_DELAY_MS, {
        shouldFlushOnUnmount: true,
    });

    const setText = useCallback(
        (next) => {
            textRef.current = next;
            isDirty.current = true;
            setTextState(next);
            if (!isConflict.current) {
                setSaveState('unsaved');
                scheduleSave();
            }
        },
        [scheduleSave]
    );

    const reload = useCallback(async () => {
        cancelSave();
        try {
            const data = await api.get(path);
            if (!isMounted.current) return;
            textRef.current = data.text;
            versionRef.current = data.version;
            isDirty.current = false;
            isConflict.current = false;
            setTextState(data.text);
            setProjectTitle(data.projectTitle);
            setUpdatedAt(data.updatedAt);
            setSaveState('saved');
            setError(null);
            setStatus('ready');
        } catch (err) {
            if (!isMounted.current) return;
            setError(err?.message || GENERIC_FAILURE);
            setStatus('error');
        }
    }, [path, cancelSave]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { status, text, projectTitle, updatedAt, saveState, error, setText, reload };
};

export default useProjectThoughts;
