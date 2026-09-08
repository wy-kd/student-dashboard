'use client';
import { DateTimeInput } from './DateTimeInput';
import { formatDate, formatTime } from '@/lib/format';
import { useState } from 'react';
import { SemesterWeek } from './SemesterWeek';
import { StudyTimer } from './StudyTimer';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApp } from './context';
import { Heading, SimpleRows } from './Records';
import { Section, Empty, SubjectTag, RecordActions, Badge, Progress } from './ui';
import {
  calendarEvents,
  addDays,
  weekday,
  gradeSummary,
  round,
  workload,
  priorities,
  semesterProgress,
  assignmentProgress,
  examProgress,
} from '@/lib/calculations';
import type { Entity } from '@/lib/model';
export function Calendar({ timetable = false }: { timetable?: boolean }) {
  const { data: d, now, open } = useApp();
  const [view, setView] = useState(timetable ? 'Week' : 'Month'),
    [anchor, setAnchor] = useState(now.slice(0, 10));
  const monday = addDays(anchor, -((weekday(anchor) + 6) % 7)),
    first = anchor.slice(0, 7) + '-01';
  let start =
    view === 'Month'
      ? addDays(first, -((weekday(first) + 6) % 7))
      : view === 'Week'
        ? monday
        : anchor;
  const count = view === 'Month' ? 42 : view === 'Week' ? 7 : 1;
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  const events = calendarEvents(d, start, days.at(-1)!).filter(
    (e) => !timetable || e.entity === 'class' || e.entity === 'studySession' || e.kind === 'Break',
  );
  const move = (n: number) => {
    if (view === 'Month') {
      const date = new Date(anchor + 'T12:00:00Z');
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + n);
      setAnchor(date.toISOString().slice(0, 10));
    } else setAnchor(addDays(anchor, n * (view === 'Week' ? 7 : 1)));
  };
  return (
    <>
      <Heading
        title={timetable ? 'Timetable' : 'Academic calendar'}
        sub={
          timetable
            ? 'Your recurring classes and scheduled study. Breaks and holidays are excluded from classes.'
            : 'Deadlines, classes, study sessions and milestones in one place.'
        }
        entity={timetable ? 'class' : 'importantDate'}
      />
      <div className="calendar-toolbar">
        <div className="inline">
          <button className="icon-button" aria-label="Previous period" onClick={() => move(-1)}>
            <ChevronLeft size={21} />
          </button>
          <button className="button secondary" onClick={() => setAnchor(now.slice(0, 10))}>
            Today
          </button>
          <button className="icon-button" aria-label="Next period" onClick={() => move(1)}>
            <ChevronRight size={21} />
          </button>
          <strong>
            {new Date(anchor + 'T12:00:00').toLocaleDateString('en-AU', {
              month: 'long',
              year: 'numeric',
            })}
          </strong>
        </div>
        <div className="tabs">
          {(timetable ? ['Day', 'Week'] : ['Month', 'Week', 'Day']).map((v) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
        <DateTimeInput
          autoComplete="off"
          aria-label="Go to date"
          type="date"
          value={anchor}
          onChange={(e) => e.target.value && setAnchor(e.target.value)}
        />
      </div>
      <div className={'calendar ' + view.toLowerCase()}>
        {days.map((day) => {
          const daily = events.filter(
            (e) =>
              e.start.slice(0, 10) === day ||
              (e.entity === 'importantDate' &&
                e.start.slice(0, 10) <= day &&
                (e.end ?? e.start).slice(0, 10) >= day),
          );
          return (
            <div
              key={day}
              className={
                'calendar-day ' +
                (day === now.slice(0, 10) ? 'is-today ' : '') +
                (day.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : '')
              }
            >
              <button
                className="day-label"
                aria-label={
                  'Add ' + (timetable ? 'study session' : 'task') + ' on ' + formatDate(day)
                }
                onClick={() =>
                  open({
                    entity: timetable ? 'studySession' : 'task',
                    prefill: { dueAt: day + 'T17:00' },
                  })
                }
              >
                <span>
                  {new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}
                </span>
                <b>{view === 'Month' ? Number(day.slice(8)) : formatDate(day)}</b>
              </button>
              {daily.map((e, i) => (
                <button
                  key={e.id + e.kind + i}
                  className={
                    'calendar-event ' +
                    (e.entity === 'exam' ? 'exam-event' : e.kind === 'Break' ? 'break-event' : '')
                  }
                  style={{
                    borderLeftColor:
                      d.subject.find((s) => s.id === e.subjectId)?.color ?? '#8290a8',
                  }}
                  onClick={() =>
                    open({
                      entity: e.entity as Entity,
                      row: d[e.entity as Entity].find((x) => x.id === e.id),
                    })
                  }
                >
                  <span>
                    {e.kind === 'Break'
                      ? 'Semester Break'
                      : formatTime(e.start) +
                        (e.end?.includes('T') ? '–' + formatTime(e.end) : '') +
                        ' · ' +
                        e.kind}
                  </span>
                  <strong>{e.name}</strong>
                  {view !== 'Month' && (
                    <small>{d.class.find((c) => c.id === e.id)?.location ?? ''}</small>
                  )}
                </button>
              ))}
              {!daily.length && view !== 'Month' && <p className="muted">Nothing scheduled</p>}
            </div>
          );
        })}
      </div>
      {timetable && (
        <Section
          title="Manage recurring classes"
          sub="Edit a class to update the whole weekly series."
        >
          <SimpleRows entity="class" rows={d.class} />
        </Section>
      )}
      {!timetable && (
        <Section
          title="Important dates"
          action={
            <button className="text-button" onClick={() => open({ entity: 'importantDate' })}>
              <Plus size={17} />
              Add date
            </button>
          }
        >
          <SimpleRows entity="importantDate" rows={d.importantDate} />
        </Section>
      )}
    </>
  );
}
export function Study() {
  const { data: d, now } = useApp();
  const [period, setPeriod] = useState('Week');
  const start =
    period === 'Day'
      ? now.slice(0, 10)
      : period === 'Week'
        ? addDays(now, -((weekday(now) + 6) % 7))
        : now.slice(0, 7) + '-01';
  const rows = d.studySession.filter((s) => s.dueAt.slice(0, 10) >= start && s.dueAt <= now);
  const actual = rows.reduce((n, s) => n + s.actualHours, 0),
    planned = rows.reduce((n, s) => n + s.plannedHours, 0);
  const bySubject: (import('@/lib/model').RecordRow & { hours: number })[] = d.subject.map((s) => ({
    ...s,
    hours: rows.filter((r) => r.subjectId === s.id).reduce((n, r) => n + r.actualHours, 0),
  }));
  return (
    <>
      <Heading
        title="Study planner"
        sub="Make time for focused work, then record the time you actually spent."
        entity="studySession"
      />
      <Section title="Study timer">
        <StudyTimer />
      </Section>
      <details className="more-fields">
        <summary>Study history & hours</summary>
        <div className="tabs">
          {['Day', 'Week', 'Month'].map((p) => (
            <button key={p} className={p === period ? 'active' : ''} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="metrics">
          <div>
            <span>Actual hours this {period.toLowerCase()}</span>
            <strong>{round(actual)}h</strong>
            <small>Recorded against session dates</small>
          </div>
          <div>
            <span>Planned hours to now</span>
            <strong>{round(planned)}h</strong>
            <small>Plans up to the current time</small>
          </div>
          <div>
            <span>Sessions completed</span>
            <strong>{rows.filter((r) => r.completed).length}</strong>
            <small>This {period.toLowerCase()}</small>
          </div>
        </div>
        <Section title="Hours by subject">
          <div className="distribution">
            {bySubject.map((s) => (
              <div key={s.id}>
                <SubjectTag id={s.id} />
                <div className="bar">
                  <i
                    style={{
                      width: `${actual ? (s.hours / actual) * 100 : 0}%`,
                      background: s.color,
                    }}
                  />
                </div>
                <strong>{round(s.hours)}h</strong>
              </div>
            ))}
          </div>
        </Section>
      </details>
      <Section title="Planned & completed sessions">
        <SimpleRows
          entity="studySession"
          rows={[...d.studySession].sort((a, b) => a.dueAt.localeCompare(b.dueAt))}
        />
      </Section>
    </>
  );
}
export function Grades() {
  const { data: d, open } = useApp();
  const [target, setTarget] = useState(75);
  return (
    <>
      <Heading
        title="Grades"
        sub="See what you have earned, and what you need next."
        entity="grade"
      />
      <details className="more-fields">
        <summary>Calculate a target grade</summary>
        <Section
          title="Target grade calculator"
          sub="Required average across all remaining subject weighting."
        >
          <label className="target-input">
            Target overall percentage
            <input
              autoComplete="off"
              aria-label="Target overall percentage"
              type="number"
              min={0}
              max={100}
              value={target}
              onChange={(e) => setTarget(Math.min(100, Math.max(0, Number(e.target.value))))}
            />
          </label>
          <p className="muted">
            Current grade averages only marked assessments. Earned contribution is percentage points
            towards your final subject result. Unrecorded assessment weights still count as
            remaining.
          </p>
        </Section>
      </details>
      {d.subject.map((s) => {
        const g = gradeSummary(s.id, d, target);
        return (
          <Section title={`${s.code} · ${s.name}`} key={s.id}>
            <div className="grade-metrics">
              <div>
                <span>Current grade</span>
                <strong>{g.current === null ? '—' : g.current + '%'}</strong>
              </div>
              <div>
                <span>Earned contribution</span>
                <strong>{g.weighted} / 100</strong>
              </div>
              <div>
                <span>Weighting marked</span>
                <strong>{g.completed}%</strong>
              </div>
              <div>
                <span>Weighting remaining</span>
                <strong>{g.remaining}%</strong>
              </div>
              <div>
                <span>Needed for {target}% overall</span>
                <strong>
                  {g.required === null
                    ? g.weighted >= target
                      ? 'Achieved'
                      : 'Not achieved'
                    : g.required > 100
                      ? 'Not achievable'
                      : g.required <= 0
                        ? 'Target secured'
                        : g.required + '%'}
                </strong>
              </div>
            </div>
            {g.total !== 100 && (
              <p className="notice">
                You have entered {g.total}% of this subject’s assessment weighting. Add the missing
                assessments for a complete view.
              </p>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Weight</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Contribution</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.weighting}%</td>
                      <td>{r.grade ? `${r.grade.score} / ${r.grade.maximum}` : 'Not marked'}</td>
                      <td>{r.percentage === null ? '—' : round(r.percentage) + '%'}</td>
                      <td>{round(r.contribution)} points</td>
                      <td>
                        {r.grade ? (
                          <RecordActions entity="grade" row={r.grade} />
                        ) : (
                          <button
                            className="text-button"
                            onClick={() =>
                              open({
                                entity: 'grade',
                                prefill:
                                  r.kind === 'assignment'
                                    ? { assignmentId: r.id }
                                    : { examId: r.id },
                              })
                            }
                          >
                            Add grade
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
      {!d.subject.length && (
        <Empty
          title="No subjects yet"
          text="Add a subject, then enter its assessments and grades."
        />
      )}
    </>
  );
}
export function Analytics() {
  const { data: d, now } = useApp();
  const [horizon, setHorizon] = useState(14);
  const f = workload(d, now, horizon),
    r = priorities(d, now),
    done = d.task.filter((t) => t.status === 'Completed').length;
  const total = d.studySession.reduce((s, x) => s + x.actualHours, 0);
  const max = Math.max(d.setting.dailyHours, ...f.bins.map((b) => b.hours), 1);
  const weekly = Array.from({ length: 4 }, (_, i) => {
    const start = addDays(now, -((weekday(now) + 6) % 7) - i * 7),
      end = addDays(start, 6);
    return {
      start,
      hours: round(
        d.studySession
          .filter((s) => s.dueAt.slice(0, 10) >= start && s.dueAt.slice(0, 10) <= end)
          .reduce((n, s) => n + s.actualHours, 0),
      ),
      tasks: d.task.filter(
        (t) => t.completedAt?.slice(0, 10) >= start && t.completedAt?.slice(0, 10) <= end,
      ).length,
    };
  });
  return (
    <>
      <Heading title="Workload & progress" sub="A practical forecast to help you plan ahead." />
      <div className="metrics">
        <div>
          <span>Assignments submitted</span>
          <strong>
            {d.assignment.filter((a) => a.status === 'Submitted').length}
            <small> / {d.assignment.length}</small>
          </strong>
        </div>
        <div>
          <span>Tasks completed</span>
          <strong>
            {done}
            <small> / {d.task.length}</small>
          </strong>
        </div>
        <div>
          <span>Study time recorded</span>
          <strong>{round(total)}h</strong>
        </div>
      </div>
      <Section
        title="Workload forecast"
        sub={`Estimated remaining work spread across available days. Your capacity: ${d.setting.dailyHours}h/day.`}
        action={
          <div className="tabs">
            {[7, 14, 30].map((n) => (
              <button
                className={n === horizon ? 'active' : ''}
                key={n}
                onClick={() => setHorizon(n)}
              >
                {n} days
              </button>
            ))}
          </div>
        }
      >
        <div
          className="workload-chart"
          role="img"
          aria-label={`${f.total} estimated work hours over ${horizon} days. ${f.collisions.length} heavy workload periods.`}
        >
          {f.bins.map((b) => (
            <div
              key={b.date}
              className="workload-column"
              title={`${formatDate(b.date)}: ${b.hours} hours, ${b.deadlines} deadlines`}
            >
              <span>{b.hours}</span>
              <div>
                <i
                  className={b.hours > d.setting.dailyHours ? 'heavy' : ''}
                  style={{ height: `${(b.hours / max) * 100}%` }}
                />
              </div>
              <small>{b.date.slice(8)}</small>
            </div>
          ))}
        </div>
        <p className="muted">
          Amber bars exceed your daily capacity. Assessment hours and their linked tasks are counted
          once. Combined weightings below may span several subjects.
        </p>
        {f.collisions.map((c) => (
          <p className="notice" key={c.start}>
            Heavy workload {formatDate(c.start)}–{formatDate(c.end)}: {c.count} assessments,{' '}
            {c.weight}% combined weighting, {c.hours}h of work.
          </p>
        ))}
        {!f.collisions.length && (
          <p className="success-text">No major workload collisions in this period.</p>
        )}
      </Section>
      <Section title="Semester progress">
        {d.semester.map((s) => {
          const p = semesterProgress(s, now, d);
          return (
            <div className="progress-row" key={s.id}>
              <strong>{s.name}</strong>
              <SemesterWeek semester={s} now={now} data={d} />
              <Progress value={p.percent} label="Elapsed" />
              <p className="muted">
                {p.completed} assignments submitted · {p.total - p.completed} remaining ·{' '}
                {p.weightSubmitted}% combined weighting submitted · {p.weightRemaining}% remaining
                across entered subjects
              </p>
            </div>
          );
        })}
      </Section>
      <Section title="Weekly productivity">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Week starting</th>
                <th>Study hours</th>
                <th>Tasks completed</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.start}>
                  <td>{formatDate(w.start)}</td>
                  <td>{w.hours}h</td>
                  <td>{w.tasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="two-columns">
        <Section title="Assignment progress">
          {d.assignment.map((a) => (
            <div className="progress-row" key={a.id}>
              <strong>{a.name}</strong>
              <Progress value={assignmentProgress(a, d)} />
            </div>
          ))}
        </Section>
        <Section title="Exam preparation">
          {d.exam.map((e) => (
            <div className="progress-row" key={e.id}>
              <strong>
                {d.subject.find((s) => s.id === e.subjectId)?.code} · {e.name}
              </strong>
              <Progress value={examProgress(e, d)} label="Revision" />
            </div>
          ))}
        </Section>
      </div>
      <Section
        title="How the priority ranking works"
        sub="A transparent local calculation. No AI service or API is used."
      >
        <p>
          Score = urgency + weighting × 0.2 + incomplete progress × 0.1 + daily work pressure +
          difficulty + overdue-task penalty. Critical starts at 80, High at 60 and Medium at 35.
          Scores are relative priorities, not percentages or predicted grades.
        </p>
        <p className="muted">
          Urgency contributes 60 for overdue work, 45 for today/tomorrow, 36 within 3 days, 26
          within 7, 16 within 14 and 5 otherwise. Daily work pressure is capped at 15; overdue tasks
          add 5 each, capped at 15. Exam difficulty uses 6 minus confidence.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Work</th>
                <th>Score</th>
                <th>Urgency</th>
                <th>Weight</th>
                <th>Incomplete</th>
                <th>Load</th>
                <th>Difficulty</th>
                <th>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {r.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>
                    <Badge>{x.level}</Badge> {x.score}
                  </td>
                  {Object.entries(x.breakdown).map(([k, v]) => (
                    <td key={k}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
