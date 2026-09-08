'use client';
import { DateTimeInput } from './DateTimeInput';
import { formatDate, formatTime, formatDateTime } from '@/lib/format';
import { useState } from 'react';
import { useProductivity } from './productivity';
import { recurrenceDescription, nextOccurrence } from '@/lib/recurrence-description';
export function RecurringTasks() {
  const { state, act, notify, now, allData: d } = useProductivity(),
    [row, setRow] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const begin = (r?: any) =>
    setRow(
      r
        ? { ...r }
        : {
            name: '',
            subjectId: null,
            assignmentId: null,
            priority: 'Medium',
            estimatedHours: 1,
            anchor: now.slice(0, 10),
            time: '17:00',
            intervalDays: 7,
            weekdays: '',
            weekInterval: 1,
            endDate: null,
            enabled: true,
          },
    );
  return (
    <section className="recurring-section" aria-labelledby="recurring-heading">
      <header className="recurring-heading">
        <h2 id="recurring-heading">Recurring tasks</h2>
        <p>One outstanding occurrence at a time. Completed occurrences remain in Tasks.</p>
      </header>
      <h3 className="recurring-list-heading">Your recurring series</h3>
      <div className="recurring-list">
        {(state?.recurrences ?? []).map((r: any) => {
          const outstanding = r.occurrences
            ?.map((o: any) => d.task.find((t) => t.id === o.taskId))
            .find((t: any) => t && t.status !== 'Completed');
          const next = nextOccurrence(r, [r.nextDate, now.slice(0, 10)].sort().at(-1)!);
          return (
            <article className="recurring-card" key={r.id}>
              <div className="recurring-description">
                <h3>{r.name}</h3>
                <p>{recurrenceDescription(r)}</p>
                <p className="recurring-subject">
                  {d.subject.find((s) => s.id === r.subjectId)?.code ?? 'Personal'}
                </p>
                <p className="recurring-next">
                  {outstanding
                    ? `Outstanding: ${outstanding.dueAt ? formatDateTime(outstanding.dueAt) : 'No date'}`
                    : r.enabled
                      ? next
                        ? `Next: ${formatDate(next)} · ${formatTime(r.time)}`
                        : 'Series finished'
                      : 'Future generation paused'}
                </p>
              </div>
              <span className="series-status">{r.enabled ? 'Active' : 'Paused'}</span>
              <div className="series-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => begin(r)}
                  aria-label={'Edit series ' + r.name}
                >
                  Edit
                </button>
                <button
                  className="button secondary danger-text"
                  disabled={busy}
                  aria-label={'Delete series ' + r.name}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete series “${r.name}”? No more occurrences will be generated. An untouched future task will be removed. Completed, overdue, edited, started and timer-linked tasks stay in Tasks as normal tasks.`,
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await act('recurrence.delete', { id: r.id, revision: r.revision });
                      if (row?.id === r.id) setRow(null);
                      notify(
                        'Series deleted. Retained tasks and completed history are still in Tasks.',
                      );
                    } catch (e: any) {
                      notify(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete series
                </button>
              </div>
            </article>
          );
        })}
        {!state?.recurrences?.length && (
          <div className="recurring-empty">
            <strong>No recurring tasks yet.</strong>
            <p>Create one for things you do every week or fortnight.</p>
          </div>
        )}
      </div>
      <button className="button secondary recurring-add" disabled={busy} onClick={() => begin()}>
        Add recurring task
      </button>
      {row && (
        <form
          className="recurring-editor"
          aria-label={row.id ? 'Edit recurring task' : 'Add recurring task'}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { id, revision, userId, nextDate, occurrences, ...recurrence } = row;
              await act('recurrence.save', { id, revision, recurrence });
              setRow(null);
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{row.id ? 'Edit recurring task' : 'Add recurring task'}</h3>
          <p>Changes affect future occurrences. Existing tasks can be edited separately.</p>
          <div className="form-grid">
            <label className="field">
              Task
              <input
                autoComplete="off"
                required
                maxLength={500}
                value={row.name}
                onChange={(e) => setRow({ ...row, name: e.target.value })}
              />
            </label>
            <label className="field">
              Repeat
              <select
                value={row.weekdays ? 'weekdays' : String(row.intervalDays)}
                onChange={(e) =>
                  setRow({
                    ...row,
                    weekdays: e.target.value === 'weekdays' ? '1,3,5' : '',
                    intervalDays: e.target.value === 'weekdays' ? 7 : Number(e.target.value),
                  })
                }
              >
                <option value="1">Daily</option>
                <option value="7">Weekly</option>
                <option value="14">Fortnightly</option>
                <option value="weekdays">Selected weekdays</option>
                {![1, 7, 14].includes(row.intervalDays) && (
                  <option value={row.intervalDays}>Every {row.intervalDays} days</option>
                )}
              </select>
            </label>
            {row.weekdays ? (
              <>
                <label className="field">
                  Weekdays
                  <select
                    multiple
                    value={row.weekdays.split(',')}
                    onChange={(e) =>
                      setRow({
                        ...row,
                        weekdays:
                          Array.from(e.target.selectedOptions, (o) => o.value).join(',') || '1',
                      })
                    }
                  >
                    {[
                      'Sunday',
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                    ].map((x, i) => (
                      <option key={i} value={i}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Every N weeks
                  <input
                    autoComplete="off"
                    type="number"
                    min={1}
                    max={52}
                    value={row.weekInterval}
                    onChange={(e) => setRow({ ...row, weekInterval: Number(e.target.value) })}
                  />
                </label>
              </>
            ) : (
              <label className="field">
                Custom interval (days)
                <input
                  autoComplete="off"
                  type="number"
                  min={1}
                  max={365}
                  value={row.intervalDays}
                  onChange={(e) => setRow({ ...row, intervalDays: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="field">
              Start date
              <DateTimeInput
                autoComplete="off"
                type="date"
                required
                value={row.anchor}
                onChange={(e) => setRow({ ...row, anchor: e.target.value })}
              />
            </label>
            <label className="field">
              Due time
              <DateTimeInput
                autoComplete="off"
                type="time"
                required
                value={row.time}
                onChange={(e) => setRow({ ...row, time: e.target.value })}
              />
            </label>
            <label className="field">
              End date (optional)
              <DateTimeInput
                autoComplete="off"
                type="date"
                value={row.endDate ?? ''}
                onChange={(e) => setRow({ ...row, endDate: e.target.value || null })}
              />
            </label>
            <label className="field">
              Subject
              <select
                value={row.subjectId ?? ''}
                onChange={(e) => setRow({ ...row, subjectId: e.target.value || null })}
              >
                <option value="">Personal</option>
                {d.subject.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Assignment
              <select
                value={row.assignmentId ?? ''}
                onChange={(e) =>
                  setRow({
                    ...row,
                    assignmentId: e.target.value || null,
                    subjectId:
                      d.assignment.find((a) => a.id === e.target.value)?.subjectId ?? row.subjectId,
                  })
                }
              >
                <option value="">None</option>
                {d.assignment.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Priority
              <select
                value={row.priority}
                onChange={(e) => setRow({ ...row, priority: e.target.value })}
              >
                {['Low', 'Medium', 'High', 'Critical'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Estimated hours
              <input
                autoComplete="off"
                type="number"
                min={0}
                max={1000}
                step="any"
                value={row.estimatedHours}
                onChange={(e) => setRow({ ...row, estimatedHours: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="recurring-generation">
            <label className="check-label">
              <input
                autoComplete="off"
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => setRow({ ...row, enabled: e.target.checked })}
              />
              Generate future occurrences
            </label>
          </div>
          <footer className="recurring-editor-actions">
            <button className="button primary" disabled={busy}>
              Save series
            </button>
            <button
              type="button"
              disabled={busy}
              className="button secondary"
              onClick={() => setRow(null)}
            >
              Cancel
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
