'use client';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { GripHorizontal } from 'lucide-react';
import { useProductivity } from './productivity';
import { MiniTimer } from './StudyTimer';
import {
  beginTimerDrag,
  defaultTimerCorner,
  floatingTimerVisible,
  keyboardTimerCorner,
  movableTimerQuery,
  moveTimerDrag,
  nearestTimerCorner,
  readTimerCorner,
  saveTimerCorner,
  timerBounds,
  timerCorners,
  type Point,
  type Size,
  type TimerBounds,
  type TimerCorner,
  type TimerDrag,
} from '@/lib/floating-timer';

export function FloatingTimer() {
  const { state } = useProductivity();
  // Unmount the entire floating surface in review, including drag state and listeners.
  return floatingTimerVisible(state?.timer) ? <PositionedTimer /> : null;
}
function PositionedTimer() {
  const surface = useRef<HTMLDivElement>(null);
  const safeArea = useRef<HTMLSpanElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const gesture = useRef<TimerDrag | null>(null);
  const suppressClick = useRef(false);
  const [corner, setCorner] = useState<TimerCorner>(defaultTimerCorner);
  const [dragPosition, setDragPosition] = useState<Point | null>(null);
  const [layout, setLayout] = useState<{ bounds: TimerBounds; size: Size } | null>(null);

  useEffect(() => {
    try {
      setCorner(readTimerCorner(window.localStorage));
    } catch {
      /* Default still works. */
    }
    const media = window.matchMedia(movableTimerQuery);
    const viewport = window.visualViewport;
    const header = document.querySelector<HTMLElement>('.topbar');
    const navigation = document.querySelector<HTMLElement>('.bottom-nav');
    let frame = 0;
    function measure() {
      if (!surface.current || !safeArea.current) return;
      if (gesture.current) suppressClick.current = true;
      gesture.current = null;
      setDragPosition(null);
      if (!media.matches) {
        setLayout(null);
        return;
      }
      const safe = getComputedStyle(safeArea.current);
      const visible = {
        x: viewport?.offsetLeft ?? 0,
        y: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? document.documentElement.clientWidth,
        height: viewport?.height ?? window.innerHeight,
      };
      const headerRect = header?.getBoundingClientRect();
      const navigationRect = navigation?.getBoundingClientRect();
      const bounds = timerBounds(
        visible,
        {
          top: parseFloat(safe.paddingTop) || 0,
          right: parseFloat(safe.paddingRight) || 0,
          bottom: parseFloat(safe.paddingBottom) || 0,
          left: parseFloat(safe.paddingLeft) || 0,
        },
        headerRect?.height ? headerRect.bottom : undefined,
        navigationRect?.height ? navigationRect.top : undefined,
      );
      const card = surface.current.querySelector<HTMLElement>('.mini-timer');
      const size = {
        width: Math.min(window.innerWidth <= 800 ? 320 : 360, bounds.right - bounds.left),
        height: Math.min((card?.scrollHeight ?? 0) + 2, bounds.bottom - bounds.top),
      };
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify({ bounds, size }) ? previous : { bounds, size },
      );
    }
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(refresh);
    observer.observe(surface.current!);
    if (header) observer.observe(header);
    if (navigation) observer.observe(navigation);
    media.addEventListener('change', refresh);
    window.addEventListener('resize', refresh);
    viewport?.addEventListener('resize', refresh);
    viewport?.addEventListener('scroll', refresh);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener('change', refresh);
      window.removeEventListener('resize', refresh);
      viewport?.removeEventListener('resize', refresh);
      viewport?.removeEventListener('scroll', refresh);
    };
  }, []);

  function choose(next: TimerCorner) {
    setCorner(next);
    try {
      saveTimerCorner(window.localStorage, next);
    } catch {
      /* In-memory choice remains. */
    }
  }
  function release() {
    const pointerId = gesture.current?.pointerId;
    gesture.current = null;
    setDragPosition(null);
    if (pointerId !== undefined && handle.current?.hasPointerCapture(pointerId))
      handle.current.releasePointerCapture(pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!gesture.current || !layout) return;
    const next = moveTimerDrag(
      gesture.current,
      event.pointerId,
      { x: event.clientX, y: event.clientY },
      layout.size,
      layout.bounds,
    );
    gesture.current = next;
    if (next.moved) {
      event.preventDefault();
      setDragPosition(next.position);
    }
  }
  const style: CSSProperties | undefined = layout
    ? {
        // Percentage translation anchors to the actual card size, including after rotation or text zoom.
        left:
          dragPosition?.x ?? (corner.endsWith('left') ? layout.bounds.left : layout.bounds.right),
        top:
          dragPosition?.y ?? (corner.startsWith('top') ? layout.bounds.top : layout.bounds.bottom),
        right: 'auto',
        bottom: 'auto',
        width: layout.size.width,
        maxHeight: layout.bounds.bottom - layout.bounds.top,
        transform: dragPosition
          ? 'none'
          : `translate(${corner.endsWith('left') ? '0' : '-100%'}, ${corner.startsWith('top') ? '0' : '-100%'})`,
      }
    : undefined;
  return (
    <div
      ref={surface}
      className="timer-float"
      data-corner={corner}
      data-movable={!!layout}
      data-dragging={!!dragPosition}
      style={style}
    >
      <span ref={safeArea} className="timer-safe-area" aria-hidden="true" />
      <MiniTimer
        dragHandle={
          layout ? (
            <button
              ref={handle}
              type="button"
              className="timer-drag-handle"
              aria-label={`Move floating timer (${corner.replace('-', ' ')})`}
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
              title="Drag to a corner, tap to switch corners or use arrow keys"
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0 || gesture.current) return;
                const rect = surface.current!.getBoundingClientRect();
                suppressClick.current = false;
                gesture.current = beginTimerDrag(
                  event.pointerId,
                  { x: event.clientX, y: event.clientY },
                  { x: rect.left, y: rect.top },
                );
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={(event) => {
                if (gesture.current?.pointerId !== event.pointerId) return;
                move(event);
                const drag = gesture.current!;
                suppressClick.current = drag.moved;
                if (drag.moved)
                  choose(nearestTimerCorner(drag.position, layout.size, layout.bounds, corner));
                release();
              }}
              onPointerCancel={(event) => {
                if (gesture.current?.pointerId !== event.pointerId) return;
                suppressClick.current = true;
                release();
              }}
              onLostPointerCapture={() => {
                if (gesture.current) {
                  suppressClick.current = true;
                  release();
                }
              }}
              onClick={(event) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                choose(timerCorners[(timerCorners.indexOf(corner) + 1) % timerCorners.length]);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false;
                const next = keyboardTimerCorner(corner, event.key);
                if (next) {
                  event.preventDefault();
                  release();
                  choose(next);
                }
              }}
            >
              <GripHorizontal size={18} aria-hidden="true" />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
