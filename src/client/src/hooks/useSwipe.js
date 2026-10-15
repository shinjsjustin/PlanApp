import { useRef } from 'react';
import { classifySwipe } from '../lib/swipe';

const BOTTOM_TOLERANCE_PX = 1;

// Vertical swipes only fire when the scroller was already at that edge at touch
// start, so scrolling a long list never triggers navigation.
export default function useSwipe({ onSwipe, scrollRef }) {
  const start = useRef(null);

  const onTouchStart = (e) => {
    const { clientX, clientY } = e.touches[0];
    const el = scrollRef && scrollRef.current;
    start.current = {
      x: clientX,
      y: clientY,
      atTop: !el || el.scrollTop <= 0,
      atBottom: !el || el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_TOLERANCE_PX,
    };
  };

  const onTouchEnd = (e) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    const { clientX, clientY } = e.changedTouches[0];
    const direction = classifySwipe({ dx: clientX - s.x, dy: clientY - s.y });
    if (!direction) return;
    if (direction === 'up' && !s.atBottom) return;
    if (direction === 'down' && !s.atTop) return;
    onSwipe(direction);
  };

  return { onTouchStart, onTouchEnd };
}
