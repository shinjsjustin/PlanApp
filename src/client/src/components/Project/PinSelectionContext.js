import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_SELECTION = new Set();

/**
 * The states a selection can be in. A closed set, named like every other one in
 * this codebase (`TODO_STATUS`, `SEQUENCE_STATUS`, `PROJECT_STATUS`), so the two
 * operations are spelled once and a typo is a crash rather than a dead branch.
 * `pin` and `unpin` double as the operation a row's control is offering.
 */
export const PIN_MODE = {
    idle: 'idle',
    pin: 'pin',
    unpin: 'unpin',
};

const idleSelection = {
    mode: PIN_MODE.idle,
    selectedTodoIds: EMPTY_SELECTION,
    isEligible: () => false,
    isSelected: () => false,
    toggle: () => {},
    startPin: () => {},
    startUnpin: () => {},
    cancel: () => {},
    confirm: async () => {},
    isSaving: false,
};

const PinSelectionContext = createContext(idleSelection);

export const PinSelectionProvider = ({ value, children }) => (
    <PinSelectionContext.Provider value={value}>{children}</PinSelectionContext.Provider>
);

export const usePinSelectionContext = () => useContext(PinSelectionContext);

export const usePinSelectionState = (setTodosPinned) => {
    const [mode, setMode] = useState(PIN_MODE.idle);
    const [selectedTodoIds, setSelectedTodoIds] = useState(() => new Set());
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const generationRef = useRef(0);

    // The graph's mutation callback is stable within a project, and changes on
    // navigation. Drafts and pending confirmations belong to that project only.
    useEffect(() => {
        setMode(PIN_MODE.idle);
        setSelectedTodoIds(new Set());
        setIsSaving(false);
        savingRef.current = false;
        return () => { generationRef.current += 1; };
    }, [setTodosPinned]);

    const begin = useCallback((nextMode) => {
        if (savingRef.current) return;
        setMode(nextMode);
        setSelectedTodoIds(new Set());
    }, []);

    const startPin = useCallback(() => begin(PIN_MODE.pin), [begin]);
    const startUnpin = useCallback(() => begin(PIN_MODE.unpin), [begin]);

    const cancel = useCallback(() => {
        if (savingRef.current) return;
        setMode(PIN_MODE.idle);
        setSelectedTodoIds(new Set());
    }, []);

    const isEligible = useCallback(
        (todo) =>
            (isSaving && selectedTodoIds.has(todo.id)) ||
            (mode === PIN_MODE.pin && !todo.isPinned) ||
            (mode === PIN_MODE.unpin && Boolean(todo.isPinned)),
        [mode, isSaving, selectedTodoIds]
    );

    const isSelected = useCallback(
        (todoId) => selectedTodoIds.has(todoId),
        [selectedTodoIds]
    );

    const toggle = useCallback((todoId) => {
        if (savingRef.current) return;
        setSelectedTodoIds((current) => current.has(todoId)
            ? new Set([...current].filter((id) => id !== todoId))
            : new Set([...current, todoId]));
    }, []);

    const confirm = useCallback(async () => {
        if (mode === PIN_MODE.idle || selectedTodoIds.size === 0 || savingRef.current) return false;

        const generation = generationRef.current;
        savingRef.current = true;
        setIsSaving(true);

        try {
            const saved = await setTodosPinned([...selectedTodoIds], mode === PIN_MODE.pin);
            if (generationRef.current !== generation || saved === null) return false;

            setMode(PIN_MODE.idle);
            setSelectedTodoIds(new Set());
            return true;
        } finally {
            if (generationRef.current === generation) {
                savingRef.current = false;
                setIsSaving(false);
            }
        }
    }, [mode, selectedTodoIds, setTodosPinned]);

    return useMemo(
        () => ({
            mode,
            selectedTodoIds,
            isEligible,
            isSelected,
            toggle,
            startPin,
            startUnpin,
            cancel,
            confirm,
            isSaving,
        }),
        [
            mode,
            selectedTodoIds,
            isEligible,
            isSelected,
            toggle,
            startPin,
            startUnpin,
            cancel,
            confirm,
            isSaving,
        ]
    );
};

export default PinSelectionContext;
