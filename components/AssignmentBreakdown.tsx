'use client';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import { DateTimeInput } from './DateTimeInput';
import {
  breakdownTemplates,
  readBreakdownDraft,
  selectedBreakdownTasks,
  moveBreakdownTask,
  breakdownDraftValid,
  type BreakdownDraft,
} from '@/lib/assignment-breakdown';
import { todoRequestId } from '@/lib/todo-request-id';
import { postTaskWorkflow, TaskWorkflowError } from '@/lib/task-workflow-client';
import type { RecordRow } from '@/lib/model';

export function ManualProgressNotice({ assignment }: { assignment?: RecordRow }) {
  const { allData } = useApp();
  if (!assignment || allData.task.some((t) => t.assignmentId === assignment.id)) return null;
  return (
    <div className="workflow-notice">
      <p>
        Linked tasks will determine assignment progress based on completion and estimated workload.
      </p>
      <details>
        <summary>How progress changes</summary>
        <p>
          Manual progress is currently {assignment.progress}%. The first linked task switches to
          estimate-weighted completion; unestimated tasks count as one. Your manual value is
          retained. Submitted assignments remain at 100%.
        </p>
      </details>
    </div>
  );
}
export function AssignmentBreakdown({
  assignment,
  close,
}: {
  assignment: RecordRow;
  close: () => void;
}) {
  const { reload, notify, go } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = 'student-assignment-draft:' + assignment.id;
  const [draft, setDraft] = useState<{
    requestId: string;
    rows: BreakdownDraft[];
    attempted: boolean;
  }>(() => ({ requestId: todoRequestId(), rows: [], attempted: false }));
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [template, setTemplate] = useState<keyof typeof breakdownTemplates>('General assignment');
  useEffect(() => {
    dialog.current?.showModal();
    try {
      const stored = readBreakdownDraft(sessionStorage, storageKey);
      if (stored) setDraft(stored);
    } catch {
      /* Empty draft is safe; nothing is automatically submitted. */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* In-memory retry remains idempotent; refresh never auto-submits. */
    }
  }, [draft, loaded, storageKey]);
  const locked = busy || draft.attempted;
  const selected = draft.rows.filter((r) => r.selected);
  function newRow(name = ''): BreakdownDraft {
    return {
      key: todoRequestId(),
      selected: true,
      name,
      notes: '',
      dueAt: '',
      estimatedHours: '',
      priority: assignment.priority || 'Medium',
      status: 'Not Started',
    };
  }
  function update(index: number, patch: Partial<BreakdownDraft>) {
    setDraft((d) => ({ ...d, rows: d.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !breakdownDraftValid(draft.rows)) return;
    setBusy(true);
    setError('');
    const pending = { ...draft, attempted: true };
    setDraft(pending);
    // Persist before issuing the request, so refresh/lost responses retain the same batch ID.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
    } catch {
      /* No automatic retry after refresh. */
    }
    try {
      await postTaskWorkflow({
        action: 'assignment.breakdown',
        assignmentId: assignment.id,
        requestId: draft.requestId,
        tasks: selectedBreakdownTasks(draft.rows),
      });
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* A retained draft retries the same IDs safely. */
      }
      await reload().catch(() => notify('Tasks saved. Reload to see them.'));
      go('/assignments/' + assignment.id);
      close();
    } catch (e: any) {
      setError(
        e.message +
          (e instanceof TaskWorkflowError && e.status === 400
            ? ''
            : ' Retry this same save before editing; it may already have succeeded.'),
      );
      if (e instanceof TaskWorkflowError && e.status === 400)
        setDraft((d) => ({ ...d, attempted: false }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor assignment-dialog breakdown-editor"
      aria-label="Assignment breakdown"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <form onSubmit={submit}>
        <header className="assignment-dialog-header">
          <h2>Break into tasks</h2>
          <p className="muted">Create manageable steps for this assignment.</p>
        </header>
        <div className="assignment-dialog-body">
          <p className="assignment-dialog-name">
            Assignment: <strong>{assignment.name}</strong>
          </p>
          <ManualProgressNotice assignment={assignment} />
          {!draft.attempted && (
            <div className="breakdown-methods">
              <label className="field">
                Choose a template (optional)
                <select
                  value={template}
                  disabled={busy}
                  onChange={(e) => setTemplate(e.target.value as keyof typeof breakdownTemplates)}
                >
                  {Object.keys(breakdownTemplates).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    draft.rows.length &&
                    !confirm('Replace this unsaved draft with editable suggestions?')
                  )
                    return;
                  setDraft((d) => ({
                    ...d,
                    rows: breakdownTemplates[template].map((name) => newRow(name)),
                  }));
                }}
              >
                Load suggestions
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || draft.rows.length >= 50}
                onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, newRow()] }))}
              >
                Add manual task
              </button>
            </div>
          )}
          <h3 className="breakdown-list-title">Your breakdown</h3>
          <fieldset disabled={locked} className="breakdown-fields">
            <legend className="sr-only">Editable task suggestions</legend>
            {draft.rows.map((row, index) => (
              <article className="breakdown-row" key={row.key}>
                <div className="breakdown-row-head">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) => update(index, { selected: e.target.checked })}
                    />
                    Include task {index + 1}
                  </label>
                  <div className="inline">
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Move task ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() =>
                        setDraft((d) => ({ ...d, rows: moveBreakdownTask(d.rows, index, -1) }))
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Move task ${index + 1} down`}
                      disabled={index === draft.rows.length - 1}
                      onClick={() =>
                        setDraft((d) => ({ ...d, rows: moveBreakdownTask(d.rows, index, 1) }))
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Remove unsaved task ${index + 1}`}
                      onClick={() =>
                        setDraft((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== index) }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <fieldset disabled={!row.selected} className="breakdown-fields">
                  <label className="field">
                    Task title{row.selected ? ' (required)' : ''}
                    <input
                      required={row.selected}
                      maxLength={500}
                      value={row.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                    />
                  </label>
                  <details className="more-fields">
                    <summary>Task details (optional)</summary>
                    <div className="form-grid">
                      <label className="field">
                        Due date and time
                        <DateTimeInput
                          type="datetime-local"
                          value={row.dueAt}
                          onChange={(e) => update(index, { dueAt: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Estimated hours
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={10000}
                          step="any"
                          value={row.estimatedHours}
                          placeholder="No estimate"
                          onChange={(e) => update(index, { estimatedHours: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Priority
                        <select
                          value={row.priority}
                          onChange={(e) => update(index, { priority: e.target.value })}
                        >
                          {['Low', 'Medium', 'High', 'Critical'].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Status
                        <select
                          value={row.status}
                          onChange={(e) => update(index, { status: e.target.value })}
                        >
                          {['Not Started', 'In Progress', 'Completed'].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field full">
                        Description / notes
                        <textarea
                          maxLength={20000}
                          value={row.notes}
                          onChange={(e) => update(index, { notes: e.target.value })}
                        />
                      </label>
                    </div>
                  </details>
                </fieldset>
              </article>
            ))}
          </fieldset>
          {!draft.rows.length && (
            <p className="muted">
              Add your own steps or load a template. Nothing is created until you save.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {selected.length > 0 && !breakdownDraftValid(draft.rows) && (
            <p className="muted">
              Give each selected task a title and valid optional details before saving.
            </p>
          )}
          <p className="muted breakdown-save-note">
            Only selected tasks are saved. Cancel leaves your assignment intact.
          </p>
        </div>
        <footer className="assignment-dialog-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            {draft.attempted ? 'Close (keep pending draft)' : 'Cancel'}
          </button>
          <button
            className="button primary"
            disabled={busy || !loaded || !breakdownDraftValid(draft.rows)}
          >
            {busy
              ? 'Saving…'
              : draft.attempted
                ? 'Retry same save'
                : `Save ${selected.length} tasks`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
