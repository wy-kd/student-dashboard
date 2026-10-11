'use client';
import { useState, useRef } from 'react';
import { useApp } from './context';
import { Section } from './ui';
import { DateTimeInput } from './DateTimeInput';
import { addDays } from '@/lib/calculations';
import { civilAt, civilRange, instant, minute } from '@/lib/planning-time';
import {
  workItems,
  type ScheduleProposal,
  type SuggestedBlock,
  type WorkItem,
} from '@/lib/planning-engine';
import { requestPlanning } from '@/lib/planning-client';
import { formatTimestamp } from '@/lib/format';
type Preview = ScheduleProposal & { fingerprint: string };
type Draft = SuggestedBlock & { selected: boolean; start: string; end: string; locked: boolean };
const draftFor = (block: SuggestedBlock, zone: string): Draft => ({
  ...block,
  selected: true,
  start: civilAt(block.startAt, zone),
  end: civilAt(block.endAt, zone),
  locked: false,
});
export function SchedulePlanning() {
  const { data: scoped, allData: d, now, reload, go } = useApp(),
    today = now.slice(0, 10),
    zone = d.setting.timezone;
  const [range, setRange] = useState({ startDate: today, endDate: addDays(today, 6) }),
    [preview, setPreview] = useState<Preview | null>(null),
    [rows, setRows] = useState<Draft[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [excluded, setExcluded] = useState<string[]>([]),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<any>(null),
    allWork = workItems(scoped, Date.now()).items;
  async function generate(startDate = range.startDate, endDate = range.endDate) {
    if (busy || uncertain) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const p = await requestPlanning('schedule.generate', {
        startDate,
        endDate,
        excluded,
        semesterId: scoped.setting.activeSemesterId,
      });
      setRange({ startDate, endDate });
      setPreview(p);
      setRows(p.suggestions.map((b: SuggestedBlock) => draftFor(b, zone)));
      pending.current = null;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function edit(id: string, value: Partial<Draft>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...value } : r)));
  }
  async function accept() {
    if (busy || !preview) return;
    setBusy(true);
    setError('');
    try {
      pending.current ??= {
        requestId: crypto.randomUUID(),
        fingerprint: preview.fingerprint,
        changes: rows
          .filter((r) => r.selected)
          .map((r) => {
            const times = civilRange(r.start, r.end, zone);
            return {
              id: r.id,
              workKey: r.workKey,
              name: r.name,
              startAt: times.start,
              endAt: times.end,
              override: r.override,
              locked: r.locked,
              ...(r.moveId ? { moveId: r.moveId, revision: r.revision } : {}),
            };
          }),
      };
      const receipt = await requestPlanning('schedule.approve', pending.current);
      pending.current = null;
      setUncertain(false);
      setPreview(null);
      setRows([]);
      setMessage(
        receipt.state === 'approved'
          ? 'Selected plan changes confirmed. No study time or Task completion was recorded.'
          : 'This approval was previously undone/restored. Generate a fresh proposal.',
      );
      try {
        await reload();
      } catch {
        setMessage('Approval acknowledged. Reload to see confirmed sessions.');
      }
    } catch (e: any) {
      setError(e.message);
      if (e.status && e.status < 500) {
        pending.current = null;
        setUncertain(false);
      } else if (pending.current) {
        setUncertain(true);
        setError(
          'The approval response was interrupted. Retry the same approval before changing this proposal. You can also check confirmed sessions after reloading.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  async function undo(batchId: string) {
    if (
      busy ||
      !confirm('Undo this approval? Newer edits and recorded study history will be protected.')
    )
      return;
    setBusy(true);
    setError('');
    try {
      await requestPlanning('schedule.undo', { batchId });
      await reload();
      setMessage('Approval undone. Tasks and study history were preserved.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="Plan your study"
      sub="Availability-aware suggestions. Nothing changes until you approve selected work."
    >
      <div className="planning-workspace">
        <div className="inline">
          <button
            type="button"
            className="button primary"
            disabled={busy || uncertain}
            onClick={() => generate(today, addDays(today, 6))}
          >
            Plan my week
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || uncertain}
            onClick={() => generate(addDays(today, 1), addDays(today, 1))}
          >
            Plan tomorrow
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || uncertain}
            onClick={() => generate(today, today)}
          >
            Plan remainder of today
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => go('/settings#availability')}
          >
            Adjust availability
          </button>
        </div>
        <details className="more-fields">
          <summary>Planning period and work estimates</summary>
          <div className="form-grid">
            <label className="field">
              From
              <DateTimeInput
                type="date"
                min={today}
                value={range.startDate}
                disabled={busy || uncertain}
                onChange={(e) => setRange({ ...range, startDate: e.target.value })}
              />
            </label>
            <label className="field">
              Through (up to 14 days)
              <DateTimeInput
                type="date"
                min={range.startDate}
                max={addDays(range.startDate || today, 13)}
                value={range.endDate}
                disabled={busy || uncertain}
                onChange={(e) => setRange({ ...range, endDate: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy || uncertain}
            onClick={() => generate()}
          >
            Plan selected period
          </button>
          <p className="muted">
            Unestimated or partly completed work needs a user-entered remaining estimate. Planned
            minutes are separate from actual time. Excluding work affects only the next proposal.
          </p>
          {allWork.map((work) => (
            <div className="planning-work-item" key={work.key}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!excluded.includes(work.key)}
                  disabled={busy || uncertain}
                  onChange={(e) =>
                    setExcluded(
                      e.target.checked
                        ? excluded.filter((k) => k !== work.key)
                        : [...excluded, work.key],
                    )
                  }
                />
                Include {work.name}
              </label>
              <WorkEstimateEditor work={work} />
            </div>
          ))}
        </details>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {preview && (
          <div className="planning-preview" aria-label="Schedule preview">
            <h3>Suggested plan · {preview.status}</h3>
            <p>
              {(preview.requiredMinutes / 60).toFixed(1)}h known work needing allocation ·{' '}
              {(preview.capacityMinutes / 60).toFixed(1)}h known free capacity ·{' '}
              {(preview.confirmedMinutes / 60).toFixed(1)}h already planned in this period
            </p>
            <p className="muted">
              Suggestions below are unconfirmed. Unknown estimates and deadline-specific shortfalls
              are listed separately.
            </p>
            {preview.warnings.map((w, i) => (
              <p className="muted" key={i}>
                {w}
              </p>
            ))}
            <details className="more-fields">
              <summary>
                Existing commitments and confirmed sessions ({preview.occupied.length})
              </summary>
              {preview.occupied.map((event, i) => (
                <p key={event.id + i}>
                  {formatTimestamp(event.start, zone)} – {formatTimestamp(event.end, zone)} ·{' '}
                  {event.name} · {event.kind}
                </p>
              ))}
            </details>
            {preview.conflicts.map((c, i) => (
              <p className="notice" key={i}>
                {c}
              </p>
            ))}
            {preview.unscheduled.length > 0 && (
              <div className="planning-unscheduled">
                <h4>Work needing review</h4>
                {preview.unscheduled.map((w) => (
                  <p key={w.workKey}>
                    <strong>{w.name}</strong>:{' '}
                    {w.minutes == null
                      ? 'duration unknown'
                      : (w.minutes / 60).toFixed(1) + 'h unscheduled'}{' '}
                    · {w.reason}
                  </p>
                ))}
              </div>
            )}
            <fieldset className="availability-fieldset" disabled={busy || uncertain}>
              <div className="planning-preview-list">
                {rows.map((row) => (
                  <div className="planning-suggestion" key={row.id}>
                    <div className="planning-suggestion-heading">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => edit(row.id, { selected: e.target.checked })}
                        />
                        {row.moveId ? 'Proposed move' : 'Unconfirmed suggestion'} · {row.name}
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                      >
                        Remove suggestion
                      </button>
                    </div>
                    <p className="muted">{row.reason}</p>
                    <div className="form-grid">
                      <label className="field">
                        Work
                        <select
                          value={row.workKey ?? ''}
                          onChange={(e) => {
                            const work = preview.items.find((w) => w.key === e.target.value);
                            edit(row.id, {
                              workKey: work?.key ?? null,
                              name: work?.name ?? 'Reserved study time',
                            });
                          }}
                        >
                          <option value="">Reserve extra study time</option>
                          {preview.items.map((w) => (
                            <option value={w.key} key={w.key}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Session title
                        <input
                          value={row.name}
                          maxLength={500}
                          required
                          onChange={(e) => edit(row.id, { name: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Start
                        <DateTimeInput
                          type="datetime-local"
                          required
                          value={row.start}
                          onChange={(e) => edit(row.id, { start: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        End
                        <DateTimeInput
                          type="datetime-local"
                          required
                          value={row.end}
                          onChange={(e) => edit(row.id, { end: e.target.value })}
                        />
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={row.override}
                          onChange={(e) => edit(row.id, { override: e.target.checked })}
                        />
                        Manual availability override
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={row.locked}
                          onChange={(e) => edit(row.id, { locked: e.target.checked })}
                        />
                        Keep this confirmed session fixed
                      </label>
                    </div>
                    {row.override && (
                      <p className="muted">
                        You explicitly permit this session outside usual availability. Deadlines,
                        occupied time and maximum daily workload still apply.
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  let start = rows.at(-1)?.end || range.startDate + 'T09:00';
                  if (rows.length) {
                    try {
                      start = civilAt(
                        instant(start, zone) + (d.planning?.preference.restMinutes ?? 0) * minute,
                        zone,
                      );
                    } catch {}
                  }
                  let end = '';
                  try {
                    end = civilAt(instant(start, zone) + 60 * minute, zone);
                  } catch {}
                  setRows(
                    [
                      ...rows,
                      draftFor(
                        {
                          id: crypto.randomUUID(),
                          workKey: null,
                          name: 'Reserved study time',
                          startAt: Date.now(),
                          endAt: Date.now() + 60 * minute,
                          override: false,
                          reason: 'Manually reserved extra study time.',
                        },
                        zone,
                      ),
                    ].map((r, i) => (i === rows.length ? { ...r, start, end } : r)),
                  );
                }}
              >
                Add manual block
              </button>
            </fieldset>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || uncertain}
                onClick={() => {
                  setPreview(null);
                  setRows([]);
                  pending.current = null;
                  setError('');
                }}
              >
                Cancel proposal
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || uncertain}
                onClick={() => generate()}
              >
                Regenerate suggestions
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy || !rows.some((r) => r.selected)}
                onClick={accept}
              >
                {uncertain ? 'Retry same approval' : 'Accept selected changes'}
              </button>
            </div>
          </div>
        )}
        {!!d.planning?.batches.length && (
          <details className="more-fields">
            <summary>Recent approval history / undo</summary>
            {[...d.planning.batches]
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 10)
              .map((b) => (
                <div className="row" key={b.id}>
                  <span className="grow">
                    {formatTimestamp(b.createdAt, zone)} · {b.state}
                  </span>
                  {b.state === 'approved' && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || uncertain}
                      onClick={() => undo(b.id)}
                    >
                      Undo approval
                    </button>
                  )}
                </div>
              ))}
            <p className="muted">
              Undo refuses newer edits, active timers, recorded work and conflicting restored times.
              Restored backup batches retain history but cannot use an old undo baseline.
            </p>
          </details>
        )}
      </div>
    </Section>
  );
}
function WorkEstimateEditor({ work }: { work: WorkItem }) {
  const { allData: d, reload } = useApp(),
    existing = d.planning?.estimates.find((e) => e.workKey === work.key);
  const [draft, setDraft] = useState(() => ({
      minutes: existing?.minutes == null ? '' : String(existing.minutes),
      revision: existing?.revision ?? 0,
    })),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="planning-estimate"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const row = await requestPlanning('estimate.save', {
            workKey: work.key,
            minutes: Number(draft.minutes),
            revision: draft.revision,
          });
          setDraft({ ...draft, revision: row.revision });
          await reload();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        {work.minutes == null
          ? 'Remaining duration unknown'
          : (work.minutes / 60).toFixed(1) + 'h remaining estimate'}{' '}
        · {work.reason}
      </p>
      <label className="field">
        Remaining minutes for {work.name}
        <input
          type="number"
          min={0}
          max={600000}
          step="any"
          required
          value={draft.minutes}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
        />
      </label>
      <button className="button secondary" disabled={busy}>
        Save remaining estimate
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
