'use client';
import { useRef, useState } from 'react';
import { useApp } from './context';
import { Section } from './ui';
import { AvailabilityExceptions } from './AvailabilityExceptions';
import { DateTimeInput } from './DateTimeInput';
import { availabilityDraft } from '@/lib/planning-availability';
import { requestPlanning } from '@/lib/planning-client';
import { civilAt } from '@/lib/planning-time';
import { formatTimestamp, formatTime } from '@/lib/format';
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Period = { startTime: string; endTime: string };
export function Availability() {
  const { allData: d, reload } = useApp();
  const [revision, setRevision] = useState(() => availabilityDraft(d.planning).revision);
  async function refreshSaved() {
    const response = await fetch('/api/planning', { cache: 'no-store' });
    if (!response.ok) throw Error('Could not reload saved availability.');
    const p = await response.json();
    setRevision(p.preference.revision);
    await reload();
  }
  return (
    <Section
      title="Study availability"
      sub="Choose when study is allowed. Classes, exams and confirmed study sessions already reserve time."
    >
      <div className="availability-sections">
        <WeeklyAvailability revision={revision} onSaved={setRevision} />
        <AvailabilityExceptions
          revision={revision}
          onSaved={(result) => setRevision(result.revision)}
        />
        <SessionPreferences revision={revision} onSaved={setRevision} />
        <Commitments />
        <SavedRevisionRefresh refresh={refreshSaved} />
      </div>
    </Section>
  );
}
function SavedRevisionRefresh({ refresh }: { refresh: () => Promise<void> }) {
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  return (
    <div className="availability-refresh">
      <p className="muted">
        Editing on another device? Reload saved settings before retrying. Open drafts are kept.
      </p>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          try {
            await refresh();
            setError('');
            setMessage('Saved settings reloaded. Review your draft before saving.');
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        Reload saved settings
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
function WeeklyAvailability({
  revision,
  onSaved,
}: {
  revision: number;
  onSaved: (revision: number) => void;
}) {
  const { allData: d, reload } = useApp();
  const [day, setDay] = useState<number | null>(null),
    [windows, setWindows] = useState<Period[]>([]),
    [copy, setCopy] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const pending = useRef(false);
  function open(day: number, clear = false) {
    if (dirty && !confirm('Discard unsaved weekly hours?')) return;
    setDay(day);
    setWindows(
      clear
        ? []
        : (d.planning?.windows ?? [])
            .filter((w) => w.day === day)
            .map(({ startTime, endTime }) => ({ startTime, endTime })),
    );
    setCopy([]);
    setDirty(clear);
    setError('');
    setMessage('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current || day === null) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await requestPlanning('availability.section', {
        section: 'weekly',
        revision,
        days: [day, ...copy].map((day) => ({ day, windows })),
      });
      onSaved(result.revision);
      setDirty(false);
      setDay(null);
      setMessage(`Weekly hours saved for ${[day, ...copy].map((x) => days[x]).join(', ')}.`);
      try {
        await reload();
      } catch {
        setError('Hours saved. Refresh to see the latest schedule.');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Weekly availability">
      <h3>Weekly availability</h3>
      <p className="muted">
        Hours are permission to study, not a commitment. Days without hours provide no study
        capacity.
      </p>
      {!d.planning?.windows.length && (
        <p className="notice">
          No weekly study hours configured. Add hours for the days you want to study, or use
          date-specific changes.
        </p>
      )}
      <div className="availability-week">
        {[1, 2, 3, 4, 5, 6, 0].map((key) => {
          const hours = (d.planning?.windows ?? []).filter((w) => w.day === key);
          return (
            <div className="availability-week-row" key={key}>
              <strong>{days[key]}</strong>
              <span className="muted">
                {hours.length
                  ? hours
                      .map((w) => `${formatTime(w.startTime)}–${formatTime(w.endTime)}`)
                      .join(', ')
                  : d.planning?.windows.length
                    ? 'Unavailable'
                    : 'No hours set'}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => open(key)}
              >
                {hours.length ? 'Edit' : 'Add hours'}
                <span className="sr-only"> for {days[key]}</span>
              </button>
              {hours.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => open(key, true)}
                >
                  Mark unavailable<span className="sr-only"> on {days[key]}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {day !== null && (
        <form onSubmit={save} className="availability-day" aria-label={`Edit ${days[day]}`}>
          <fieldset disabled={busy} className="availability-fieldset">
            <h4>{days[day]} hours</h4>
            {windows.length === 0 && (
              <p className="muted">Unavailable on this weekday after saving.</p>
            )}
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
                          windows.map((x, n) => (i === n ? { ...x, [key]: e.target.value } : x)),
                        );
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setWindows(windows.filter((_, n) => n !== i));
                    setDirty(true);
                  }}
                >
                  Remove period
                </button>
              </div>
            ))}
            <div className="inline">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setWindows([
                    ...windows,
                    {
                      startTime: windows.length ? '14:00' : '09:00',
                      endTime: windows.length ? '17:00' : '12:00',
                    },
                  ]);
                  setDirty(true);
                }}
              >
                Add period
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setWindows([]);
                  setDirty(true);
                }}
              >
                Clear hours
              </button>
            </div>
            <details className="more-fields">
              <summary>Copy these hours to other days</summary>
              <div className="availability-copy">
                {days.map(
                  (name, key) =>
                    key !== day && (
                      <label className="check" key={key}>
                        <input
                          type="checkbox"
                          checked={copy.includes(key)}
                          onChange={(e) => {
                            setCopy(
                              e.target.checked ? [...copy, key] : copy.filter((x) => x !== key),
                            );
                            setDirty(true);
                          }}
                        />
                        {name}
                      </label>
                    ),
                )}
              </div>
              <p className="muted">
                Saving replaces hours only for this day and the selected copy days.
              </p>
            </details>
            <p className="muted" role="status">
              {dirty ? 'Unsaved weekly hours' : 'Saved hours loaded'}
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setDay(null);
                  setDirty(false);
                  setError('');
                }}
              >
                Cancel weekly edit
              </button>
              <button className="button primary">{busy ? 'Saving…' : 'Save weekly hours'}</button>
            </div>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function SessionPreferences({
  revision,
  onSaved,
}: {
  revision: number;
  onSaved: (revision: number) => void;
}) {
  const { allData: d, reload } = useApp();
  const [draft, setDraft] = useState(() => availabilityDraft(d.planning).preferences),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const pending = useRef(false);
  return (
    <details className="more-fields">
      <summary>Study session preferences</summary>
      <p className="muted">
        Your daily study target ({d.setting.dailyHours}h) is a goal. It does not create free time.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            const result = await requestPlanning('availability.section', {
              section: 'preferences',
              revision,
              preferences: draft,
            });
            onSaved(result.revision);
            setDirty(false);
            setMessage('Session preferences saved.');
            try {
              await reload();
            } catch {
              setError('Preferences saved. Refresh to see the latest values.');
            }
          } catch (e: any) {
            setError(e.message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="availability-fieldset">
          <div className="form-grid">
            {(
              ['preferredMinutes', 'minimumMinutes', 'restMinutes', 'maxDailyMinutes'] as const
            ).map((key) => (
              <label className="field" key={key}>
                {
                  {
                    preferredMinutes: 'Preferred session (minutes)',
                    minimumMinutes: 'Minimum session (minutes)',
                    restMinutes: 'Rest between sessions (minutes)',
                    maxDailyMinutes: 'Maximum study per day (hours, optional)',
                  }[key]
                }
                <input
                  type="number"
                  min={key === 'restMinutes' ? 0 : key === 'maxDailyMinutes' ? 5 / 60 : 5}
                  max={key === 'maxDailyMinutes' ? 16 : key === 'restMinutes' ? 120 : 240}
                  step={key === 'maxDailyMinutes' ? 'any' : 1}
                  required={key !== 'maxDailyMinutes'}
                  value={
                    draft[key] === null
                      ? ''
                      : key === 'maxDailyMinutes'
                        ? draft[key]! / 60
                        : draft[key]
                  }
                  onChange={(e) => {
                    setDraft({
                      ...draft,
                      [key]:
                        e.target.value === '' && key === 'maxDailyMinutes'
                          ? null
                          : key === 'maxDailyMinutes'
                            ? Math.round(Number(e.target.value) * 60)
                            : Number(e.target.value),
                    });
                    setDirty(true);
                    setMessage('');
                  }}
                />
                <span className="muted">
                  {
                    {
                      preferredMinutes: 'The usual length to suggest.',
                      minimumMinutes: 'Avoid sessions that are too short to be useful.',
                      restMinutes: 'Keep a gap between study sessions.',
                      maxDailyMinutes: 'A hard limit when set; leave blank for no limit.',
                    }[key]
                  }
                </span>
              </label>
            ))}
          </div>
          <p role="status" className="muted">
            {dirty ? 'Unsaved preferences' : 'Current preferences'}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setDraft(availabilityDraft(d.planning).preferences);
                setDirty(false);
                setError('');
              }}
            >
              Reset preference draft
            </button>
            <button className="button primary">Save session preferences</button>
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
function Commitments() {
  const { allData: d, reload } = useApp(),
    empty = { name: '', start: '', end: '', fixed: true };
  const [draft, setDraft] = useState<any>(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function mutate(action: string, data: any) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestPlanning(action, data);
      setDraft(empty);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="more-fields">
      <summary>Appointments and other commitments</summary>
      <p>
        Classes and exams are recognised automatically. Add other occupied time here. Flexible
        commitments remain reserved until you explicitly edit them.
      </p>
      {(d.planning?.commitments ?? []).map((c) => (
        <div className="row" key={c.id}>
          <div className="grow">
            <strong>{c.name}</strong>
            <p className="muted">
              {formatTimestamp(c.startAt, d.setting.timezone)} –{' '}
              {formatTimestamp(c.endAt, d.setting.timezone)} · {c.fixed ? 'Fixed' : 'Flexible'}
            </p>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              setDraft({
                id: c.id,
                revision: c.revision,
                name: c.name,
                start: civilAt(c.startAt, d.setting.timezone),
                end: civilAt(c.endAt, d.setting.timezone),
                fixed: c.fixed,
              })
            }
          >
            Edit
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (confirm('Delete this commitment? Confirmed study plans remain unchanged.'))
                mutate('commitment.delete', { id: c.id, revision: c.revision });
            }}
          >
            Delete
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutate('commitment.save', draft);
        }}
      >
        <fieldset disabled={busy} className="availability-fieldset">
          <div className="form-grid">
            <label className="field">
              Commitment title
              <input
                required
                value={draft.name}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
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
                checked={draft.fixed}
                onChange={(e) => setDraft({ ...draft, fixed: e.target.checked })}
              />
              Fixed commitment
            </label>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setDraft(empty)}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {draft.id ? 'Save commitment' : 'Add commitment'}
          </button>
        </div>
      </form>
    </details>
  );
}
