'use client';
import { useApp } from './context';
export function useProductivity() {
  const app = useApp();
  return {
    ...app,
    state: app.allData.productivity,
    act: async (action: string, values: Record<string, unknown> = {}) => {
      const response = await fetch('/api/productivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...values }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not save. Please try again.');
      await app.reload();
      return body;
    },
  };
}
