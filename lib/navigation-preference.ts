const key = 'student-sidebar-collapsed';
export function readSidebarPreference(storage: Pick<Storage, 'getItem'>, compactDefault = false) {
  try {
    const saved = storage.getItem(key);
    return saved === null ? compactDefault : saved === 'true';
  } catch {
    return compactDefault;
  }
}
export function saveSidebarPreference(storage: Pick<Storage, 'setItem'>, collapsed: boolean) {
  try {
    storage.setItem(key, String(collapsed));
  } catch {
    /* Session layout still works. */
  }
}

export const sidebarScrollKey = (mode: 'desktop' | 'mobile') => 'student-sidebar-scroll-' + mode;
export function readSidebarScroll(storage: Pick<Storage, 'getItem'>, mode: 'desktop' | 'mobile') {
  try {
    const value = Number(storage.getItem(sidebarScrollKey(mode)) ?? 0);
    return Number.isFinite(value) && value >= 0 && value <= 1000000 ? value : 0;
  } catch {
    return 0;
  }
}
export function saveSidebarScroll(
  storage: Pick<Storage, 'setItem'>,
  mode: 'desktop' | 'mobile',
  value: number,
) {
  if (!Number.isFinite(value) || value < 0 || value > 1000000) return;
  try {
    storage.setItem(sidebarScrollKey(mode), String(value));
  } catch {
    /* Navigation remains usable without storage. */
  }
}
