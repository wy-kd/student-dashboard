'use client';
import { useState } from 'react';
import { useProductivity } from './productivity';
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
    <details className="more-fields">
      <summary>Recurring tasks</summary>
      <p>
        One outstanding task per series. Completed occurrences stay in Tasks. Edits here affect
        future occurrences; use the task editor for this occurrence.
      </p>
      {(state?.recurrences ?? []).map((r: any) => (
        <div className="spread" key={r.id}>
          <span>
            {r.name} · {r.enabled ? 'Active' : 'Paused'}
          </span>
          <button className="text-button" onClick={() => begin(r)}>
            Edit future occurrences
          </button>
        </div>
      ))}
      <button className="button secondary" onClick={() => begin()}>
        Add recurring task
      </button>
      {row && (
        <form
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
          <div className="form-grid">
            <label className="field">
              Task
              <input
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
              <input
                type="date"
                required
                value={row.anchor}
                onChange={(e) => setRow({ ...row, anchor: e.target.value })}
              />
            </label>
            <label className="field">
              Due time
              <input
                type="time"
                required
                value={row.time}
                onChange={(e) => setRow({ ...row, time: e.target.value })}
              />
            </label>
            <label className="field">
              End date (optional)
              <input
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
                type="number"
                min={0}
                max={1000}
                step="any"
                value={row.estimatedHours}
                onChange={(e) => setRow({ ...row, estimatedHours: Number(e.target.value) })}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => setRow({ ...row, enabled: e.target.checked })}
              />
              Generate future occurrences
            </label>
          </div>
          <button className="button primary" disabled={busy}>
            Save series
          </button>
          <button type="button" className="text-button" onClick={() => setRow(null)}>
            Cancel
          </button>
        </form>
      )}
    </details>
  );
}
