'use client';
import { useEffect, useRef, useState } from 'react';
import { useProductivity } from './productivity';
import { todoRequestId } from '@/lib/todo-request-id';
export function QuickCapture({
  onState,
}: {
  onState?: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const { act, notify } = useProductivity(),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  const submitting = useRef(false),
    pending = useRef<{ requestId: string; name: string } | null>(null);
  useEffect(() => {
    onState?.({ dirty: !!name.trim(), busy: busy || uncertain });
  }, [onState, name, busy, uncertain]);
  return (
    <form
      className="quick-capture"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current || !name.trim()) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        setSaved('');
        pending.current ??= { name: name.trim(), requestId: todoRequestId() };
        try {
          await act('capture', pending.current);
          pending.current = null;
          setName('');
          setUncertain(false);
          setSaved('Captured in Inbox.');
          notify('Captured in Inbox.');
        } catch (e: any) {
          if (e.status && e.status < 500) {
            pending.current = null;
            setUncertain(false);
            setError(e.message);
          } else {
            setUncertain(true);
            setError('Capture response interrupted. Retry the same capture to avoid a duplicate.');
          }
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Capture to Inbox
        <input
          autoComplete="off"
          placeholder="What do you need to remember?"
          maxLength={500}
          required
          value={name}
          disabled={busy || uncertain}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
            setSaved('');
          }}
        />
      </label>
      <button className="button primary" disabled={busy || !name.trim()}>
        {busy ? 'Saving…' : uncertain ? 'Retry same capture' : 'Capture'}
      </button>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {saved && <p role="status">{saved}</p>}
    </form>
  );
}
