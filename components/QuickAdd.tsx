'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import { useProductivity } from './productivity';
import { QuickCapture } from './QuickCapture';
import { DateTimeInput } from './DateTimeInput';
import { labels, type Entity } from '@/lib/model';
import { todoRequestId } from '@/lib/todo-request-id';
export function QuickAdd({
  close,
  context,
}: {
  close: () => void;
  context?: { route: string; id?: string };
}) {
  const { open, allData } = useApp(),
    ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'capture' | 'todo'>('capture'),
    [state, setState] = useState({ dirty: false, busy: false });
  const onState = useCallback((value: typeof state) => setState(value), []);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  function leave(action: () => void) {
    if (state.busy) return;
    if (state.dirty && !confirm('Discard this unsaved entry?')) return;
    action();
  }
  function create(entity: Entity) {
    leave(() => {
      let prefill: Record<string, any> = {};
      if (entity === 'task' && context?.id) {
        if (context.route === 'assignments') {
          const a = allData.assignment.find((x) => x.id === context.id);
          if (a) prefill = { assignmentId: a.id, subjectId: a.subjectId };
        }
        if (context.route === 'exams') {
          const a = allData.exam.find((x) => x.id === context.id);
          if (a) prefill = { examId: a.id, subjectId: a.subjectId };
        }
      }
      if (
        context?.route === 'subjects' &&
        context.id &&
        ['task', 'assignment', 'exam', 'class', 'studySession'].includes(entity)
      )
        prefill.subjectId = context.id;
      close();
      open({ entity, prefill });
    });
  }
  return (
    <dialog
      ref={ref}
      className="quick-add-dialog"
      aria-labelledby="quick-add-heading"
      onCancel={(e) => {
        e.preventDefault();
        leave(close);
      }}
    >
      <div className="dialog-head">
        <h2 id="quick-add-heading">Quick Add</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close Quick Add"
          disabled={state.busy}
          onClick={() => leave(close)}
        >
          ×
        </button>
      </div>
      <div className="quick-add-body">
        <div className="quick-add-actions">
          <button
            type="button"
            className="button secondary"
            disabled={state.busy}
            aria-pressed={mode === 'capture'}
            onClick={() => leave(() => setMode('capture'))}
          >
            Capture to Inbox
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={state.busy}
            onClick={() => create('task')}
          >
            New Academic Task
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={state.busy}
            aria-pressed={mode === 'todo'}
            onClick={() => leave(() => setMode('todo'))}
          >
            New To-do
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={state.busy}
            onClick={() => create('assignment')}
          >
            New Assignment
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={state.busy}
            onClick={() => create('exam')}
          >
            New Exam
          </button>
        </div>
        {mode === 'capture' ? (
          <>
            <p className="muted">
              Save a thought for later review. Capture does not change academic records.
            </p>
            <QuickCapture onState={onState} />
          </>
        ) : (
          <QuickTodo onState={onState} />
        )}
        <details className="more-fields">
          <summary>More record types</summary>
          <div className="quick-add-actions">
            {(
              [
                'class',
                'studySession',
                'importantDate',
                'subject',
                'semester',
                'grade',
                'weeklyContent',
              ] as Entity[]
            ).map((entity) => (
              <button
                type="button"
                className="button secondary"
                key={entity}
                disabled={state.busy}
                onClick={() => create(entity)}
              >
                {labels[entity]}
              </button>
            ))}
          </div>
        </details>
      </div>
    </dialog>
  );
}
function QuickTodo({ onState }: { onState: (state: { dirty: boolean; busy: boolean }) => void }) {
  const { act } = useProductivity(),
    [name, setName] = useState(''),
    [dueDate, setDueDate] = useState(''),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  const submitting = useRef(false),
    pending = useRef<any>(null);
  useEffect(() => {
    onState({ dirty: !!name.trim() || !!dueDate, busy: busy || uncertain });
  }, [onState, name, dueDate, busy, uncertain]);
  return (
    <form
      className="quick-todo"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current || !name.trim()) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        pending.current ??= {
          requestId: todoRequestId(),
          todo: { name: name.trim(), dueDate: dueDate || null },
        };
        try {
          await act('todo.create', pending.current);
          pending.current = null;
          setUncertain(false);
          setName('');
          setDueDate('');
          setSaved('To-do saved. No Academic Task was created.');
        } catch (e: any) {
          if (e.status && e.status < 500) {
            pending.current = null;
            setUncertain(false);
            setError(e.message);
          } else {
            setUncertain(true);
            setError('Response interrupted. Retry the same To-do.');
          }
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset className="availability-fieldset" disabled={busy || uncertain}>
        <label className="field">
          To-do
          <input
            required
            maxLength={500}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved('');
            }}
          />
        </label>
        <label className="field">
          Due date (optional)
          <DateTimeInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </fieldset>
      <button className="button primary" disabled={busy || !name.trim()}>
        {uncertain ? 'Retry same To-do' : busy ? 'Saving…' : 'Create To-do'}
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
