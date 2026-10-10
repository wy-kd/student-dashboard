/** Device-local presentation only. Never changes the persisted timer or study sessions. */
export const timerCorners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
export type TimerCorner = (typeof timerCorners)[number];
export const defaultTimerCorner: TimerCorner = 'bottom-right';
const storageKey = 'student-timer-corner';
export const timerDragThreshold = 8;
export const movableTimerQuery = '(any-pointer: coarse), (max-width: 800px)';

export function floatingTimerVisible(timer: { status: string } | null | undefined) {
  return timer?.status === 'running' || timer?.status === 'paused';
}
export function readTimerCorner(storage: Pick<Storage, 'getItem'>): TimerCorner {
  try {
    const value = storage.getItem(storageKey);
    if (timerCorners.includes(value as TimerCorner)) return value as TimerCorner;
  } catch {
    /* Private browsing may deny storage. */
  }
  return defaultTimerCorner;
}
export function saveTimerCorner(storage: Pick<Storage, 'setItem'>, corner: TimerCorner) {
  try {
    storage.setItem(storageKey, corner);
  } catch {
    /* Keep the in-memory choice. */
  }
}
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type TimerBounds = { left: number; top: number; right: number; bottom: number };
export function timerBounds(
  viewport: Point & Size,
  safe: { top: number; right: number; bottom: number; left: number },
  headerBottom?: number,
  navigationTop?: number,
): TimerBounds {
  const margin = 12;
  const left = viewport.x + Math.max(margin, safe.left);
  const right = Math.max(left + 1, viewport.x + viewport.width - Math.max(margin, safe.right));
  const topEdge = viewport.y + Math.max(margin, safe.top);
  const bottomEdge = viewport.y + viewport.height - Math.max(margin, safe.bottom);
  let top = topEdge,
    bottom = bottomEdge;
  if (headerBottom !== undefined && headerBottom > viewport.y && headerBottom < bottomEdge)
    top = Math.max(top, headerBottom + margin);
  if (navigationTop !== undefined && navigationTop > topEdge && navigationTop < bottomEdge)
    bottom = navigationTop - margin;
  // Very short keyboard/zoom viewports may not fit the header as well as the card.
  // Prioritise keeping the card within the visible viewport; its contents can scroll.
  if (bottom <= top) top = topEdge;
  return { left, right, top, bottom: Math.max(top + 1, bottom) };
}
export function clampTimerPosition(point: Point, size: Size, bounds: TimerBounds): Point {
  return {
    x: Math.min(Math.max(bounds.left, point.x), Math.max(bounds.left, bounds.right - size.width)),
    y: Math.min(Math.max(bounds.top, point.y), Math.max(bounds.top, bounds.bottom - size.height)),
  };
}
export function timerCornerPosition(corner: TimerCorner, size: Size, bounds: TimerBounds): Point {
  return clampTimerPosition(
    {
      x: corner.endsWith('left') ? bounds.left : bounds.right - size.width,
      y: corner.startsWith('top') ? bounds.top : bounds.bottom - size.height,
    },
    size,
    bounds,
  );
}
export function nearestTimerCorner(
  point: Point,
  size: Size,
  bounds: TimerBounds,
  previous: TimerCorner,
) {
  let best = previous,
    distance = Infinity;
  // Keep the previous side on ties (e.g. a card spanning the available phone width).
  for (const corner of [previous, ...timerCorners]) {
    const position = timerCornerPosition(corner, size, bounds);
    const next = Math.hypot(point.x - position.x, point.y - position.y);
    if (next < distance) {
      best = corner;
      distance = next;
    }
  }
  return best;
}
export function keyboardTimerCorner(corner: TimerCorner, key: string): TimerCorner | null {
  const vertical = corner.startsWith('top') ? 'top' : 'bottom';
  const horizontal = corner.endsWith('left') ? 'left' : 'right';
  if (key === 'ArrowLeft') return `${vertical}-left`;
  if (key === 'ArrowRight') return `${vertical}-right`;
  if (key === 'ArrowUp') return `top-${horizontal}`;
  if (key === 'ArrowDown') return `bottom-${horizontal}`;
  return null;
}
export type TimerDrag = {
  pointerId: number;
  start: Point;
  origin: Point;
  position: Point;
  moved: boolean;
};
export function beginTimerDrag(pointerId: number, start: Point, origin: Point): TimerDrag {
  return { pointerId, start, origin, position: origin, moved: false };
}
export function moveTimerDrag(
  drag: TimerDrag,
  pointerId: number,
  point: Point,
  size: Size,
  bounds: TimerBounds,
): TimerDrag {
  if (pointerId !== drag.pointerId) return drag;
  const dx = point.x - drag.start.x,
    dy = point.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) < timerDragThreshold) return drag;
  return {
    ...drag,
    moved: true,
    position: clampTimerPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, size, bounds),
  };
}
