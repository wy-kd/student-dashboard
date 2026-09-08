'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { GripVertical, MoveDownRight } from 'lucide-react';
import { useProductivity } from './productivity';
import { Section, Empty, TaskRow, Badge, SubjectTag, Progress } from './ui';
import {
  priorities,
  calendarEvents,
  semesterProgress,
  assignmentProgress,
  examProgress,
  workload,
  gradeSummary,
  addDays,
} from '@/lib/calculations';
import {
  widgetNames,
  readLayout,
  defaultLayout,
  moveWidget,
  type Breakpoint,
  type WidgetId,
  type Layout,
} from '@/lib/dashboard-layout';
import { StudyTimer } from './StudyTimer';
import { Today, WeeklySummary } from './DailyPlanning';
export function Dashboard({ todayOnly = false }: { todayOnly?: boolean }) {
  if (todayOnly) return <Today />;
  return <WidgetDashboard />;
}
function WidgetDashboard() {
  const { data: d, now, go, open, state, act, notify } = useProductivity();
  const [editing, setEditing] = useState(false),
    [layout, setLayout] = useState<Layout>(() => readLayout(state?.preference?.layout)),
    [bp, setBp] = useState<Breakpoint>('desktop'),
    [drag, setDrag] = useState<WidgetId | null>(null),
    [saving, setSaving] = useState(false),
    [editRevision, setEditRevision] = useState(0);
  useEffect(() => {
    if (!editing) setLayout(readLayout(state?.preference?.layout));
  }, [state?.preference?.layout, editing]);
  useEffect(() => {
    const resize = () =>
      setBp(window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1100 ? 'tablet' : 'desktop');
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const today = now.slice(0, 10),
    rank = priorities(d, now),
    semester = d.semester.find((s) => s.id === d.setting.activeSemesterId) ?? d.semester[0];
  const schedule = calendarEvents(d, today, today).filter(
    (e) => e.entity === 'class' || e.entity === 'studySession',
  );
  const tasks = d.task.filter((t) => t.status !== 'Completed' && t.dueAt?.slice(0, 10) <= today);
  const upcoming = [
    ...rank.filter((r) => r.dueAt >= now).map((r) => ({ ...r, entity: r.entity })),
    ...d.importantDate
      .filter((x) => x.dueAt >= now)
      .map((x) => ({ ...x, name: x.name, dueAt: x.dueAt, entity: 'importantDate' })),
  ]
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 5);
  const change = (id: WidgetId, patch: Partial<Layout['desktop'][number]>) =>
    setLayout((l) => ({ ...l, [bp]: l[bp].map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  function content(id: WidgetId) {
    switch (id) {
      case 'next':
        return rank.length ? (
          <div className="rank-list">
            {rank.slice(0, 3).map((r, i) => (
              <button
                className={'rank-item ' + (i === 0 ? 'first' : '')}
                key={r.id}
                onClick={() => go(`/${r.entity === 'exam' ? 'exams' : 'assignments'}/${r.id}`)}
              >
                <span className="rank-number">{i + 1}</span>
                <div className="grow">
                  <div className="spread">
                    <SubjectTag id={r.subjectId} />
                    <Badge>{r.level}</Badge>
                  </div>
                  <h3>{r.name}</h3>
                  <p>
                    {r.reason} · {r.progress}% complete
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="Your next step starts here"
            text="Add an assignment or exam for a suggested next step."
            action={() => open({ entity: 'assignment' })}
          />
        );
      case 'timer':
        return <StudyTimer compact />;
      case 'today':
        return (
          <>
            <div className="widget-list">
              {schedule.slice(0, 4).map((e) => (
                <button
                  key={e.id}
                  onClick={() =>
                    open({
                      entity: e.entity as any,
                      row: d[e.entity as 'class'].find((x) => x.id === e.id),
                    })
                  }
                >
                  <time>{e.start.slice(11)}</time>
                  <span>{e.name}</span>
                </button>
              ))}
            </div>
            {tasks.slice(0, 4).map((t) => (
              <TaskRow key={t.id} row={t} />
            ))}
            {!schedule.length && !tasks.length && (
              <Empty title="Room for focused work" text="Plan a session or start your timer." />
            )}
            <button className="text-button" onClick={() => go('/today')}>
              View Today →
            </button>
          </>
        );
      case 'upcoming':
        return upcoming.length ? (
          <div className="widget-list">
            {upcoming.map((r) => (
              <button
                key={r.id}
                onClick={() =>
                  r.entity === 'importantDate'
                    ? open({ entity: 'importantDate', row: r as any })
                    : go(`/${r.entity === 'exam' ? 'exams' : 'assignments'}/${r.id}`)
                }
              >
                <time>
                  {r.dueAt.slice(8, 10)}{' '}
                  {new Date(r.dueAt.slice(0, 10) + 'T12:00').toLocaleDateString('en-AU', {
                    month: 'short',
                  })}
                </time>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="No upcoming deadlines"
            text="Your assignments, exams and important dates appear here."
          />
        );
      case 'alerts': {
        const urgent = rank.filter((x) => x.dueAt < now || x.level === 'Critical');
        return (
          <>
            {d.milestone
              .filter((m) => !m.done && m.dueAt < now)
              .slice(0, 2)
              .map((m) => (
                <p key={m.id}>Missed milestone: {m.name}</p>
              ))}
            {urgent.slice(0, 3).map((r) => (
              <p key={r.id}>
                {r.name} · {r.reason.split(' · ')[0]}
              </p>
            ))}
            {tasks.some((t) => t.dueAt < now) && (
              <button className="text-button" onClick={() => go('/tasks')}>
                {tasks.filter((t) => t.dueAt < now).length} overdue tasks
              </button>
            )}
            {!urgent.length &&
              !d.milestone.some((m) => !m.done && m.dueAt < now) &&
              !tasks.some((t) => t.dueAt < now) && (
                <p className="muted">Nothing urgent needs attention.</p>
              )}
            <button className="text-button" onClick={() => go('/notifications')}>
              Notification Centre →
            </button>
          </>
        );
      }
      case 'classes':
        return (
          <div className="widget-list">
            {schedule
              .filter((e) => e.entity === 'class')
              .map((e) => (
                <button key={e.id} onClick={() => go('/timetable')}>
                  {e.start.slice(11)} · {e.name}
                </button>
              ))}
            {!schedule.some((e) => e.entity === 'class') && <p>No classes today.</p>}
          </div>
        );
      case 'tasks':
        return (
          <>
            {d.task
              .filter((t) => t.status !== 'Completed')
              .slice(0, 5)
              .map((t) => (
                <TaskRow key={t.id} row={t} />
              ))}
            <button className="text-button" onClick={() => go('/tasks')}>
              All tasks →
            </button>
          </>
        );
      case 'assignments':
        if (!d.assignment.some((a) => a.status !== 'Submitted'))
          return (
            <Empty
              title="No unfinished assignments"
              text="Add an assessment when you receive it."
              action={() => open({ entity: 'assignment' })}
            />
          );
        return (
          <>
            {d.assignment
              .filter((a) => a.status !== 'Submitted')
              .slice(0, 4)
              .map((a) => (
                <div className="progress-row" key={a.id}>
                  <button className="text-button" onClick={() => go('/assignments/' + a.id)}>
                    {a.name}
                  </button>
                  <Progress value={assignmentProgress(a, d)} />
                </div>
              ))}
          </>
        );
      case 'exams':
        if (!d.exam.some((e) => !e.completed))
          return (
            <Empty
              title="No exams to prepare for"
              text="Add an exam to organise your revision."
              action={() => open({ entity: 'exam' })}
            />
          );
        return (
          <>
            {d.exam
              .filter((e) => !e.completed)
              .slice(0, 4)
              .map((e) => (
                <div className="progress-row" key={e.id}>
                  <button className="text-button" onClick={() => go('/exams/' + e.id)}>
                    {e.name}
                  </button>
                  <Progress value={examProgress(e, d)} />
                </div>
              ))}
          </>
        );
      case 'calendar':
        return (
          <>
            <p>
              {calendarEvents(d, today, addDays(today, 6)).length} events in the next seven days.
            </p>
            <button className="button secondary" onClick={() => go('/calendar')}>
              Open calendar
            </button>
          </>
        );
      case 'semester':
        return semester ? (
          <>
            <p>{semester.name}</p>
            <Progress value={semesterProgress(semester, now, d).percent} label="Semester elapsed" />
          </>
        ) : (
          <p>Add a semester to begin.</p>
        );
      case 'hours':
        return (
          <p>
            {d.studySession
              .filter((s) => s.dueAt.slice(0, 10) >= addDays(today, -6))
              .reduce((n, s) => n + s.actualHours, 0)
              .toFixed(1)}{' '}
            hours recorded in the last seven days.
          </p>
        );
      case 'workload': {
        const f = workload(d, now);
        return (
          <>
            <p>{f.total}h estimated over the next 14 days.</p>
            <p>{f.collisions.length} heavy workload periods.</p>
            <button className="text-button" onClick={() => go('/analytics')}>
              Review forecast →
            </button>
          </>
        );
      }
      case 'grades':
        if (!d.subject.length)
          return (
            <Empty
              title="No grades yet"
              text="Add your subjects and assessments to begin."
              action={() => go('/grades')}
            />
          );
        return (
          <>
            {d.subject.map((s) => (
              <p key={s.id}>
                {s.code} · {gradeSummary(s.id, d).current ?? '—'}%
              </p>
            ))}
          </>
        );
      case 'quick':
        return (
          <div className="inline">
            {(
              ['task', 'assignment', 'exam', 'studySession', 'class', 'importantDate'] as const
            ).map((entity) => (
              <button className="button secondary" key={entity} onClick={() => open({ entity })}>
                {entity === 'studySession'
                  ? 'Study session'
                  : entity === 'importantDate'
                    ? 'Important date'
                    : entity}
              </button>
            ))}
          </div>
        );
      case 'weekly':
        return <WeeklySummary compact />;
    }
  }
  async function done() {
    setSaving(true);
    try {
      await act('layout', { layout, revision: editRevision });
      setEditing(false);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date(today + 'T12:00').toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            {semester
              ? ` · Week ${semesterProgress(semester, now, d).week} of ${semester.teachingWeeks}`
              : ''}
          </p>
          <h1>Dashboard</h1>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            if (editing) done();
            else {
              setEditRevision(state?.preference?.revision ?? 0);
              setEditing(true);
            }
          }}
          disabled={saving}
        >
          {editing ? 'Done' : 'Edit Dashboard'}
        </button>
      </div>
      {editing && (
        <div className="layout-toolbar">
          <strong>Editing {bp} layout</strong>
          <p>
            {bp === 'mobile'
              ? 'Use Move up / down to reorder widgets.'
              : 'Drag to reorder, or use Move up / down and the size controls.'}{' '}
            Changes save when you select Done.
          </p>
          <div className="inline">
            <label>
              Add Widget{' '}
              <select
                value=""
                onChange={(e) => change(e.target.value as WidgetId, { hidden: false })}
              >
                <option value="">Choose widget…</option>
                {layout[bp]
                  .filter((x) => x.hidden)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {widgetNames[x.id]}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button secondary"
              onClick={() => setLayout((l) => ({ ...l, [bp]: defaultLayout()[bp] }))}
            >
              Reset Layout
            </button>
            <button className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className={'widget-grid ' + (editing ? 'is-editing' : '')} data-layout={bp}>
        {layout[bp]
          .filter((x) => !x.hidden)
          .map((w) => (
            <article
              className="dashboard-widget"
              key={w.id}
              style={{ '--widget-width': w.width, '--widget-height': w.height } as CSSProperties}
              onDragOver={(e) => editing && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) {
                  setLayout((l) =>
                    moveWidget(
                      l,
                      bp,
                      drag,
                      l[bp].findIndex((x) => x.id === w.id) - l[bp].findIndex((x) => x.id === drag),
                    ),
                  );
                  setDrag(null);
                }
              }}
            >
              {editing && (
                <div className="widget-controls">
                  {bp !== 'mobile' && (
                    <button
                      draggable
                      aria-label={'Drag ' + widgetNames[w.id]}
                      onDragStart={() => setDrag(w.id)}
                    >
                      <GripVertical size={18} />
                    </button>
                  )}
                  <button onClick={() => setLayout((l) => moveWidget(l, bp, w.id, -1))}>
                    Move up
                  </button>
                  <button onClick={() => setLayout((l) => moveWidget(l, bp, w.id, 1))}>
                    Move down
                  </button>
                  <button onClick={() => change(w.id, { hidden: true })}>Hide</button>
                  {bp !== 'mobile' && (
                    <label>
                      Width
                      <select
                        aria-label={widgetNames[w.id] + ' width'}
                        value={w.width}
                        onChange={(e) => change(w.id, { width: Number(e.target.value) })}
                      >
                        {Array.from({ length: bp === 'desktop' ? 10 : 4 }, (_, i) => i + 3).map(
                          (n) => (
                            <option key={n}>{n}</option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                  <label>
                    Height
                    <select
                      aria-label={widgetNames[w.id] + ' height'}
                      value={w.height}
                      onChange={(e) => change(w.id, { height: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <Section title={widgetNames[w.id]}>{content(w.id)}</Section>
              {editing && bp !== 'mobile' && (
                <button
                  className="resize-handle"
                  aria-label={'Resize ' + widgetNames[w.id]}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const x = e.clientX,
                      y = e.clientY,
                      el = e.currentTarget;
                    const up = (ev: PointerEvent) => {
                      change(w.id, {
                        width: Math.max(
                          3,
                          Math.min(
                            bp === 'desktop' ? 12 : 6,
                            w.width + Math.round((ev.clientX - x) / 70),
                          ),
                        ),
                        height: Math.max(
                          1,
                          Math.min(4, w.height + Math.round((ev.clientY - y) / 120)),
                        ),
                      });
                      el.removeEventListener('pointerup', up);
                    };
                    el.addEventListener('pointerup', up, { once: true });
                  }}
                >
                  <MoveDownRight size={18} />
                </button>
              )}
            </article>
          ))}
      </div>
      {!layout[bp].some((x) => !x.hidden) && (
        <Empty title="Your dashboard is clear" text="Use Edit Dashboard to add widgets." />
      )}
    </>
  );
}
