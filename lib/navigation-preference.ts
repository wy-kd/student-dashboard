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
