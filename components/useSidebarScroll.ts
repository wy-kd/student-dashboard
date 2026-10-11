'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readSidebarScroll, saveSidebarScroll } from '@/lib/navigation-preference';
/** Native scrolling stays authoritative. State is browser-local and never stored in SQLite. */
export function useSidebarScroll(route: string, collapsed: boolean, menu: boolean) {
  const ref = useRef<HTMLElement>(null),
    positions = useRef(new Map<'desktop' | 'mobile', number>()),
    restoring = useRef(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const mode = window.innerWidth <= 800 ? 'mobile' : 'desktop';
    if (!positions.current.has(mode)) {
      let saved = 0;
      try {
        saved = readSidebarScroll(window.sessionStorage, mode);
      } catch {}
      positions.current.set(mode, saved);
    }
    restoring.current = true;
    node.scrollTop = positions.current.get(mode)!;
    const frame = window.requestAnimationFrame(() => {
      restoring.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route, collapsed, menu, width]);
  function onScroll() {
    if (restoring.current || !ref.current) return;
    const mode = window.innerWidth <= 800 ? 'mobile' : 'desktop';
    if (mode === 'mobile' && !menu) return; // Hidden mobile navigation may clamp to zero.
    const value = ref.current.scrollTop;
    positions.current.set(mode, value);
    try {
      saveSidebarScroll(window.sessionStorage, mode, value);
    } catch {}
  }
  return { ref, onScroll };
}
