'use client';
import { useState, useRef, useEffect } from 'react';
import { useApp } from './context';
import { useProductivity } from './productivity';
import { DateTimeInput } from './DateTimeInput';
import { formatTimestamp, formatDateTime } from '@/lib/format';
import { requestPlanning } from '@/lib/planning-client';
import { civilAt, civilRange } from '@/lib/planning-time';
import type { WorkItem } from '@/lib/planning-engine';
export function PlannedWorkRow({ block, compact = false }: { block: any; compact?: boolean }) {
  const { allData: d, reload, notify, go, open } = useApp(),
    { act, state } = useProductivity();
  const [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [recording, setRecording] = useState(false);
  const requestId = useRef<string | null>(null),
    zone = d.setting.timezone,
    session = d.studySession.find((s) => s.id === block.sessionId),
    task = d.task.find((t) => t.id === block.taskId);
  async function start() {
    if (busy) return;
    setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      await act('timer.start', {
        timer: {
          requestId: requestId.current,
          plannedBlockId: block.id,
          name: block.name,
          mode: 'countdown',
          focusMinutes: Math.min(
            240,
            Math.max(1, Math.ceil((block.endAt - block.startAt) / 60000)),
          ),
          breakMinutes: d.planning?.preference.restMinutes ?? 10,
          rounds: 1,
        },
      });
      requestId.current = null;
      go('/focus');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function change(action: string, extra: any = {}) {
    if (busy) return;
    setBusy(true);
    try {
      await requestPlanning(action, { id: block.id, revision: block.revision, ...extra });
      await reload();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={'planned-work-row' + (compact ? ' compact-plan' : '')}>
      <div className="grow">
        <strong>{block.name}</strong>
        <p className="muted">
          {formatTimestamp(block.startAt, zone)} – {formatTimestamp(block.endAt, zone)} ·{' '}
          {((block.endAt - block.startAt) / 3600000).toFixed(1)}h intended ·{' '}
          {block.state === 'reviewed'
            ? 'Reviewed'
            : block.locked
              ? 'Confirmed · fixed'
              : 'Confirmed'}
        </p>
        {session && (
          <p className="muted">
            {session.actualHours.toFixed(2)}h recorded at {formatDateTime(session.dueAt)} · intended
            time remains separate.
          </p>
        )}
        <div className="inline">
          {task && (
            <button
              type="button"
              className="text-button"
              onClick={() => open({ entity: 'task', row: task })}
            >
              Task details
            </button>
          )}
          {block.assignmentId && (
            <button
              type="button"
              className="text-button"
              onClick={() => go('/assignments/' + block.assignmentId)}
            >
              Open assignment
            </button>
          )}
          {block.examId && (
            <button
              type="button"
              className="text-button"
              onClick={() => go('/exams/' + block.examId)}
            >
              Open exam
            </button>
          )}
        </div>
      </div>
      {block.state === 'planned' && (
        <div className="planned-work-actions">
          <button
            type="button"
            className="button primary"
            disabled={busy || !!state?.timer}
            onClick={start}
          >
            Start planned session
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || block.locked}
            onClick={() => setEditing(true)}
          >
            Edit / reschedule
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => change('block.lock', { locked: !block.locked })}
          >
            {block.locked ? 'Unlock session' : 'Keep fixed'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  'Remove this planned allocation? Tasks and recorded study history will remain.',
                )
              )
                change('block.dismiss');
            }}
          >
            Remove plan
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setRecording(true)}
          >
            Record reviewed work
          </button>
        </div>
      )}
      {block.endAt - block.startAt > 240 * 60000 && block.state === 'planned' && (
        <p className="muted">
          The existing timer supports up to 240 minutes per countdown. This starts a 240-minute
          segment; the full intended allocation remains recorded separately.
        </p>
      )}
      {editing && <PlannedWorkEditor id={block.id} close={() => setEditing(false)} />}{' '}
      {recording && <PlannedWorkReview block={block} close={() => setRecording(false)} />}
    </div>
  );
}
export function PlannedWorkEditor({ id, close }: { id: string; close: () => void }) {
  const { allData: d, reload } = useApp(),
    zone = d.setting.timezone,
    ref = useRef<HTMLDialogElement>(null),
    pending = useRef<any>(null);
  const [context, setContext] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    let cancelled = false;
    requestPlanning('block.context', { id })
      .then((value) => {
        if (!cancelled) {
          setContext(value);
          setDraft({
            name: value.block.name,
            workKey: value.block.workKey ?? null,
            start: civilAt(value.block.startAt, zone),
            end: civilAt(value.block.endAt, zone),
            override: value.block.origin === 'manual',
            locked: value.block.locked,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, zone]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !context) return;
    setBusy(true);
    setError('');
    try {
      pending.current ??= {
        requestId: crypto.randomUUID(),
        fingerprint: context.fingerprint,
        changes: [
          {
            id: 'edit-' + id,
            moveId: id,
            revision: context.block.revision,
            name: draft.name,
            workKey: draft.workKey,
            ...(() => {
              const times = civilRange(draft.start, draft.end, zone);
              return { startAt: times.start, endAt: times.end };
            })(),
            override: draft.override,
            locked: draft.locked,
          },
        ],
      };
      await requestPlanning('schedule.approve', pending.current);
      pending.current = null;
      try {
        await reload();
      } catch {}
      close();
    } catch (e: any) {
      if (e.status && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        setError(e.message);
      } else {
        setUncertain(!!pending.current);
        setError(
          pending.current
            ? 'Response interrupted. Retry this same edit before changing it.'
            : e.message,
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="editor assignment-dialog planned-work-editor"
      aria-labelledby="planned-editor-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !uncertain) close();
      }}
    >
      <header className="assignment-dialog-header">
        <h2 id="planned-editor-heading">Review planned session</h2>
        <p>Changes require approval and are checked against the current schedule.</p>
      </header>
      <form onSubmit={save}>
        <div className="assignment-dialog-body">
          {draft && (
            <fieldset className="availability-fieldset" disabled={busy || uncertain}>
              <div className="form-grid">
                <label className="field">
                  Session title
                  <input
                    required
                    maxLength={500}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Work
                  <select
                    value={draft.workKey ?? ''}
                    onChange={(e) => setDraft({ ...draft, workKey: e.target.value || null })}
                  >
                    <option value="">Reserved study time</option>
                    {draft.workKey &&
                      !context.items.some((w: WorkItem) => w.key === draft.workKey) && (
                        <option value={draft.workKey}>Original work (requires review)</option>
                      )}
                    {context.items.map((w: WorkItem) => (
                      <option key={w.key} value={w.key}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Starts
                  <DateTimeInput
                    type="datetime-local"
                    required
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                </label>
                <label className="field">
                  Ends
                  <DateTimeInput
                    type="datetime-local"
                    required
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={draft.override}
                    onChange={(e) => setDraft({ ...draft, override: e.target.checked })}
                  />
                  Explicit manual availability override
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={draft.locked}
                    onChange={(e) => setDraft({ ...draft, locked: e.target.checked })}
                  />
                  Keep fixed after approval
                </label>
              </div>
            </fieldset>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="assignment-dialog-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy || uncertain}
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !context || context.block.state !== 'planned'}
          >
            {uncertain ? 'Retry same edit' : 'Approve session changes'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
export function PlannedWorkReview({ block, close }: { block: any; close: () => void }) {
  const { allData: d, reload } = useApp(),
    ref = useRef<HTMLDialogElement>(null),
    pending = useRef<any>(null);
  const [hours, setHours] = useState('0'),
    [minutes, setMinutes] = useState('0'),
    [note, setNote] = useState(''),
    [actualStart, setActualStart] = useState(() => civilAt(Date.now(), d.setting.timezone)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="editor assignment-dialog planned-work-editor"
      aria-labelledby="planned-review-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !uncertain) close();
      }}
    >
      <header className="assignment-dialog-header">
        <h2 id="planned-review-heading">Review actual work</h2>
        <p>Enter only the work you actually did.</p>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const h = Number(hours),
              m = Number(minutes);
            if (
              !Number.isInteger(h) ||
              h < 0 ||
              h > 24 ||
              !Number.isFinite(m) ||
              m < 0 ||
              m >= 60 ||
              h * 60 + m > 1440
            )
              throw Error(
                'Enter whole hours and minutes from 0 to less than 60, up to 24 hours total.',
              );
            pending.current ??= {
              id: block.id,
              revision: block.revision,
              requestId: crypto.randomUUID(),
              actualStart,
              minutes: h * 60 + m,
              note,
            };
            await requestPlanning('block.record', pending.current);
            pending.current = null;
            try {
              await reload();
            } catch {}
            close();
          } catch (e: any) {
            if (e.status && e.status < 500) {
              pending.current = null;
              setUncertain(false);
              setError(e.message);
            } else {
              setUncertain(!!pending.current);
              setError(
                pending.current
                  ? 'Response interrupted. Retry this same recording before changing it.'
                  : e.message,
              );
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="assignment-dialog-body">
          <p className="planned-review-title">
            <strong>{block.name}</strong> · {((block.endAt - block.startAt) / 3600000).toFixed(1)}h
            intended.
          </p>
          <fieldset className="availability-fieldset" disabled={busy || uncertain}>
            <label className="field">
              Actual start
              <DateTimeInput
                type="datetime-local"
                required
                value={actualStart}
                onChange={(e) => setActualStart(e.target.value)}
              />
            </label>
            <div className="study-duration-fields">
              <label className="field">
                Hours
                <input
                  type="number"
                  required
                  min={0}
                  max={24}
                  step={1}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
              <label className="field">
                Minutes
                <input
                  type="number"
                  required
                  min={0}
                  max={59.99}
                  step="any"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Notes
              <textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            </label>
          </fieldset>
          <p className="muted">
            This saves one reviewed StudySession. It does not complete the Task or infer an exact
            remaining estimate. If a timer is active, use its existing End/review flow instead.
          </p>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="assignment-dialog-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy || uncertain}
            onClick={close}
          >
            Discard review
          </button>
          <button className="button primary" disabled={busy}>
            {uncertain ? 'Retry same recording' : 'Save actual work'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function PlannedWorkDetails({ id, close }: { id: string; close: () => void }) {
  const { allData: d } = useApp(),
    ref = useRef<HTMLDialogElement>(null),
    block = d.planning?.blocks.find((b) => b.id === id);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="editor assignment-dialog planned-work-editor"
      aria-labelledby="planned-detail-heading"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="assignment-dialog-header">
        <h2 id="planned-detail-heading">Confirmed study allocation</h2>
      </header>
      <div className="assignment-dialog-body">
        {block ? (
          <PlannedWorkRow block={block} />
        ) : (
          <p>This allocation no longer exists. Refresh to review current plans.</p>
        )}
      </div>
      <footer className="assignment-dialog-footer">
        <button className="button secondary" onClick={close}>
          Close
        </button>
      </footer>
    </dialog>
  );
}
