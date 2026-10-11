'use client';
import { useState, useRef } from 'react';
import { todoRequestId } from '@/lib/todo-request-id';
import { useApp } from './context';
import { Section } from './ui';
import { DateTimeInput } from './DateTimeInput';
import { addDays } from '@/lib/calculations';
import { civilAt, civilRange, instant, minute } from '@/lib/planning-time';
import {
  workItems,
  generateSchedule,
  type ScheduleProposal,
  type SuggestedBlock,
  type WorkItem,
} from '@/lib/planning-engine';
import { requestPlanning } from '@/lib/planning-client';
import { reviewGroups, proposalTotals } from '@/lib/planning-presentation';
import { formatDate, formatTime, formatTimestamp } from '@/lib/format';
import { scheduleIssues } from '@/lib/planning-disruptions';
import { PlannedWorkReview, PlannedWorkEditor } from './PlannedWork';
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
    [chosen, setChosen] = useState(false),
    [confirming, setConfirming] = useState(false),
    [expanded, setExpanded] = useState<string | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [rows, setRows] = useState<Draft[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [excluded, setExcluded] = useState<string[]>([]),
    [uncertain, setUncertain] = useState(false),
    [adjustmentId, setAdjustmentId] = useState<string | null>(null),
    [kept, setKept] = useState<string[]>([]),
    [recordBlock, setRecordBlock] = useState<any>(null),
    [editBlock, setEditBlock] = useState<string | null>(null);
  const pending = useRef<any>(null),
    allWork = workItems(scoped, instant(now, zone)).items,
    scopedIds = new Set((scoped.planning?.blocks ?? []).map((b) => b.id)),
    issues = scheduleIssues(d, instant(now, zone)).filter(
      (issue) => scopedIds.has(issue.block.id) && !kept.includes(issue.key),
    );
  const readiness = (() => {
    try {
      return generateSchedule(
        d,
        instant(now, zone),
        range.startDate,
        range.endDate,
        workItems(d, instant(now, zone)).items.map((w) => w.key),
      );
    } catch {
      return null;
    }
  })();
  const configured = !!(
    d.planning?.windows.length ||
    d.planning?.exceptions.length ||
    (d.planning?.preference?.revision ?? 0) > 0
  );
  const totals = proposalTotals(rows, (start, end) => {
    const x = civilRange(start, end, zone);
    return (x.end - x.start) / minute;
  });
  function choose(startDate: string, endDate: string) {
    if (busy || uncertain) return;
    setRange({ startDate, endDate });
    setChosen(true);
    setPreview(null);
    setRows([]);
    setConfirming(false);
    setError('');
    setMessage('');
  }
  async function generate(
    startDate = range.startDate,
    endDate = range.endDate,
    moveId: string | null = null,
  ) {
    if (busy || uncertain) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const p = await requestPlanning(
        moveId ? 'schedule.adjust' : 'schedule.generate',
        moveId
          ? { id: moveId, startDate, endDate }
          : {
              startDate,
              endDate,
              excluded,
              semesterId: scoped.setting.activeSemesterId,
            },
      );
      setChosen(true);
      setConfirming(false);
      setExpanded(null);
      setAdjustmentId(moveId);
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
        requestId: todoRequestId(),
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
  async function dismiss(id: string, revision: number) {
    if (
      busy ||
      uncertain ||
      !confirm(
        'Dismiss this planned allocation? Existing Tasks and recorded study history are preserved.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await requestPlanning('block.dismiss', { id, revision });
      await reload();
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
        {issues.length > 0 && (
          <details className="planning-review" aria-label="Recorded schedule changes">
            <summary>Plans needing review ({issues.length})</summary>
            <p className="muted">
              These prompts reflect recorded changes. No plan has been moved, marked failed or
              completed automatically.
            </p>
            {issues.map((issue) => (
              <details className="planning-issue" key={issue.key}>
                <summary>
                  {issue.block.name} · {formatTimestamp(issue.block.startAt, zone)}
                </summary>
                <div className="planning-suggestion">
                  <strong>{issue.block.name}</strong>
                  <p className="muted">
                    {formatTimestamp(issue.block.startAt, zone)} –{' '}
                    {formatTimestamp(issue.block.endAt, zone)}
                  </p>
                  {issue.reasons.map((reason, i) => (
                    <p key={i}>{reason}</p>
                  ))}
                  {issue.active && (
                    <p>Use End and the existing timer review before changing this plan.</p>
                  )}
                  {issue.block.locked && (
                    <p>
                      This session is fixed. Unlock it explicitly in confirmed planned work to
                      request a move.
                    </p>
                  )}
                  <div className="inline">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || uncertain || issue.active}
                      onClick={() => setRecordBlock(issue.block)}
                    >
                      Record what I completed
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || uncertain || !issue.canSuggest}
                      onClick={() => generate(today, addDays(today, 6), issue.block.id)}
                    >
                      Review alternative times
                    </button>
                    {!issue.canSuggest && !issue.block.locked && !issue.active && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy || uncertain}
                        onClick={() => setEditBlock(issue.block.id)}
                      >
                        Review work association
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || uncertain}
                      onClick={() => setKept([...kept, issue.key])}
                    >
                      Keep current plan
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || uncertain || issue.active}
                      onClick={() => dismiss(issue.block.id, issue.block.revision)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </details>
        )}
        {!preview && (
          <>
            <h3>1. Choose what to plan</h3>
            <div className="inline">
              <button
                type="button"
                className="button primary"
                disabled={busy || uncertain}
                onClick={() => choose(today, addDays(today, 6))}
              >
                Plan my week
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || uncertain}
                onClick={() => choose(addDays(today, 1), addDays(today, 1))}
              >
                Plan tomorrow
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || uncertain}
                onClick={() => choose(today, today)}
              >
                Plan the rest of today
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => go('/settings#availability')}
              >
                Adjust availability
              </button>
            </div>
            <p className="muted">
              My week covers today plus six days. Tomorrow covers the next day. The rest of today
              uses only time still ahead.
            </p>
            {chosen && (
              <div className="planning-readiness" aria-label="Planning readiness">
                <h4>
                  {formatDate(range.startDate)}
                  {range.endDate !== range.startDate ? ` – ${formatDate(range.endDate)}` : ''}
                </h4>
                {!configured ? (
                  <>
                    <p>No study availability has been set up yet.</p>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => go('/settings#availability')}
                    >
                      Set availability
                    </button>
                  </>
                ) : (
                  <>
                    <div className="planning-summary">
                      <span>
                        <strong>{((readiness?.capacityMinutes ?? 0) / 60).toFixed(1)}h</strong>{' '}
                        known free capacity
                      </span>
                      <span>
                        <strong>{readiness?.occupied.length ?? 0}</strong> commitments and
                        reservations
                      </span>
                      <span>
                        <strong>{((readiness?.confirmedMinutes ?? 0) / 60).toFixed(1)}h</strong>{' '}
                        already planned
                      </span>
                      <span>
                        <strong>{allWork.filter((w) => w.minutes === null).length}</strong> missing
                        estimates
                      </span>
                    </div>
                    <p className="muted">
                      Availability and daily limits are included. Estimates and deadlines may limit
                      what fits.
                    </p>
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy || !readiness}
                      onClick={() => generate()}
                    >
                      {busy ? 'Preparing…' : 'Suggest study sessions'}
                    </button>
                  </>
                )}
              </div>
            )}
            <details className="more-fields">
              <summary>Custom dates and work estimates</summary>
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
                onClick={() => choose(range.startDate, range.endDate)}
              >
                Plan selected period
              </button>
              <p className="muted">
                Unestimated or partly completed work needs a user-entered remaining estimate.
                Planned minutes are separate from actual time. Excluding work affects only the next
                proposal.
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
                  <details className="more-fields">
                    <summary>Set remaining time</summary>
                    <WorkEstimateEditor work={work} />
                  </details>
                </div>
              ))}
            </details>
          </>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {message && (
          <div role="status">
            <p>{message}</p>
            <div className="inline">
              <button type="button" className="button secondary" onClick={() => go('/today')}>
                Open Today
              </button>
              <button type="button" className="button secondary" onClick={() => go('/calendar')}>
                Open Calendar
              </button>
            </div>
          </div>
        )}
        {preview && (
          <div className="planning-preview" aria-label="Schedule preview">
            <h3>{confirming ? '3. Review and confirm' : '2. Review suggested schedule'}</h3>
            <div className="planning-summary">
              <span>
                <strong>{rows.length}</strong> study sessions suggested
              </span>
              <span>
                <strong>{(totals.minutes / 60).toFixed(1)}h</strong> selected
              </span>
              <span>
                <strong>{preview.unscheduled.length + preview.conflicts.length}</strong> items need
                attention
              </span>
            </div>
            <p className="notice">
              Nothing has been saved yet. {totals.count} sessions selected for approval.
            </p>
            <p className="muted">
              {(preview.requiredMinutes / 60).toFixed(1)}h known work ·{' '}
              {(preview.capacityMinutes / 60).toFixed(1)}h free capacity ·{' '}
              {(preview.confirmedMinutes / 60).toFixed(1)}h already reserved.
            </p>
            {preview.warnings.length > 0 && (
              <details className="more-fields">
                <summary>Other planning information ({preview.warnings.length})</summary>
                {preview.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </details>
            )}
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
            <ProposalAttention proposal={preview} go={go} />
            <fieldset className="availability-fieldset" disabled={busy || uncertain}>
              <div className="planning-preview-list">
                {Array.from(new Set(rows.map((r) => r.start.slice(0, 10))))
                  .sort()
                  .map((date) => (
                    <section className="planning-date-group" key={date}>
                      <h4>{formatDate(date)}</h4>
                      {rows
                        .filter((r) => r.start.slice(0, 10) === date)
                        .map((row) => (
                          <div className="planning-suggestion" key={row.id}>
                            <div className="planning-suggestion-heading">
                              <label className="check">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) => edit(row.id, { selected: e.target.checked })}
                                />
                                {row.moveId ? 'Proposed move' : 'Unconfirmed suggestion'} ·{' '}
                                {row.name}
                              </label>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                              >
                                Remove suggestion
                              </button>
                            </div>
                            <p className="planning-session-time">
                              {formatTime(row.start)}–{formatTime(row.end)} ·{' '}
                              {(() => {
                                try {
                                  const x = civilRange(row.start, row.end, zone);
                                  return `${Math.round((x.end - x.start) / minute)} minutes`;
                                } catch {
                                  return 'Check session times';
                                }
                              })()}
                            </p>
                            <button
                              type="button"
                              className="button secondary"
                              aria-expanded={expanded === row.id}
                              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                            >
                              Edit session
                            </button>
                            {expanded === row.id && (
                              <>
                                <p className="muted">{row.reason}</p>
                                <div className="form-grid">
                                  <label className="field">
                                    Work
                                    <select
                                      value={row.workKey ?? ''}
                                      onChange={(e) => {
                                        const work = preview.items.find(
                                          (w) => w.key === e.target.value,
                                        );
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
                                    You explicitly permit this session outside usual availability.
                                    Deadlines, occupied time and maximum daily workload still apply.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                    </section>
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
                          id: todoRequestId(),
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
            {totals.count === 0 && (
              <p role="status">Select a session above, or adjust availability and regenerate.</p>
            )}
            {totals.invalid && (
              <p role="alert">Correct the selected session dates and times before approving.</p>
            )}
            {confirming && (
              <p className="notice">
                Confirm {totals.count} selected sessions ({(totals.minutes / 60).toFixed(1)}h).
                Scheduling records intended time only.
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || uncertain}
                onClick={() => {
                  setPreview(null);
                  setRows([]);
                  setAdjustmentId(null);
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
                onClick={() => generate(range.startDate, range.endDate, adjustmentId)}
              >
                Regenerate suggestions
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy || totals.count === 0 || totals.invalid}
                onClick={() => (confirming || uncertain ? accept() : setConfirming(true))}
              >
                {uncertain
                  ? 'Retry same approval'
                  : confirming
                    ? 'Accept selected sessions'
                    : 'Review selected sessions'}
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
      {recordBlock && <PlannedWorkReview block={recordBlock} close={() => setRecordBlock(null)} />}
      {editBlock && <PlannedWorkEditor id={editBlock} close={() => setEditBlock(null)} />}
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

function ProposalAttention({ proposal, go }: { proposal: Preview; go: (url: string) => void }) {
  const groups = reviewGroups(proposal);
  return (
    <div className="planning-attention" aria-label="Work needing review">
      {(
        [
          [
            'Missing time estimates',
            groups.missing,
            'Set remaining time to include this work.',
            'Set remaining time',
          ],
          [
            'Not enough study time',
            groups.capacity,
            `${(groups.unscheduledMinutes / 60).toFixed(1)}h remains unscheduled within the current availability and deadlines.`,
            'Adjust availability',
          ],
          [
            'Deadlines needing review',
            groups.deadlines,
            'These deadlines have passed. Review the record before planning it.',
            'Review work',
          ],
        ] as const
      ).map(
        ([title, items, explanation, action]) =>
          items.length > 0 && (
            <section key={title} className="planning-attention-group">
              <h4>
                {title} ({items.length})
              </h4>
              <p className="muted">{explanation}</p>
              <ul>
                {items.slice(0, 3).map((w) => (
                  <li key={w.workKey}>
                    {w.name}
                    {w.minutes !== null ? ` · ${(w.minutes / 60).toFixed(1)}h unscheduled` : ''}
                    {title === 'Missing time estimates' && (
                      <details>
                        <summary>Set remaining time</summary>
                        <WorkEstimateEditor
                          work={proposal.items.find((x) => x.key === w.workKey)!}
                        />
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {items.length > 3 && (
                <details>
                  <summary>Show all {items.length} items</summary>
                  <ul>
                    {items.slice(3).map((w) => (
                      <li key={w.workKey}>
                        {w.name}
                        {w.minutes !== null ? ` · ${(w.minutes / 60).toFixed(1)}h unscheduled` : ''}
                        {title === 'Missing time estimates' && (
                          <details>
                            <summary>Set remaining time</summary>
                            <WorkEstimateEditor
                              work={proposal.items.find((x) => x.key === w.workKey)!}
                            />
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {title !== 'Missing time estimates' && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    go(title === 'Not enough study time' ? '/settings#availability' : '/tasks')
                  }
                >
                  {action}
                </button>
              )}
            </section>
          ),
      )}
      {proposal.conflicts.length > 0 && (
        <details className="planning-attention-group">
          <summary>Scheduling conflicts ({proposal.conflicts.length})</summary>
          <p className="muted">Review overlapping commitments; confirmed sessions are unchanged.</p>
          <ul>
            {proposal.conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <button type="button" className="button secondary" onClick={() => go('/calendar')}>
            Review schedule
          </button>
        </details>
      )}
    </div>
  );
}
