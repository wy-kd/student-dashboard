'use client';
import { createContext, useContext, useReducer, useRef } from 'react';
import { quickEditReducer } from '@/lib/task-workspace';
function useController() {
  const [state, dispatch] = useReducer(quickEditReducer, { active: null, busy: false });
  const current = useRef(state),
    dirty = useRef(false);
  current.current = state;
  function send(action: Parameters<typeof quickEditReducer>[1]) {
    current.current = quickEditReducer(current.current, action);
    dispatch(action);
  }
  return {
    ...state,
    begin(id: string) {
      if (current.current.busy) return false;
      if (
        current.current.active &&
        current.current.active !== id &&
        dirty.current &&
        !confirm('Discard the unsaved quick edits?')
      )
        return false;
      if (current.current.active !== id) dirty.current = false;
      send({ type: 'begin', id });
      return true;
    },
    close() {
      dirty.current = false;
      send({ type: 'close' });
    },
    leave() {
      if (current.current.busy) return false;
      if (current.current.active && dirty.current && !confirm('Discard the unsaved quick edits?'))
        return false;
      dirty.current = false;
      send({ type: 'close' });
      return true;
    },
    changed() {
      dirty.current = true;
    },
    startSaving() {
      if (current.current.busy) return false;
      send({ type: 'busy', busy: true });
      return true;
    },
    saving(busy: boolean) {
      send({ type: 'busy', busy });
    },
  };
}
const QuickEditContext = createContext<ReturnType<typeof useController> | null>(null);
export function QuickEditScope({ children }: { children: React.ReactNode }) {
  const value = useController();
  return <QuickEditContext.Provider value={value}>{children}</QuickEditContext.Provider>;
}
export function useQuickEdit() {
  const shared = useContext(QuickEditContext),
    local = useController();
  return shared ?? local;
}
