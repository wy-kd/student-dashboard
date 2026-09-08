'use client';
import { useEffect, useRef, useState } from 'react';
import { useProductivity } from './productivity';
import { timerView, clockText } from '@/lib/timer';
import { SubjectTag } from './ui';
export function StudyTimer({
  compact = false,
  focus = false,
}: {
  compact?: boolean;
  focus?: boolean;
}) {
  const { state, act, allData: d, notify, go } = useProductivity();
  const t = state?.timer;
  const [clock, setClock] = useState(Date.now()),
    [mode, setMode] = useState('countdown'),
    [duration, setDuration] = useState(50),
    [rest, setRest] = useState(10),
    [rounds, setRounds] = useState(1),
    [link, setLink] = useState(''),
    [name, setName] = useState('Focused study'),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(''),
    [minutes, setMinutes] = useState(''),
    [complete, setComplete] = useState(false);
  const requestId = useRef<string | null>(null);
  const offset = useRef(0);
  useEffect(() => {
    offset.current = (state?.serverNow ?? Date.now()) - Date.now();
    setClock(Date.now() + offset.current);
  }, [state?.serverNow]);
  useEffect(() => {
    if (!t) return;
    const interval = setInterval(() => setClock(Date.now() + offset.current), 1000);
    return () => clearInterval(interval);
  }, [t?.id]);
  useEffect(() => {
    setMinutes(t?.status === 'review' ? String(Math.round(t.focusMs / 600) / 100) : '');
    setNote('');
    setComplete(false);
  }, [t?.id, t?.status]);
  async function run(action: string, values: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await act(action, { id: t?.id, revision: t?.revision, ...values });
      return true;
    } catch (e: any) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    requestId.current ??= crypto.randomUUID();
    const [kind, id] = link.split(':');
    const row = kind ? d[kind as 'task']?.find((x) => x.id === id) : null;
    if (
      await run('timer.start', {
        timer: {
          requestId: requestId.current,
          name: row?.name ?? name,
          mode,
          focusMinutes: duration,
          breakMinutes: rest,
          rounds,
          ...(id ? { [kind + 'Id']: id } : {}),
        },
      })
    )
      requestId.current = null;
  }
  if (!state) return <p>Loading timer…</p>;
  if (!t)
    return (
      <div className="study-timer">
        <div className="tabs" aria-label="Timer mode">
          {['countdown', 'stopwatch'].map((x) => (
            <button key={x} className={mode === x ? 'active' : ''} onClick={() => setMode(x)}>
              {x === 'countdown' ? 'Countdown' : 'Stopwatch'}
            </button>
          ))}
        </div>
        <div className="timer-digits">{mode === 'countdown' ? duration + ':00' : '00:00'}</div>
        {mode === 'countdown' && (
          <div className="timer-presets">
            {[25, 50, 90].map((n) => (
              <button
                className={'button ' + (duration === n ? 'secondary' : '')}
                key={n}
                onClick={() => {
                  setDuration(n);
                  setRest(n === 25 ? 5 : n === 50 ? 10 : 20);
                }}
              >
                {n} min
              </button>
            ))}
          </div>
        )}
        <details className="more-fields">
          <summary>Session options</summary>
          <div className="form-grid">
            <label className="field">
              Activity
              <input
                autoComplete="off"
                value={name}
                maxLength={500}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Link to
              <select value={link} onChange={(e) => setLink(e.target.value)}>
                <option value="">Standalone study</option>
                {(['subject', 'assignment', 'task', 'exam'] as const).map((kind) => (
                  <optgroup key={kind} label={kind}>
                    {d[kind]
                      .filter((x) => (kind === 'task' ? x.status !== 'Completed' : true))
                      .map((x) => (
                        <option key={x.id} value={kind + ':' + x.id}>
                          {x.code ? x.code + ' · ' : ''}
                          {x.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {mode === 'countdown' && (
              <>
                <label className="field">
                  Focus minutes
                  <input
                    autoComplete="off"
                    type="number"
                    min={1}
                    max={240}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  Break minutes
                  <input
                    autoComplete="off"
                    type="number"
                    min={0}
                    max={120}
                    value={rest}
                    onChange={(e) => setRest(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  Rounds
                  <input
                    autoComplete="off"
                    type="number"
                    min={1}
                    max={12}
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                  />
                </label>
              </>
            )}
          </div>
        </details>
        <button className="button primary" disabled={busy || !name.trim()} onClick={start}>
          Start Focus
        </button>
      </div>
    );
  const v = timerView(t, clock),
    task = d.task.find((x) => x.id === t.taskId),
    linkedTasks = d.task.filter((x) =>
      t.assignmentId ? x.assignmentId === t.assignmentId : t.examId ? x.examId === t.examId : false,
    ),
    next = linkedTasks.find((x) => x.status !== 'Completed' && x.id !== task?.id);
  if (t.status === 'review')
    return (
      <form
        className="study-timer"
        onSubmit={async (e) => {
          e.preventDefault();
          await run('timer.save', {
            completion: { minutes: Number(minutes), note, completeTask: complete },
          });
        }}
      >
        <h2>Session complete</h2>
        <p>{t.name}</p>
        <label className="field">
          Actual study minutes
          <input
            autoComplete="off"
            type="number"
            min={0}
            max={1440}
            step="any"
            value={minutes}
            required
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        {task && task.status !== 'Completed' && (
          <label className="check-label">
            <input
              autoComplete="off"
              type="checkbox"
              checked={complete}
              onChange={(e) => setComplete(e.target.checked)}
            />
            Mark “{task.name}” complete
          </label>
        )}
        <details className="more-fields">
          <summary>Add a quick note</summary>
          <textarea
            autoComplete="off"
            aria-label="Session note"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
        </details>
        <p className="muted">
          Saved once in Study sessions. Manual task and assessment hours stay separate.
        </p>
        <button className="button primary" disabled={busy}>
          Save session
        </button>
      </form>
    );
  return (
    <div className={'study-timer ' + (focus ? 'focus-timer' : '')}>
      <p className="eyebrow">
        {t.phase === 'break' ? 'Break' : t.status === 'paused' ? 'Paused' : 'Focus'}
        {t.mode === 'countdown' ? ` · Round ${t.round} of ${t.rounds}` : ''}
      </p>
      <div
        className="timer-digits"
        role="timer"
        aria-label={t.phase === 'break' ? 'Break time' : 'Study time'}
      >
        {clockText(v.remainingMs ?? v.elapsedMs)}
      </div>
      <SubjectTag id={t.subjectId ?? undefined} />
      <h2>{t.name}</h2>
      {task && <p>{task.name}</p>}
      {focus && linkedTasks.length > 0 && (
        <p>
          {linkedTasks.filter((x) => x.status === 'Completed').length} / {linkedTasks.length} tasks
          complete
        </p>
      )}
      {focus && next && <p className="muted">Next: {next.name}</p>}
      {v.complete && (
        <p role="status">
          {t.phase === 'focus' ? 'Focus round complete.' : 'Break complete.'} Choose when to
          continue.
        </p>
      )}
      <div className="timer-actions">
        {!v.complete && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => run(t.status === 'paused' ? 'timer.resume' : 'timer.pause')}
          >
            {t.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        {t.round < t.rounds && t.phase === 'focus' && v.complete && t.breakMinutes > 0 && (
          <button className="button secondary" disabled={busy} onClick={() => run('timer.break')}>
            Start break
          </button>
        )}
        {t.round < t.rounds && (v.complete || t.phase === 'break') && (
          <button className="button secondary" disabled={busy} onClick={() => run('timer.next')}>
            {t.phase === 'break' && !v.complete ? 'Skip break' : 'Next round'}
          </button>
        )}
        <button className="button primary" disabled={busy} onClick={() => run('timer.finish')}>
          Finish
        </button>
      </div>
      <div className="inline">
        {!focus && (
          <button className="text-button" onClick={() => go('/focus')}>
            Open Focus Mode
          </button>
        )}
        <button
          className="text-button muted"
          disabled={busy}
          onClick={() => {
            if (confirm('Cancel this timer without recording study time?')) run('timer.cancel');
          }}
        >
          Cancel timer
        </button>
      </div>
    </div>
  );
}
export function MiniTimer() {
  const { state, go, act, notify } = useProductivity(),
    t = state?.timer;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const offset = useRef(0);
  useEffect(() => {
    offset.current = (state?.serverNow ?? Date.now()) - Date.now();
    setNow(Date.now() + offset.current);
  }, [state?.serverNow]);
  useEffect(() => {
    if (!t) return;
    const interval = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(interval);
  }, [t?.id]);
  if (!t) return null;
  const v = timerView(t, now);
  async function run(action: string) {
    setBusy(true);
    try {
      await act(action, { id: t.id, revision: t.revision });
      if (action === 'timer.finish') go('/study');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="mini-timer" aria-label="Active study timer" data-state={t.status}>
      <button className="mini-timer-summary" onClick={() => go('/focus')} title="Open Focus Mode">
        <span className="mini-timer-title">
          <strong>{t.name}</strong>
          <span className="mini-timer-status">
            {t.status === 'review'
              ? 'Ready to save'
              : t.status === 'paused'
                ? 'Paused'
                : v.complete
                  ? 'Round complete'
                  : t.phase === 'break'
                    ? 'Break running'
                    : 'Running'}
          </span>
        </span>
        <span className="mini-timer-clock">
          <span className="mini-timer-mode">
            {t.mode === 'stopwatch' ? 'Elapsed' : 'Remaining'}
          </span>
          <span className="mini-timer-time" role="timer">
            {clockText(v.remainingMs ?? v.elapsedMs)}
          </span>
        </span>
      </button>
      <div className="mini-timer-controls">
        {t.status === 'review' ? (
          <button className="button primary" onClick={() => go('/study')}>
            Review & save
          </button>
        ) : (
          <>
            {!v.complete && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => run(t.status === 'paused' ? 'timer.resume' : 'timer.pause')}
              >
                {t.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}
            <button className="button primary" disabled={busy} onClick={() => run('timer.finish')}>
              End
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
export function FocusMode() {
  const { go } = useProductivity();
  return (
    <div className="focus-surface">
      <button className="button secondary" onClick={() => go('/study')}>
        Exit Focus Mode
      </button>
      <StudyTimer focus />
    </div>
  );
}
