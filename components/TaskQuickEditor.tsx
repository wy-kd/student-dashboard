'use client';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import { useQuickEdit } from './QuickEditScope';
import { DateTimeInput } from './DateTimeInput';
import { taskQuickDraft, taskQuickValues, cancelQuickEditKey } from '@/lib/task-workspace';
import type { RecordRow } from '@/lib/model';
export function TaskQuickEditor({ row, close }: { row: RecordRow; close(): void }) {
  const { save, open } = useApp(),
    editor = useQuickEdit();
  const [original] = useState(row),
    [draft, setDraft] = useState(() => taskQuickDraft(row)),
    [error, setError] = useState('');
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const change = (patch: Partial<typeof draft>) => {
    editor.changed();
    setDraft((d) => ({ ...d, ...patch }));
  };
  return (
    <form
      className="quick-editor task-quick-editor"
      aria-label={'Quick edit task ' + original.name}
      autoComplete="off"
      onKeyDown={(e) => cancelQuickEditKey(e, editor.busy, close)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!editor.startSaving()) return;
        setError('');
        try {
          await save('task', taskQuickValues(original, draft), original);
          editor.saving(false);
          close();
        } catch (e: any) {
          setError(e.message ?? 'Could not save. Your edits are still here.');
        } finally {
          editor.saving(false);
        }
      }}
    >
      <fieldset disabled={editor.busy} className="quick-editor-fields">
        <legend className="sr-only">Common task details</legend>
        <div className="quick-editor-grid">
          <label className="field full">
            Task name
            <input
              ref={title}
              required
              maxLength={500}
              value={draft.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label className="field">
            Due date (optional)
            <DateTimeInput
              type="date"
              value={draft.dueDate}
              onChange={(e) => change({ dueDate: e.target.value })}
            />
          </label>
          <label className="field">
            Due time
            <DateTimeInput
              type="time"
              disabled={!draft.dueDate}
              value={draft.dueTime}
              onChange={(e) => change({ dueTime: e.target.value })}
            />
          </label>
          <label className="field">
            Priority
            <select value={draft.priority} onChange={(e) => change({ priority: e.target.value })}>
              {['Low', 'Medium', 'High', 'Critical'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Status
            <select value={draft.status} onChange={(e) => change({ status: e.target.value })}>
              {['Not Started', 'In Progress', 'Completed'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <fieldset className="quick-duration full">
            <legend>Estimated time</legend>
            <div className="quick-duration-inputs">
              <label className="field">
                Hours
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  step={1}
                  required
                  value={draft.hours}
                  onChange={(e) => change({ hours: e.target.value, durationChanged: true })}
                />
              </label>
              <label className="field">
                Minutes
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={59.999999}
                  step="any"
                  required
                  value={draft.minutes}
                  onChange={(e) => change({ minutes: e.target.value, durationChanged: true })}
                />
              </label>
            </div>
          </fieldset>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error} Your unsaved input is retained. For a conflict, cancel and reopen to load the
          latest record.
        </p>
      )}
      <div className="quick-editor-actions">
        <button
          type="button"
          className="text-button"
          disabled={editor.busy}
          onClick={() => {
            if (editor.leave()) open({ entity: 'task', row });
          }}
        >
          More details
        </button>
        <button type="button" className="button secondary" disabled={editor.busy} onClick={close}>
          Cancel
        </button>
        <button className="button primary" disabled={editor.busy}>
          {editor.busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
