'use client';
import { useEffect, useRef } from 'react';
import { useProductivity } from './productivity';
import { MiniTimer } from './StudyTimer';
import { floatingTimerVisible } from '@/lib/floating-timer';

export function FloatingTimer() {
  const { state } = useProductivity();
  return floatingTimerVisible(state?.timer) ? <FixedTimer /> : null;
}
function FixedTimer() {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // CSS owns placement. Only compensate for a keyboard/panned visual viewport;
    // no drag state, corner preference, coordinates or orientation choice exists.
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      surface.current?.style.setProperty('--timer-keyboard-inset', `${inset}px`);
      surface.current?.style.setProperty('--timer-visible-height', `${viewport.height}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return (
    <div ref={surface} className="timer-float">
      <MiniTimer />
    </div>
  );
}
