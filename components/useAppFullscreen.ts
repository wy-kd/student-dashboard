'use client';
import { useEffect, useState } from 'react';
export function useAppFullscreen() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const changed = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false);
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  async function enter() {
    setActive(true);
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* App layout remains available. */
      }
    }
  }
  async function exit() {
    setActive(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* Browser also offers its own exit control. */
      }
    }
  }
  return { active, enter, exit };
}
