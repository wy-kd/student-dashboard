'use client';
export { QuickCapture } from './QuickCapture';
import { QuickCapture } from './QuickCapture';
import { DateTimeInput } from './DateTimeInput';
import { useRef, useState } from 'react';
import { useProductivity } from './productivity';
import { Section, Empty } from './ui';
import { actionableInbox, defaultInboxReview } from '@/lib/inbox-state';
import { civilAt, instant } from '@/lib/planning-time';
import { formatDateTime, formatTimestamp } from '@/lib/format';
import { todoRequestId } from '@/lib/todo-request-id';
export function Inbox() {
  const { state, act, notify, allData: d, now, open, reload } = useProductivity();
  const [selected, setSelected] = useState<string | null>(null),
    [kind, setKind] = useState('task'),
    [draft, setDraft] = useState<any>({}),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [related, setRelated] = useState(''),
    [until, setUntil] = useState('');
  const pending = useRef<any>(null),
    submitting = useRef(false);
  const stamp = instant(now, d.setting.timezone),
    items = state?.inbox ?? [],
    actionable = actionableInbox<any>(items, stamp),
    waiting = items.filter((x: any) => x.state === 'snoozed' && x.snoozedUntil > stamp),
    history = items.filter((x: any) => ['archived', 'processed'].includes(x.state));
  const disabled = busy || uncertain;
  async function mutate(action: string, item: any, extra: any = {}) {
    if (submitting.current || uncertain) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await act(action, { id: item.id, revision: item.revision, ...extra });
      setSelected(null);
      setMessage(
        action === 'inbox.archive'
          ? 'Capture archived. No Task or To-do was created.'
          : action === 'inbox.snooze'
            ? 'Capture snoozed until your selected review time.'
            : 'Inbox updated.',
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function convert(item: any, e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    pending.current ??= {
      id: item.id,
      revision: item.revision,
      requestId: todoRequestId(),
      kind,
      ...(kind === 'task'
        ? { task: draft }
        : { todo: { name: draft.name, dueDate: draft.dueDate || null } }),
    };
    try {
      await act('inbox.convert', pending.current);
      pending.current = null;
      setUncertain(false);
      setSelected(null);
      setMessage(
        `Created ${kind === 'task' ? 'Academic Task' : 'To-do'}. Original capture retained in processed history.`,
      );
    } catch (e: any) {
      if (e.status && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        setError(e.message);
      } else {
        setUncertain(true);
        setError('Conversion response interrupted. Retry the same conversion before editing.');
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function review(item: any) {
    setSelected(item.id);
    setKind('task');
    setDraft({ name: item.name, notes: 'Original Inbox capture: ' + item.name });
    setRelated('');
    setUntil(civilAt(stamp + 86400000, d.setting.timezone));
    setError('');
    pending.current = null;
  }
  function renderItem(item: any) {
    const active = selected === item.id;
    return (
      <article className="inbox-item" key={item.id}>
        <div className="inbox-summary">
          <div className="grow">
            <strong>{item.name}</strong>
            <p className="muted">
              Captured {formatTimestamp(item.createdAt, d.setting.timezone)}
              {item.state === 'snoozed'
                ? ` · Review ${formatTimestamp(item.snoozedUntil, d.setting.timezone)}`
                : item.state === 'processed'
                  ? ` · Converted to ${item.processedType === 'todo' ? 'To-do' : 'Academic Task'}`
                  : item.state === 'archived'
                    ? ' · Archived'
                    : ''}
            </p>
          </div>
          <div className="inline">
            {!['archived', 'processed'].includes(item.state) && (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => review(item)}
                >
                  Review
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled}
                  onClick={() => mutate('inbox.archive', item)}
                >
                  Archive
                </button>
              </>
            )}
            {item.state === 'archived' && (
              <button
                type="button"
                className="button secondary"
                disabled={disabled}
                onClick={() => mutate('inbox.restore', item)}
              >
                Return to Inbox
              </button>
            )}
            {item.state === 'processed' &&
              item.processedType === 'task' &&
              d.task.some((x) => x.id === item.processedId) && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={disabled}
                  onClick={() =>
                    open({ entity: 'task', row: d.task.find((x) => x.id === item.processedId) })
                  }
                >
                  Open created Task
                </button>
              )}
            <button
              type="button"
              className="text-button muted"
              disabled={disabled}
              onClick={() => {
                if (confirm('Delete this capture? Any created Task or To-do is preserved.'))
                  mutate('inbox.delete', item);
              }}
            >
              Delete
            </button>
          </div>
        </div>
        {active && (
          <div className="inbox-review" aria-label="Review capture">
            <form onSubmit={(e) => convert(item, e)}>
              <fieldset disabled={disabled} className="availability-fieldset">
                <h3>Create a record</h3>
                <div className="form-grid">
                  <label className="field">
                    Create as
                    <select value={kind} onChange={(e) => setKind(e.target.value)}>
                      <option value="task">Academic Task</option>
                      <option value="todo">Quick To-do</option>
                    </select>
                  </label>
                  <label className="field">
                    Name
                    <input
                      required
                      maxLength={500}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Due date (optional)
                    <DateTimeInput
                      type={kind === 'todo' ? 'date' : 'datetime-local'}
                      value={kind === 'todo' ? (draft.dueDate ?? '') : (draft.dueAt ?? '')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [kind === 'todo' ? 'dueDate' : 'dueAt']: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                {kind === 'task' && (
                  <details className="more-fields">
                    <summary>Task options</summary>
                    <div className="form-grid">
                      <label className="field">
                        Subject (optional)
                        <select
                          value={draft.subjectId ?? ''}
                          onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}
                        >
                          <option value="">Personal / no subject</option>
                          {d.subject.map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Assignment (optional)
                        <select
                          value={draft.assignmentId ?? ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              assignmentId: e.target.value,
                              examId: '',
                              subjectId:
                                d.assignment.find((x) => x.id === e.target.value)?.subjectId ??
                                draft.subjectId,
                            })
                          }
                        >
                          <option value="">None</option>
                          {d.assignment.map((x) => (
                            <option value={x.id} key={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Exam (optional)
                        <select
                          value={draft.examId ?? ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              examId: e.target.value,
                              assignmentId: '',
                              subjectId:
                                d.exam.find((x) => x.id === e.target.value)?.subjectId ??
                                draft.subjectId,
                            })
                          }
                        >
                          <option value="">None</option>
                          {d.exam.map((x) => (
                            <option value={x.id} key={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Priority
                        <select
                          value={draft.priority ?? 'Medium'}
                          onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                        >
                          {['Low', 'Medium', 'High', 'Critical'].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Notes
                        <textarea
                          value={draft.notes ?? ''}
                          maxLength={20000}
                          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        />
                      </label>
                    </div>
                  </details>
                )}
              </fieldset>
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => setSelected(null)}
                >
                  Cancel review
                </button>
                <button className="button primary" disabled={busy}>
                  {uncertain
                    ? 'Retry same conversion'
                    : kind === 'task'
                      ? 'Create Academic Task'
                      : 'Create To-do'}
                </button>
              </div>
            </form>
            <details className="more-fields">
              <summary>Review an assignment announcement</summary>
              <p className="muted">
                Select the assignment, review its current deadline and explicitly save any change in
                the existing editor. This capture is retained.
              </p>
              <label className="field">
                Related assignment
                <select
                  disabled={disabled}
                  value={related}
                  onChange={(e) => setRelated(e.target.value)}
                >
                  <option value="">Choose assignment</option>
                  {d.assignment.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              {related && (
                <>
                  <p>
                    Current deadline:{' '}
                    {formatDateTime(d.assignment.find((x) => x.id === related)?.dueAt)}
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={disabled}
                    onClick={() =>
                      open({
                        entity: 'assignment',
                        row: d.assignment.find((x) => x.id === related),
                      })
                    }
                  >
                    Review and edit deadline
                  </button>
                </>
              )}
            </details>
            <details className="more-fields">
              <summary>Review later</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate('inbox.snooze', item, { until });
                }}
              >
                <label className="field">
                  Review after
                  <DateTimeInput
                    type="datetime-local"
                    required
                    disabled={disabled}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </label>
                <button className="button secondary" disabled={disabled}>
                  Snooze capture
                </button>
              </form>
            </details>
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            {!uncertain && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => reload().catch((e) => setError(e.message))}
              >
                Reload saved Inbox
              </button>
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inbox</h1>
          <p>Capture now. Review when you have a moment.</p>
        </div>
      </div>
      <QuickCapture />
      {message && <p role="status">{message}</p>}
      {error && !selected && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <Section
        title={`To review (${actionable.length})`}
        sub="Unprocessed captures, separate from notifications."
      >
        {actionable.map(renderItem)}
        {!actionable.length && (
          <Empty
            title="Nothing waiting"
            text="Capture a thought above. It does not need a subject or date yet."
          />
        )}
      </Section>
      {waiting.length > 0 && (
        <Section title={`Snoozed (${waiting.length})`}>{waiting.map(renderItem)}</Section>
      )}
      {history.length > 0 && (
        <details className="more-fields">
          <summary>Archived and processed ({history.length})</summary>
          {history.map(renderItem)}
        </details>
      )}
      <InboxReviewPreferences />
    </>
  );
}
function InboxReviewPreferences() {
  const { state, act } = useProductivity(),
    p = state?.inboxReview ?? defaultInboxReview;
  const [draft, setDraft] = useState(() => ({
      frequency: p.frequency,
      time: p.time,
      weekday: p.weekday,
    })),
    [revision, setRevision] = useState(p.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const pending = useRef(false);
  return (
    <details className="more-fields">
      <summary>Inbox review reminders · {p.frequency === 'off' ? 'Off' : p.frequency}</summary>
      <p className="muted">
        Optional reminders for changed outstanding captures. Quiet hours and private-push
        preferences apply. The same outstanding state is not repeatedly announced.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            await act('inbox.review-preferences', { revision, preference: draft });
            setRevision(revision + 1);
            setMessage('Inbox review preferences saved.');
          } catch (e: any) {
            setError(e.message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset className="availability-fieldset" disabled={busy}>
          <div className="form-grid">
            <label className="field">
              Review reminders
              <select
                value={draft.frequency}
                onChange={(e) => {
                  setDraft({ ...draft, frequency: e.target.value });
                  setMessage('');
                }}
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {draft.frequency !== 'off' && (
              <label className="field">
                Review time
                <input
                  type="time"
                  required
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </label>
            )}
            {draft.frequency === 'weekly' && (
              <label className="field">
                Review day
                <select
                  value={draft.weekday}
                  onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}
                >
                  {[
                    'Sunday',
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                  ].map((name, i) => (
                    <option value={i} key={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setDraft({ frequency: p.frequency, time: p.time, weekday: p.weekday });
                setRevision(p.revision);
                setError('');
              }}
            >
              Reset reminder draft
            </button>
            <button className="button primary">Save Inbox reminders</button>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
