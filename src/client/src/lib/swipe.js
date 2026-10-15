export const SWIPE_MIN_PX = 50;
export const DOMINANCE = 1.5;

// Directions name the finger's motion: dx < 0 is 'left', dy < 0 is 'up'.
export function classifySwipe({ dx, dy }) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > SWIPE_MIN_PX && ax > DOMINANCE * ay) return dx < 0 ? 'left' : 'right';
  if (ay > SWIPE_MIN_PX && ay > DOMINANCE * ax) return dy < 0 ? 'up' : 'down';
  return null;
}
