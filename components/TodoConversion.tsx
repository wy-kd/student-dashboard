'use client';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import { DateTimeInput } from './DateTimeInput';
import { ManualProgressNotice } from './AssignmentBreakdown';
import { postTaskWorkflow, TaskWorkflowError } from '@/lib/task-workflow-client';
import type { TodoRow } from '@/lib/todos';
export function TodoConversion({ todo, close }: { todo: TodoRow; close: () => void }) {
  const { allData: d, reload, notify } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(todo.name),
    [subjectId, setSubject] = useState(''),
    [assignmentId, setAssignment] = useState(''),
    [dueAt, setDue] = useState(todo.dueDate ? todo.dueDate + 'T17:00' : ''),
    [estimate, setEstimate] = useState(''),
    [priority, setPriority] = useState('Medium'),
    [status, setStatus] = useState(todo.completed ? 'Completed' : 'Not Started'),
    [notes, setNotes] = useState(''),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const assignment = d.assignment.find((a) => a.id === assignmentId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setAttempted(true);
    setError('');
    try {
      await postTaskWorkflow({
        action: 'todo.convert',
        todoId: todo.id,
        revision: todo.revision,
        task: {
          name,
          subjectId: subjectId || null,
          assignmentId: assignmentId || null,
          dueAt: dueAt || null,
          estimatedHours: estimate === '' ? 0 : Number(estimate),
          priority,
          status,
          notes,
        },
      });
      try {
        await reload();
        notify('Converted to Task.');
      } catch {
        notify('Converted. Reload to see the task.');
      }
      close();
    } catch (error: any) {
      setError(error.message);
      if (error instanceof TaskWorkflowError && [400, 409].includes(error.status))
        setAttempted(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-label="Convert to Task"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <form onSubmit={submit}>
        <h2>Convert to Task</h2>
        <p className="muted">
          The To-do is removed only after the structured Task is safely created. Its completion
          state is prefilled below.
        </p>
        <ManualProgressNotice assignment={assignment} />
        <fieldset disabled={busy || attempted} className="breakdown-fields">
          <div className="form-grid">
            <label className="field full">
              Task title (required)
              <input
                value={name}
                required
                maxLength={500}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Subject (optional)
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setAssignment('');
                }}
              >
                <option value="">Standalone</option>
                {d.subject.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Assignment (optional)
              <select
                value={assignmentId}
                onChange={(e) => {
                  setAssignment(e.target.value);
                  const a = d.assignment.find((a) => a.id === e.target.value);
                  if (a) setSubject(a.subjectId);
                }}
              >
                <option value="">No assignment</option>
                {d.assignment
                  .filter((a) => !subjectId || a.subjectId === subjectId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Due date and time (optional)
              <DateTimeInput
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <label className="field">
              Estimated hours (optional)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={10000}
                step="any"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </label>
            <label className="field">
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['Low', 'Medium', 'High', 'Critical'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {['Not Started', 'In Progress', 'Completed'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field full">
              Description / notes (optional)
              <textarea
                value={notes}
                maxLength={20000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
            {attempted && ' Retry the same conversion before editing; it may have succeeded.'}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Converting…' : attempted ? 'Retry conversion' : 'Create Task'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
