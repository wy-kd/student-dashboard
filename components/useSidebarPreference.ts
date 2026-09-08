'use client';
import { useCallback, useEffect, useState } from 'react';
import { readSidebarPreference, saveSidebarPreference } from '@/lib/navigation-preference';

/** One controller shared by the workspace and its browser regression harness. */
export function useSidebarPreference() {
  const [choice, setChoice] = useState({ collapsed: false, loaded: false });
  useEffect(() => {
    const compact = window.matchMedia('(min-width: 801px) and (max-width: 1150px)').matches;
    let collapsed = compact;
    try {
      collapsed = readSidebarPreference(window.localStorage, compact);
    } catch {
      // Access to localStorage itself can be blocked by browser privacy settings.
    }
    setChoice({ collapsed, loaded: true });
  }, []);
  useEffect(() => {
    if (!choice.loaded) return;
    try {
      saveSidebarPreference(window.localStorage, choice.collapsed);
    } catch {
      // Still allow this tab to collapse when storage is unavailable.
    }
  }, [choice]);
  const toggleSidebar = useCallback(() => {
    setChoice((previous) => ({ ...previous, collapsed: !previous.collapsed }));
  }, []);
  return { collapsed: choice.collapsed, toggleSidebar };
}
