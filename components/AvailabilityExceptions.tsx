'use client';
import { useRef, useState } from 'react';
import { useApp } from './context';
import { DateTimeInput } from './DateTimeInput';
import { requestPlanning } from '@/lib/planning-client';
import { formatTime } from '@/lib/format';
import { validDate } from '@/lib/validation';
export function longDate(value: string) {
  return validDate(value) && value.length === 10
    ? new Intl.DateTimeFormat('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
        .format(new Date(value + 'T12:00:00Z'))
        .replace(/^(\w+) /, '$1, ')
    : 'Choose a date';
}
type Period = { startTime: string; endTime: string };
type Result = { revision: number; date: string; windows: Period[] | null };
export function AvailabilityExceptions({
  revision,
  onSaved,
}: {
  revision: number;
  onSaved: (result: Result) => void;
}) {
  const { allData: d, reload } = useApp();
  const [date, setDate] = useState(''),
    [mode, setMode] = useState('available'),
    [windows, setWindows] = useState<Period[]>([{ startTime: '09:00', endTime: '12:00' }]),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  const pending = useRef(false);
  function edit(date: string) {
    if (dirty && !confirm('Discard the unsaved date-specific change?')) return false;
    const exception = d.planning?.exceptions.find((x) => x.date === date);
    setDate(date);
    setMode(exception ? (exception.windows.length ? 'available' : 'unavailable') : 'available');
    setWindows(
      exception?.windows.length
        ? structuredClone(exception.windows)
        : [{ startTime: '09:00', endTime: '12:00' }],
    );
    setDirty(!exception);
    setError('');
    setSaved('');
    return true;
  }
  function changed() {
    setDirty(true);
    setSaved('');
    setError('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      if (mode === 'available' && !windows.length)
        throw Error('Add at least one available period, or choose Unavailable all day.');
      const result = await requestPlanning('availability.exception', {
        revision,
        date,
        windows: mode === 'weekly' ? null : mode === 'unavailable' ? [] : windows,
      });
      onSaved(result);
      setDirty(false);
      setSaved(
        `Saved for ${longDate(date)}. ${mode === 'weekly' ? 'Uses the normal weekly schedule.' : 'Confirmed study sessions are unchanged.'}`,
      );
      try {
        await reload();
      } catch {
        setError(
          'Your change was saved, but the page could not refresh. Refresh to see the latest schedule.',
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="availability-exceptions" aria-label="Date-specific availability">
      <h3>Date-specific changes</h3>
      <p className="muted">
        Change your usual availability for a particular date, such as an appointment, holiday or
        extra study day.
      </p>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="availability-fieldset">
          <label className="field">
            Date
            <DateTimeInput
              type="date"
              required
              value={date}
              onChange={(e) => edit(e.target.value)}
            />
          </label>
          {date && (
            <>
              <p>
                <strong>{longDate(date)}</strong>
              </p>
              <label className="field">
                Availability on this date
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    changed();
                  }}
                >
                  <option value="available">Available at specific times</option>
                  <option value="unavailable">Unavailable all day</option>
                  <option value="weekly">Use normal weekly schedule</option>
                </select>
              </label>
              {mode === 'available' && (
                <>
                  {windows.map((w, i) => (
                    <div className="availability-window" key={i}>
                      {(['startTime', 'endTime'] as const).map((key) => (
                        <label className="field" key={key}>
                          {key === 'startTime' ? 'Start' : 'End'}
                          <input
                            type="time"
                            required
                            value={w[key]}
                            onChange={(e) => {
                              setWindows(
                                windows.map((x, n) =>
                                  n === i ? { ...x, [key]: e.target.value } : x,
                                ),
                              );
                              changed();
                            }}
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setWindows(windows.filter((_, n) => n !== i));
                          changed();
                        }}
                      >
                        Remove period
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setWindows([...windows, { startTime: '14:00', endTime: '17:00' }]);
                      changed();
                    }}
                  >
                    Add period
                  </button>
                </>
              )}
              <p className="muted" role="status">
                {dirty ? 'Unsaved change' : 'Save applies only to this date.'}
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setDirty(false);
                    setDate('');
                    setError('');
                    setSaved('');
                  }}
                >
                  Cancel date change
                </button>
                <button className="button primary">{busy ? 'Saving…' : 'Save date change'}</button>
              </div>
            </>
          )}
        </fieldset>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {saved && <p role="status">{saved}</p>}
      </form>
      <h4>Saved date-specific changes</h4>
      {!d.planning?.exceptions.length && <p className="muted">No date-specific changes saved.</p>}
      {[...(d.planning?.exceptions ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((exception) => (
          <div className="row" key={exception.date}>
            <div className="grow">
              <strong>{longDate(exception.date)}</strong>
              <p className="muted">
                {exception.windows.length
                  ? exception.windows
                      .map((w: Period) => `${formatTime(w.startTime)}–${formatTime(w.endTime)}`)
                      .join(', ')
                  : 'Unavailable all day'}
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => edit(exception.date)}
            >
              Edit date change
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (edit(exception.date)) {
                  setMode('weekly');
                  changed();
                }
              }}
            >
              Remove date change
            </button>
          </div>
        ))}
    </section>
  );
}
