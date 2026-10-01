import { useCallback, useEffect, useRef, useState } from 'react';

export const LONG_PRESS_MS = 500;

// iOS Safari never fires `contextmenu`, so a held touch is the touch path.
// Right-click, Shift+F10 and the ContextMenu key do fire it; the keyboard ones
// report 0,0, so those open at the target's own corner instead.
const useContextMenu = () => {
    const [menu, setMenu] = useState(null);
    const timer = useRef(null);
    const didLongPress = useRef(false);

    const cancelTimer = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = null;
    }, []);

    useEffect(() => cancelTimer, [cancelTimer]);

    const onContextMenu = (event) => {
        event.preventDefault();
        if (event.clientX === 0 && event.clientY === 0) {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom });
            return;
        }
        setMenu({ x: event.clientX, y: event.clientY });
    };

    const onTouchStart = (event) => {
        const { clientX: x, clientY: y } = event.touches[0];
        didLongPress.current = false;
        cancelTimer();
        timer.current = setTimeout(() => {
            timer.current = null;
            didLongPress.current = true;
            setMenu({ x, y });
        }, LONG_PRESS_MS);
    };

    const onTouchEnd = (event) => {
        cancelTimer();
        // Stops the click the browser would synthesize after the long press.
        if (didLongPress.current) {
            event.preventDefault();
            didLongPress.current = false;
        }
    };

    return {
        menu,
        close: () => setMenu(null),
        triggerProps: {
            onContextMenu,
            onTouchStart,
            onTouchEnd,
            onTouchMove: cancelTimer,
            onTouchCancel: cancelTimer,
        },
    };
};

export default useContextMenu;
