'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createTimerSync } from '@/lib/timer-client';
export function useTimerSync(signedIn: boolean, signedOut: () => void) {
  const [snapshot, setSnapshot] = useState<any>(undefined);
  const [error, setError] = useState('');
  const sync = useRef<ReturnType<typeof createTimerSync> | null>(null);
  useEffect(() => {
    if (!signedIn) {
      setSnapshot(undefined);
      setError('');
      return;
    }
    const connection = createTimerSync({
      fetch: (...args) => fetch(...args),
      visible: () => document.visibilityState === 'visible',
      update: setSnapshot,
      error: setError,
      signedOut,
    });
    sync.current = connection;
    connection.refresh();
    document.addEventListener('visibilitychange', connection.refresh);
    window.addEventListener('focus', connection.refresh);
    return () => {
      connection.stop();
      sync.current = null;
      document.removeEventListener('visibilitychange', connection.refresh);
      window.removeEventListener('focus', connection.refresh);
    };
  }, [signedIn, signedOut]);
  const refresh = useCallback(() => sync.current?.refresh(), []);
  return { snapshot, error, refresh };
}
