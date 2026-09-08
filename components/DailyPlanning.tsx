'use client';
import { formatDate, formatTime } from '@/lib/format';
import { useApp } from './context';
import { Section, Empty, TaskRow } from './ui';
import { calendarEvents, priorities } from '@/lib/calculations';
import { weeklyReview } from '@/lib/weekly-review';
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
          <p className="eyebrow">{formatDate(today)}</p>
          <h1>Today</h1>
          <p>
            {planned.toFixed(1)}h planned · {Math.max(0, d.setting.dailyHours - planned).toFixed(1)}
            h of study capacity remaining
          </p>
        </div>
      </div>
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
              <time>{formatTime(e.start)}</time>
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
              {formatDate(r.dueAt)} · {r.name}
            </p>
          ))}
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
