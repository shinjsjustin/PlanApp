import { useCallback, useEffect, useId, useRef, useState } from 'react';
import useHoverPreview from './useHoverPreview';

const IGNORED_CLICK_TARGETS = 'button, [role="separator"]';

/** Hover preview that a tap can pin open; Escape or an outside press unpins. */
export default function useFullTextTip() {
    const hover = useHoverPreview();
    const tipId = useId();
    const anchorRef = useRef(null);
    const [isPinned, setIsPinned] = useState(false);
    const isOpen = hover.isOpen || isPinned;

    // useHoverPreview exposes no close; its leave handler is exactly that.
    const closeHover = hover.triggerProps.onMouseLeave;

    const close = useCallback(() => {
        setIsPinned(false);
        closeHover();
    }, [closeHover]);

    useEffect(() => {
        if (!isPinned) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') close();
        };
        const onPointerDown = (event) => {
            if (!anchorRef.current?.contains(event.target)) close();
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [isPinned, close]);

    const onClick = (event) => {
        if (event.target.closest(IGNORED_CLICK_TARGETS)) return;
        if (isPinned) close();
        else setIsPinned(true);
    };

    const onMouseLeave = () => {
        if (!isPinned) closeHover();
    };

    return {
        isOpen,
        tipId,
        anchorRef,
        close,
        triggerProps: {
            ...hover.triggerProps,
            onMouseLeave,
            onClick,
            ...(isOpen && { 'aria-describedby': tipId }),
        },
    };
}
