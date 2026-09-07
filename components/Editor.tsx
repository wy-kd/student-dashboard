'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { defaults, fields, labels, type Entity, type RecordRow } from '@/lib/model';
import { useApp, titleFor, type Editor as EditorType } from './context';
export function Editor({ editor, close }: { editor: EditorType; close: () => void }) {
  const { allData, save, now } = useApp();
  const { entity, row, prefill } = editor;
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, any>>(() => ({
    ...defaults(entity),
    ...Object.fromEntries(
      fields[entity]
        .filter((f) => f.type === 'date' && f.required)
        .map((f) => [f.key, now.slice(0, 10)]),
    ),
    ...Object.fromEntries(
      fields[entity]
        .filter((f) => f.type === 'datetime-local')
        .map((f) => [f.key, now.slice(0, 10) + 'T17:00']),
    ),
    ...prefill,
    ...row,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await save(entity, values, row);
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function control(f: (typeof fields)[Entity][number]) {
    const val = values[f.key] ?? '';
    const id = 'field-' + f.key;
    const change = (v: any) =>
      setValues((prev) => {
        const n = { ...prev, [f.key]: v };
        if (f.key === 'assignmentId' && v) {
          n.examId = '';
          if ('subjectId' in n)
            n.subjectId = allData.assignment.find((a) => a.id === v)?.subjectId ?? '';
        }
        if (f.key === 'examId' && v) {
          n.assignmentId = '';
          if ('subjectId' in n) n.subjectId = allData.exam.find((a) => a.id === v)?.subjectId ?? '';
        }
        return n;
      });
    return (
      <label key={f.key} htmlFor={id} className={f.type === 'textarea' ? 'field full' : 'field'}>
        <span>
          {f.label}
          {f.required && <b aria-hidden="true"> *</b>}
        </span>
        {f.type === 'textarea' ? (
          <textarea
            id={id}
            value={val}
            onChange={(e) => change(e.target.value)}
            rows={3}
            maxLength={20000}
          />
        ) : f.type === 'select' ? (
          <select
            id={id}
            required={f.required}
            value={val}
            onChange={(e) => change(f.key === 'day' ? Number(e.target.value) : e.target.value)}
          >
            {(f.relation || !f.required) && !f.options && (
              <option value="">Choose {f.label.toLowerCase()}</option>
            )}
            {f.relation
              ? allData[f.relation].map((r) => (
                  <option key={r.id} value={r.id}>
                    {titleFor(f.relation!, r, allData)}
                    {r.subjectId
                      ? ' · ' + (allData.subject.find((s) => s.id === r.subjectId)?.code ?? '')
                      : ''}
                  </option>
                ))
              : f.options?.map((o, i) => (
                  <option key={o} value={f.key === 'day' ? i : o}>
                    {o}
                  </option>
                ))}
          </select>
        ) : f.type === 'checkbox' ? (
          <input
            id={id}
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => change(e.target.checked)}
          />
        ) : (
          <input
            id={id}
            type={f.type ?? 'text'}
            value={val}
            required={f.required}
            min={f.min}
            max={f.max}
            step={
              ['difficulty', 'confidence', 'duration', 'teachingWeeks', 'week'].includes(f.key)
                ? 1
                : 'any'
            }
            maxLength={500}
            onChange={(e) =>
              change(
                f.type === 'number'
                  ? e.target.value === ''
                    ? ''
                    : Number(e.target.value)
                  : e.target.value,
              )
            }
          />
        )}
        {f.hint && <small>{f.hint}</small>}
      </label>
    );
  }
  const essentials = fields[entity].filter(
    (f) =>
      f.required ||
      ['dueAt', 'weighting', 'score', 'maximum', 'plannedHours'].includes(f.key) ||
      (entity === 'grade' && ['assignmentId', 'examId'].includes(f.key)),
  );
  const extra = fields[entity].filter((f) => !essentials.includes(f));
  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-label={(row ? 'Edit ' : 'New ') + labels[entity]}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-head">
          <div>
            <p className="eyebrow">{row ? 'MAKE AN UPDATE' : 'QUICK ADD'}</p>
            <h2>
              {row ? 'Edit' : 'New'} {labels[entity].toLowerCase()}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close editor"
            onClick={close}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        {(entity === 'task' || entity === 'studySession' || entity === 'grade') && (
          <p className="muted">
            Link an assignment or an exam. The subject follows your selection.
          </p>
        )}
        {entity === 'assignment' && (
          <p className="muted">
            Task completion controls progress when tasks are linked. Manual progress applies when
            there are no tasks.
          </p>
        )}
        {entity === 'exam' && (
          <p className="muted">
            Revision topics control progress when added. Use manual progress before adding topics.
          </p>
        )}
        <div className="form-grid">{essentials.map(control)}</div>
        {extra.length > 0 && (
          <details className="more-fields" open={!!row}>
            <summary>More details</summary>
            <div className="form-grid">{extra.map(control)}</div>
          </details>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Create ' + labels[entity].toLowerCase()}
          </button>
        </div>
      </form>
    </dialog>
  );
}
