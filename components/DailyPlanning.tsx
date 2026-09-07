'use client';
import { useState } from 'react';
import { useApp } from './context';
import { useProductivity } from './productivity';
import { Section, Empty, TaskRow } from './ui';
import { calendarEvents, priorities } from '@/lib/calculations';
import { suggestDay, weeklyReview, type StudyBlock } from '@/lib/day-plan';
export function DayPlanner({ initialDay }: { initialDay?: string }) {
  const { data: d, now, act, notify } = useProductivity(),
    [day, setDay] = useState(initialDay ?? now.slice(0, 10)),
    [blocks, setBlocks] = useState<StudyBlock[] | null>(null),
    [busy, setBusy] = useState(false);
  const edit = (id: string, patch: Partial<StudyBlock>) =>
    setBlocks((b) => b!.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  async function accept() {
    setBusy(true);
    try {
      await act('plan.save', { blocks });
      setBlocks(null);
      notify('Study plan saved. Edit sessions in Calendar.');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="day-planner">
      <div className="inline">
        <label>
          Plan date{' '}
          <input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setBlocks(null);
            }}
          />
        </label>
        <button
          className="button primary"
          disabled={!day || busy}
          onClick={() =>
            setBlocks(suggestDay(d, day, now).map((b) => ({ ...b, id: crypto.randomUUID() })))
          }
        >
          Plan My Day
        </button>
      </div>
      {blocks && (
        <div className="plan-proposals">
          <p>
            Suggestions use deadlines, weighting and work remaining, around existing classes and
            study. Review before saving.
          </p>
          {blocks.map((b) => (
            <div className="proposal" key={b.id}>
              <strong>{b.name}</strong>
              <label>
                Start
                <input
                  aria-label={'Start ' + b.name}
                  type="datetime-local"
                  value={b.dueAt}
                  onChange={(e) => edit(b.id, { dueAt: e.target.value })}
                />
              </label>
              <label>
                Minutes
                <input
                  aria-label={'Minutes ' + b.name}
                  type="number"
                  min={15}
                  max={240}
                  value={b.minutes}
                  onChange={(e) => edit(b.id, { minutes: Number(e.target.value) })}
                />
              </label>
              <button
                className="text-button"
                onClick={() => setBlocks((x) => x!.filter((y) => y.id !== b.id))}
              >
                Remove
              </button>
            </div>
          ))}
          {!blocks.length ? (
            <p>
              No blocks to suggest. Check your free time, capacity and remaining assessment work.
            </p>
          ) : (
            <button className="button primary" disabled={busy} onClick={accept}>
              {busy ? 'Saving…' : 'Accept study plan'}
            </button>
          )}
          <button className="text-button" disabled={busy} onClick={() => setBlocks(null)}>
            Close suggestions
          </button>
        </div>
      )}
    </div>
  );
}
export function Today() {
  const { data: d, now, open } = useApp(),
    today = now.slice(0, 10),
    schedule = calendarEvents(d, today, today).filter(
      (e) => e.entity === 'class' || e.entity === 'studySession',
    ),
    tasks = d.task.filter((t) => t.status !== 'Completed' && t.dueAt?.slice(0, 10) <= today),
    planned = d.studySession
      .filter((s) => s.dueAt.slice(0, 10) === today)
      .reduce((n, s) => n + s.plannedHours, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>Today</h1>
          <p>
            {planned.toFixed(1)}h planned · {Math.max(0, d.setting.dailyHours - planned).toFixed(1)}
            h of study capacity remaining
          </p>
        </div>
      </div>
      <DayPlanner />
      <div className="two-columns">
        <Section title="Classes & study">
          {schedule.map((e) => (
            <button
              className="schedule-item"
              key={e.id}
              onClick={() =>
                open({
                  entity: e.entity as any,
                  row: d[e.entity as 'class'].find((r) => r.id === e.id),
                })
              }
            >
              <time>{e.start.slice(11)}</time>
              <span>
                <strong>{e.name}</strong>
                <small>{e.kind}</small>
              </span>
            </button>
          ))}
          {!schedule.length && (
            <Empty
              title="No sessions planned today"
              text="Start a timer or schedule a study session."
              action={() => open({ entity: 'studySession', prefill: { dueAt: today + 'T15:00' } })}
            />
          )}
        </Section>
        <Section title="Due & overdue tasks">
          {tasks.map((t) => (
            <TaskRow key={t.id} row={t} />
          ))}
          {!tasks.length && (
            <Empty title="Nothing due today" text="Choose a useful next step below." />
          )}
        </Section>
      </div>
      <Section title="Recommended work">
        {priorities(d, now)
          .slice(0, 3)
          .map((r) => (
            <div className="recommendation" key={r.id}>
              <div>
                <h3>{r.name}</h3>
                <p>{r.reason}</p>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  open({
                    entity: 'studySession',
                    prefill: {
                      name: r.name,
                      subjectId: r.subjectId,
                      [r.entity + 'Id']: r.id,
                      dueAt: today + 'T15:00',
                      plannedHours: 50 / 60,
                    },
                  })
                }
              >
                Plan a session
              </button>
            </div>
          ))}
      </Section>
    </>
  );
}
export function WeeklySummary({ compact = false }: { compact?: boolean }) {
  const { data: d, now, go } = useApp(),
    w = weeklyReview(d, now);
  return (
    <>
      <p>
        <strong>{w.completed}</strong> tasks completed · <strong>{w.hours.toFixed(1)}h</strong>{' '}
        studied · <strong>{w.submitted}</strong> assessments submitted
      </p>
      {!compact && (
        <>
          <p>
            {w.remaining} tasks remaining · {w.missed} past sessions not marked complete of{' '}
            {w.planned} planned this week
          </p>
          <h2>Next week</h2>
          <p>
            {w.nextWork}h estimated work ·{' '}
            {w.upcoming.filter((r) => r.entity === 'assignment').length} assignments ·{' '}
            {w.upcoming.filter((r) => r.entity === 'exam').length} exams
          </p>
          {w.upcoming.map((r) => (
            <p key={r.id}>
              {r.dueAt.slice(0, 10)} · {r.name}
            </p>
          ))}
          <details className="more-fields">
            <summary>Plan Next Week</summary>
            <DayPlanner initialDay={w.next} />
          </details>
        </>
      )}
      {compact && (
        <button className="text-button" onClick={() => go('/review')}>
          Weekly Review →
        </button>
      )}
    </>
  );
}
export function WeeklyReview() {
  return (
    <>
      <div className="page-heading">
        <h1>Weekly Review</h1>
      </div>
      <Section title="This week">
        <WeeklySummary />
      </Section>
    </>
  );
}
