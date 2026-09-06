'use client';
import { ArrowRight, CalendarDays, Clock, Flame, Plus, BookOpen } from 'lucide-react';
import { useApp } from './context';
import { Section, Empty, TaskRow, Progress, Badge, SubjectTag, Due } from './ui';
import {
  priorities,
  semesterProgress,
  calendarEvents,
  health,
  workload,
  assignmentProgress,
  addDays,
} from '@/lib/calculations';
export function Dashboard({ todayOnly = false }: { todayOnly?: boolean }) {
  const { data: d, now, go, open } = useApp();
  const today = now.slice(0, 10),
    rank = priorities(d, now),
    s = d.semester.find((s) => s.id === d.setting.activeSemesterId) ?? d.semester[0],
    semester = s ? semesterProgress(s, now, d) : null;
  const todayTasks = d.task.filter(
      (t) => t.status !== 'Completed' && t.dueAt?.slice(0, 10) === today,
    ),
    overdue = d.task.filter(
      (t) => t.status !== 'Completed' && t.dueAt && t.dueAt < now && t.dueAt.slice(0, 10) !== today,
    );
  const schedule = calendarEvents(d, today, today).filter((e) =>
    ['Lecture', 'Tutorial', 'Workshop', 'Practical', 'Lab', 'Study session', 'Study'].includes(
      e.kind,
    ),
  );
  const forecast = workload(d, now, 14);
  const upcoming = rank.toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  const missed = d.milestone.filter((m) => !m.done && m.dueAt < now);
  const alerts = [
    ...rank
      .filter((r) => r.dueAt < now || r.dueAt.slice(0, 10) <= addDays(now, 1))
      .map((r) => r.name + ' · ' + r.reason.split(' · ')[0]),
    ...d.assignment
      .filter((a) => health(a, d, now) === 'Behind')
      .map((a) => a.name + ' is behind schedule'),
    ...d.exam
      .filter((e) => !e.completed && e.dueAt.slice(0, 10) === addDays(now, 7))
      .map((e) => e.name + ' is in 7 days'),
    ...missed.map((m) => 'Missed milestone: ' + m.name),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date(today + 'T12:00:00').toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1>{todayOnly ? 'Your day, in focus.' : `Let’s make progress, ${d.setting.name}.`}</h1>
          <p>
            {todayTasks.length
              ? `${todayTasks.length} ${todayTasks.length === 1 ? 'task' : 'tasks'} on your list today. Pick one and make a start.`
              : 'A clear view of what matters next.'}
          </p>
        </div>
        <button className="button secondary" onClick={() => go('/calendar')}>
          <CalendarDays size={18} />
          View calendar
        </button>
      </div>
      {!s && (
        <Section
          title="Make this semester yours"
          sub="Start with a semester, then add your subjects and deadlines."
        >
          <div className="onboarding-actions">
            <button className="button primary" onClick={() => open({ entity: 'semester' })}>
              <Plus size={17} />
              Create a semester
            </button>
            <button className="button secondary" onClick={() => go('/settings')}>
              Try demo data
            </button>
          </div>
        </Section>
      )}
      {semester && (
        <div className="semester-strip">
          <div className="semester-symbol">
            <BookOpen size={23} />
          </div>
          <div>
            <strong>{s!.name}</strong>
            <span>
              {now.slice(0, 10) < s!.teachingStart
                ? 'Teaching has not started'
                : now.slice(0, 10) > s!.endDate
                  ? 'Semester complete'
                  : `Teaching week ${semester.week} of ${s!.teachingWeeks}`}
            </span>
          </div>
          <Progress value={semester.percent} label="Semester elapsed" />
          <span>
            {semester.completed} / {semester.total} assignments submitted
          </span>
        </div>
      )}
      {!todayOnly && (
        <div className="metrics">
          <div>
            <span>
              <Clock size={17} />
              Next deadline
            </span>
            <strong>{upcoming[0] ? <Due at={upcoming[0].dueAt} /> : 'All clear'}</strong>
            <small>{upcoming[0]?.name ?? 'Add an assessment to see its countdown'}</small>
          </div>
          <div>
            <span>
              <Flame size={17} />
              Work to plan
            </span>
            <strong>
              {forecast.total}
              <small> hours</small>
            </strong>
            <small>Estimated over the next 14 days</small>
          </div>
          <div>
            <span>
              <CalendarDays size={17} />
              Today’s schedule
            </span>
            <strong>
              {schedule.length}
              <small> sessions</small>
            </strong>
            <small>
              {schedule[0]
                ? schedule[0].start.slice(11) + ' · ' + schedule[0].name
                : 'Room for focused study'}
            </small>
          </div>
        </div>
      )}
      {(alerts.length > 0 || forecast.collisions.length > 0) && (
        <details className="alerts">
          <summary>
            {alerts.length + forecast.collisions.length}{' '}
            {alerts.length + forecast.collisions.length === 1 ? 'thing needs' : 'things need'} your
            attention
          </summary>
          {[...new Set(alerts)].map((a) => (
            <p key={a}>{a}</p>
          ))}
          {forecast.collisions.map((c) => (
            <p key={c.start}>
              Heavy workload {c.start} to {c.end}: {c.count} assessments, {c.weight}% combined
              weighting and {c.hours}h estimated work.
            </p>
          ))}
        </details>
      )}
      <div className="dashboard-grid">
        <div className="stack">
          <Section
            title="What should I work on?"
            sub="Ranked by urgency, weighting and work remaining."
            action={
              <button className="text-button" onClick={() => go('/analytics')}>
                How it works <ArrowRight size={16} />
              </button>
            }
          >
            {rank.length ? (
              <div className="rank-list">
                {rank.slice(0, 3).map((r, i) => (
                  <button
                    className={'rank-item ' + (i === 0 ? 'first' : '')}
                    key={r.id}
                    onClick={() => go(`/${r.entity === 'exam' ? 'exams' : 'assignments'}/${r.id}`)}
                  >
                    <span className="rank-number">0{i + 1}</span>
                    <div className="grow">
                      <div className="spread">
                        <SubjectTag id={r.subjectId} />
                        <Badge>{r.level}</Badge>
                      </div>
                      <h3>{r.name}</h3>
                      <p>{r.reason}</p>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="A clean slate"
                text="Add assignments or exams to get a suggested next step."
                action={() => open({ entity: 'assignment' })}
              />
            )}
          </Section>
          <Section
            title="Today’s tasks"
            sub={`${todayTasks.length} to complete`}
            action={
              <button
                className="text-button"
                onClick={() => open({ entity: 'task', prefill: { dueAt: today + 'T17:00' } })}
              >
                <Plus size={17} />
                Add task
              </button>
            }
          >
            {todayTasks.length ? (
              todayTasks.map((t) => <TaskRow key={t.id} row={t} />)
            ) : (
              <Empty
                title="Nothing due today"
                text="Plan a task or spend time on your next assessment."
              />
            )}
          </Section>
          {overdue.length > 0 && (
            <Section title="Overdue work">
              {overdue.map((t) => (
                <TaskRow key={t.id} row={t} />
              ))}
            </Section>
          )}
        </div>
        <div className="stack">
          <Section title="On your schedule" sub="Today’s classes and study sessions">
            {schedule.length ? (
              <div className="schedule-list">
                {schedule.map((e, i) => (
                  <button
                    className="schedule-item"
                    key={e.id + i}
                    onClick={() =>
                      open({
                        entity: e.entity as any,
                        row: (d as any)[e.entity].find((x: any) => x.id === e.id),
                      })
                    }
                  >
                    <time>{e.start.slice(11)}</time>
                    <div>
                      <SubjectTag id={e.subjectId} />
                      <strong>{e.name}</strong>
                      <small>
                        {e.kind}
                        {e.end ? ' · until ' + e.end.slice(11) : ''}
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="No classes today"
                text="Your next focused study block can go here."
                action={() => open({ entity: 'studySession' })}
              />
            )}
          </Section>
          <Section
            title="Upcoming deadlines"
            action={
              <button
                aria-label="All assignments"
                className="icon-button"
                onClick={() => go('/assignments')}
              >
                <ArrowRight size={18} />
              </button>
            }
          >
            {upcoming.slice(0, 5).map((r) => (
              <button
                className="deadline-item"
                key={r.id}
                onClick={() => go(`/${r.entity === 'exam' ? 'exams' : 'assignments'}/${r.id}`)}
              >
                <div className="date-block">
                  <span>
                    {new Date(r.dueAt.slice(0, 10) + 'T12:00:00').toLocaleDateString('en', {
                      month: 'short',
                    })}
                  </span>
                  <strong>{r.dueAt.slice(8, 10)}</strong>
                </div>
                <div className="grow">
                  <SubjectTag id={r.subjectId} />
                  <strong>{r.name}</strong>
                  <Due at={r.dueAt} exam={r.entity === 'exam'} />
                </div>
              </button>
            ))}
            {!upcoming.length && (
              <Empty title="No deadlines yet" text="Add an assignment or exam to begin." />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
