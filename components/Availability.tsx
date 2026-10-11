'use client';
import { useState } from 'react';
import { useApp } from './context';
import { Section } from './ui';
import { AvailabilityExceptions } from './AvailabilityExceptions';
import { DateTimeInput } from './DateTimeInput';
import { availabilityDraft } from '@/lib/planning-availability';
import { requestPlanning } from '@/lib/planning-client';
import { civilAt } from '@/lib/planning-time';
import { formatTimestamp } from '@/lib/format';
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function Availability() {
  const { allData: d, reload } = useApp();
  const [draft, setDraft] = useState(() => availabilityDraft(d.planning)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  function update(value: typeof draft) {
    setDraft(value);
    setSaved('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const p = await requestPlanning('availability.save', draft);
      setDraft({ ...draft, revision: p.revision });
      await reload();
      setSaved('Availability saved. Confirmed plans are unchanged.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function windowFields(w: any, onChange: (value: any) => void, remove: () => void, key: string) {
    return (
      <div className="availability-window" key={key}>
        <label className="field">
          Start
          <input
            type="time"
            required
            value={w.startTime}
            onChange={(e) => onChange({ ...w, startTime: e.target.value })}
          />
        </label>
        <label className="field">
          End
          <input
            type="time"
            required
            value={w.endTime}
            onChange={(e) => onChange({ ...w, endTime: e.target.value })}
          />
        </label>
        <button type="button" className="button secondary" onClick={remove}>
          Remove period
        </button>
      </div>
    );
  }
  return (
    <Section
      title="Availability"
      sub="When you are willing to study. Your daily target is a goal, not proof of free time."
    >
      <form onSubmit={save}>
        <fieldset disabled={busy} className="availability-fieldset">
          <div className="availability-days">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <div className="availability-day" key={day}>
                <h3>{days[day]}</h3>
                {!draft.windows.some((w) => w.day === day) && (
                  <p className="muted">Unavailable / not configured</p>
                )}
                {draft.windows.map((w, i) =>
                  w.day === day
                    ? windowFields(
                        w,
                        (value) =>
                          update({
                            ...draft,
                            windows: draft.windows.map((x, n) => (n === i ? value : x)),
                          }),
                        () =>
                          update({ ...draft, windows: draft.windows.filter((_, n) => n !== i) }),
                        'week-' + i,
                      )
                    : null,
                )}
                <div className="inline">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      update({
                        ...draft,
                        windows: [...draft.windows, { day, startTime: '09:00', endTime: '12:00' }],
                      })
                    }
                  >
                    Add period
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update({ ...draft, windows: draft.windows.filter((w) => w.day !== day) })
                    }
                  >
                    Mark unavailable
                  </button>
                  <label className="field">
                    Copy to
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value === '') return;
                        const target = Number(e.target.value);
                        update({
                          ...draft,
                          windows: [
                            ...draft.windows.filter((w) => w.day !== target),
                            ...draft.windows
                              .filter((w) => w.day === day)
                              .map((w) => ({ ...w, day: target })),
                          ],
                        });
                      }}
                    >
                      <option value="">Choose day</option>
                      {days.map(
                        (name, i) =>
                          i !== day && (
                            <option value={i} key={i}>
                              {name}
                            </option>
                          ),
                      )}
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
          <details className="more-fields">
            <summary>Session preferences</summary>
            <div className="form-grid">
              {(
                ['preferredMinutes', 'minimumMinutes', 'restMinutes', 'maxDailyMinutes'] as const
              ).map((key) => (
                <label className="field" key={key}>
                  {
                    {
                      preferredMinutes: 'Preferred session (minutes)',
                      minimumMinutes: 'Minimum useful session (minutes)',
                      restMinutes: 'Rest between sessions (minutes)',
                      maxDailyMinutes: 'Maximum planned minutes per day (optional)',
                    }[key]
                  }
                  <input
                    type="number"
                    min={key === 'restMinutes' ? 0 : 5}
                    max={key === 'maxDailyMinutes' ? 960 : key === 'restMinutes' ? 120 : 240}
                    value={draft.preferences[key] ?? ''}
                    required={key !== 'maxDailyMinutes'}
                    onChange={(e) =>
                      update({
                        ...draft,
                        preferences: {
                          ...draft.preferences,
                          [key]:
                            e.target.value === '' && key === 'maxDailyMinutes'
                              ? null
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="muted">
              Daily target: {d.setting.dailyHours}h. A maximum is an explicit limit; a target guides
              the distribution of work.
            </p>
          </details>
        </fieldset>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {saved && <p role="status">{saved}</p>}
        <div className="form-actions">
          <button
            type="button"
            disabled={busy}
            className="button secondary"
            onClick={() => {
              setDraft(availabilityDraft(d.planning));
              setError('');
              setSaved('');
            }}
          >
            Cancel / reset unsaved changes
          </button>
          <button className="button primary" disabled={busy}>
            Save availability
          </button>
        </div>
      </form>
      <AvailabilityExceptions
        revision={draft.revision}
        onSaved={(result) => {
          setDraft((current) => ({
            ...current,
            revision: result.revision,
            exceptions: [
              ...current.exceptions.filter((x) => x.date !== result.date),
              ...(result.windows === null ? [] : [{ date: result.date, windows: result.windows }]),
            ],
          }));
        }}
      />
      <Commitments />
    </Section>
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
