import { useRef } from 'react';
import { classifySwipe } from '../lib/swipe';

// Only horizontal swipes call onSwipe; vertical motion is left to native scrolling.
export default function useSwipe({ onSwipe }) {
  const start = useRef(null);

  const onTouchStart = (e) => {
    const { clientX, clientY } = e.touches[0];
    start.current = { x: clientX, y: clientY };
  };

  const onTouchEnd = (e) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    const { clientX, clientY } = e.changedTouches[0];
    const direction = classifySwipe({ dx: clientX - s.x, dy: clientY - s.y });
    if (direction === 'left' || direction === 'right') onSwipe(direction);
  };

  return { onTouchStart, onTouchEnd };
}
