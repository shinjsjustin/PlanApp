import { useCallback, useEffect, useRef, useState } from 'react';
import { useDndContext } from '@dnd-kit/core';

const DEFAULT_DELAY_MS = 400;

/** Opens a preview after a hover or focus delay; stays closed during a drag. */
export default function useHoverPreview({ delayMs = DEFAULT_DELAY_MS } = {}) {
    const { active } = useDndContext();
    const isDragging = Boolean(active);
    const [isOpen, setIsOpen] = useState(false);
    const timerRef = useRef(null);

    const clearTimer = useCallback(() => {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    const close = useCallback(() => {
        clearTimer();
        setIsOpen(false);
    }, [clearTimer]);

    const scheduleOpen = useCallback(() => {
        if (isDragging) return;
        clearTimer();
        timerRef.current = setTimeout(() => setIsOpen(true), delayMs);
    }, [isDragging, delayMs, clearTimer]);

    useEffect(() => {
        if (isDragging) close();
    }, [isDragging, close]);

    useEffect(() => clearTimer, [clearTimer]);

    return {
        isOpen: isOpen && !isDragging,
        triggerProps: {
            onMouseEnter: scheduleOpen,
            onMouseLeave: close,
            onFocus: scheduleOpen,
            onBlur: close,
        },
    };
}
