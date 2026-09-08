'use client';
import { formatDate, formatTime, formatDateTime } from '@/lib/format';
import { useState } from 'react';
import { RecurringTasks } from './RecurringTasks';
import { Plus, ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useApp, titleFor } from './context';
import {
  Section,
  Empty,
  TaskRow,
  AssessmentCard,
  SubjectTag,
  RecordActions,
  Progress,
  Badge,
  Due,
} from './ui';
import {
  addDays,
  assignmentProgress,
  examProgress,
  health,
  remaining,
  weekday,
  round,
} from '@/lib/calculations';
import { fields, type Entity, type RecordRow } from '@/lib/model';
export function Heading({
  title,
  sub,
  entity,
  prefill,
}: {
  title: string;
  sub?: string;
  entity?: Entity;
  prefill?: any;
}) {
  const { open } = useApp();
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {entity && (
        <button className="button primary" onClick={() => open({ entity, prefill })}>
          <Plus size={18} />
          Add{' '}
          {entity === 'studySession'
            ? 'session'
            : entity === 'weeklyContent'
              ? 'content'
              : entity === 'examTopic'
                ? 'topic'
                : entity === 'importantDate'
                  ? 'date'
                  : entity}
        </button>
      )}
    </div>
  );
}
export function Tasks() {
  const { data: d, now } = useApp();
  const [filter, setFilter] = useState('Today'),
    [query, setQuery] = useState('');
  const today = now.slice(0, 10),
    endWeek = addDays(today, 7 - (weekday(today) || 7));
  const options = [
    'Today',
    'Tomorrow',
    'This Week',
    'Upcoming',
    'Overdue',
    'Completed',
    'By Subject',
    'By Assignment',
    'All',
  ];
  let tasks = d.task
    .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    .filter((t) =>
      filter === 'All'
        ? true
        : filter === 'Completed'
          ? t.status === 'Completed'
          : t.status !== 'Completed',
    );
  tasks = tasks
    .filter((t) =>
      filter === 'Today'
        ? t.dueAt?.slice(0, 10) === today
        : filter === 'Tomorrow'
          ? t.dueAt?.slice(0, 10) === addDays(today, 1)
          : filter === 'This Week'
            ? t.dueAt && t.dueAt.slice(0, 10) >= today && t.dueAt.slice(0, 10) <= endWeek
            : filter === 'Overdue'
              ? t.dueAt && t.dueAt < now
              : filter === 'Upcoming'
                ? t.dueAt && t.dueAt >= now
                : true,
    )
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const groups: Record<string, RecordRow[]> = {};
  for (const t of tasks) {
    const key =
      filter === 'By Subject'
        ? (d.subject.find((s) => s.id === t.subjectId)?.code ?? 'Personal')
        : filter === 'By Assignment'
          ? (d.assignment.find((a) => a.id === t.assignmentId)?.name ?? 'Standalone / exam tasks')
          : 'Tasks';
    (groups[key] ??= []).push(t);
  }
  return (
    <>
      <Heading title="Tasks" sub="Turn bigger goals into the next small step." entity="task" />
      <RecurringTasks />
      <section className="ordinary-tasks" aria-labelledby="tasks-list-heading">
        <h2 id="tasks-list-heading">Tasks</h2>
        <div className="toolbar">
          <label>
            Show{' '}
            <select
              aria-label="Task view"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <input
            autoComplete="off"
            aria-label="Filter tasks"
            placeholder="Filter tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {Object.entries(groups).map(([key, rows]) => (
          <Section key={key} title={key} sub={`${rows.length} tasks`}>
            {rows.map((t) => (
              <TaskRow key={t.id} row={t} />
            ))}
          </Section>
        ))}
        {!tasks.length && (
          <Section title={filter}>
            <Empty
              title="You’re clear here"
              text="Switch views to see other tasks, or add a new one."
            />
          </Section>
        )}
      </section>
    </>
  );
}
export function Assessments({ exam = false }: { exam?: boolean }) {
  const { data: d } = useApp();
  const [subject, setSubject] = useState(''),
    [status, setStatus] = useState('Active');
  const rows = (exam ? d.exam : d.assignment)
    .filter((x) => !subject || x.subjectId === subject)
    .filter(
      (x) =>
        status === 'All' ||
        (exam ? x.completed : x.status === 'Submitted') === (status === 'Completed'),
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return (
    <>
      <Heading
        title={exam ? 'Exams & revision' : 'Assignments'}
        sub={
          exam
            ? 'Know what to revise and how long you have.'
            : 'From the first draft to the final submission.'
        }
        entity={exam ? 'exam' : 'assignment'}
      />
      <div className="toolbar">
        <div className="tabs">
          {['Active', 'Completed', 'All'].map((o) => (
            <button className={status === o ? 'active' : ''} key={o} onClick={() => setStatus(o)}>
              {o}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">All subjects</option>
          {d.subject.map((s) => (
            <option value={s.id} key={s.id}>
              {s.code}
            </option>
          ))}
        </select>
      </div>
      <div className="card-grid">
        {rows.map((r) => (
          <AssessmentCard key={r.id} row={r} exam={exam} />
        ))}
      </div>
      {!rows.length && (
        <Empty
          title={exam ? 'No exams in this view' : 'No assignments in this view'}
          text="Add an assessment or change the filter."
        />
      )}
    </>
  );
}
export function Subjects() {
  const { data: d, go } = useApp();
  return (
    <>
      <Heading title="Subjects" sub="Everything for each unit, together." entity="subject" />
      <div className="card-grid">
        {d.subject.map((s) => (
          <article className="subject-card" key={s.id} style={{ borderTopColor: s.color }}>
            <div className="spread">
              <SubjectTag id={s.id} />
              <RecordActions entity="subject" row={s} />
            </div>
            <button className="title-link" onClick={() => go('/subjects/' + s.id)}>
              {s.name}
              <ArrowUpRight size={20} />
            </button>
            <p className="muted">{d.semester.find((t) => t.id === s.semesterId)?.name}</p>
            <div className="subject-counts">
              <span>
                <b>
                  {
                    d.assignment.filter((a) => a.subjectId === s.id && a.status !== 'Submitted')
                      .length
                  }
                </b>
                active assignments
              </span>
              <span>
                <b>
                  {d.task.filter((t) => t.subjectId === s.id && t.status !== 'Completed').length}
                </b>
                open tasks
              </span>
            </div>
          </article>
        ))}
      </div>
      {!d.subject.length && (
        <Empty
          title="Add your subjects"
          text="Create a semester in Settings, then add the units you’re taking."
        />
      )}
    </>
  );
}
export function SimpleRows({ entity, rows }: { entity: Entity; rows: RecordRow[] }) {
  const { allData, open, save, notify } = useApp();
  return rows.length ? (
    <div>
      {rows.map((r) => (
        <div className="simple-row" key={r.id}>
          {['milestone', 'weeklyContent', 'studySession'].includes(entity) && (
            <input
              autoComplete="off"
              type="checkbox"
              aria-label={'Complete ' + r.name}
              checked={entity === 'milestone' ? r.done : r.completed}
              onChange={() =>
                save(
                  entity,
                  {
                    ...r,
                    [entity === 'milestone' ? 'done' : 'completed']: !(entity === 'milestone'
                      ? r.done
                      : r.completed),
                  },
                  r,
                ).catch((e) => notify(e.message))
              }
            />
          )}
          <div className="grow">
            <button className="plain-title" onClick={() => open({ entity, row: r })}>
              {titleFor(entity, r, allData)}
            </button>
            <div className="metadata">
              {r.subjectId && <SubjectTag id={r.subjectId} />}
              <span>
                {r.dueAt ? formatDateTime(r.dueAt) : null}
                {entity === 'semester'
                  ? `${formatDate(r.startDate)}–${formatDate(r.endDate)} · ${r.teachingWeeks} teaching weeks${r.examStart ? ' · Exams ' + formatDate(r.examStart) + '–' + formatDate(r.examEnd) : ''}`
                  : ''}
                {r.week ? 'Week ' + r.week : ''}
                {r.startTime
                  ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.day]} · ${formatTime(r.startTime)}–${formatTime(r.endTime)} · ${r.location}`
                  : ''}
                {entity === 'studySession'
                  ? ` · planned ${Math.round(r.plannedHours * 60)}m · actual ${Math.round(r.actualHours * 60)}m`
                  : ''}
              </span>
              {r.kind && <Badge>{r.kind}</Badge>}
              {r.status && <Badge>{r.status}</Badge>}
            </div>
          </div>
          <RecordActions entity={entity} row={r} />
        </div>
      ))}
    </div>
  ) : (
    <Empty title="Nothing added yet" text="Use the add control to start planning." />
  );
}
export function Detail({ entity, id }: { entity: 'assignment' | 'exam' | 'subject'; id: string }) {
  const { allData: d, now, open, go, save, notify } = useApp();
  const r = d[entity].find((r) => r.id === id);
  if (!r)
    return (
      <Empty
        title="Record not found"
        text="It may have been deleted. Use the sidebar to return to your workspace."
      />
    );
  const isSubject = entity === 'subject',
    exam = entity === 'exam';
  const tasks = d.task.filter((t) =>
    isSubject ? t.subjectId === id : exam ? t.examId === id : t.assignmentId === id,
  );
  const prefill = isSubject
    ? { subjectId: id }
    : exam
      ? { examId: id, subjectId: r.subjectId }
      : { assignmentId: id, subjectId: r.subjectId };
  const linkedHours = d.studySession
    .filter((s) => (exam ? s.examId === id : s.assignmentId === id))
    .reduce((sum, s) => sum + s.actualHours, 0);
  return (
    <>
      <button
        className="text-button back"
        onClick={() => go('/' + (isSubject ? 'subjects' : exam ? 'exams' : 'assignments'))}
      >
        <ArrowLeft size={17} />
        Back to {isSubject ? 'subjects' : exam ? 'exams' : 'assignments'}
      </button>
      <div className="page-heading">
        <div>
          <SubjectTag id={isSubject ? id : r.subjectId} />
          <h1>{r.name}</h1>
          {r.description && <p>{r.description}</p>}
        </div>
        <button className="button secondary" onClick={() => open({ entity, row: r })}>
          Edit details
        </button>
      </div>
      {!isSubject && (
        <div className="detail-summary">
          <div>
            {(exam ? r.completed : r.status === 'Submitted') ? (
              <Badge>{exam ? 'Completed' : 'Submitted'}</Badge>
            ) : (
              <Due at={r.dueAt} exam={exam} />
            )}
            <p>{formatDateTime(r.dueAt)}</p>
          </div>
          <div>
            <strong>{r.weighting}%</strong>
            <p>Assessment weighting</p>
          </div>
          <div>
            <strong>{remaining(r, d, exam)}h</strong>
            <p>Estimated work remaining</p>
          </div>
          <div>
            <strong>{round((r.actualHours ?? 0) + linkedHours)}h</strong>
            <p>Logged + study sessions</p>
          </div>
          <div>
            <Badge>
              {exam
                ? r.completed
                  ? 'Completed'
                  : 'Confidence ' + r.confidence + '/5'
                : health(r, d, now)}
            </Badge>
            <Progress value={exam ? examProgress(r, d) : assignmentProgress(r, d)} />
          </div>
        </div>
      )}
      {isSubject && (
        <Section title="Subject information">
          <div className="metadata">
            <span>Lecturer: {r.lecturer || 'Not entered'}</span>
            <span>Tutor: {r.tutor || 'Not entered'}</span>
          </div>
        </Section>
      )}
      {isSubject && (
        <>
          <Section
            title="Assignments"
            action={
              <button
                className="text-button"
                onClick={() => open({ entity: 'assignment', prefill })}
              >
                <Plus size={16} />
                Add assignment
              </button>
            }
          >
            <div className="card-grid">
              {d.assignment
                .filter((a) => a.subjectId === id)
                .map((a) => (
                  <AssessmentCard key={a.id} row={a} />
                ))}
            </div>
          </Section>
          <Section
            title="Exams"
            action={
              <button className="text-button" onClick={() => open({ entity: 'exam', prefill })}>
                <Plus size={16} />
                Add exam
              </button>
            }
          >
            <div className="card-grid">
              {d.exam
                .filter((a) => a.subjectId === id)
                .map((a) => (
                  <AssessmentCard key={a.id} row={a} exam />
                ))}
            </div>
          </Section>
          <Section
            title="Weekly content"
            action={
              <button
                className="text-button"
                onClick={() => open({ entity: 'weeklyContent', prefill })}
              >
                <Plus size={16} />
                Add content
              </button>
            }
          >
            <SimpleRows
              entity="weeklyContent"
              rows={d.weeklyContent
                .filter((c) => c.subjectId === id)
                .sort((a, b) => a.week - b.week)}
            />
          </Section>
          <Section title="Recurring classes">
            <SimpleRows entity="class" rows={d.class.filter((c) => c.subjectId === id)} />
          </Section>
        </>
      )}
      {exam && (
        <Section
          title="Revision topics & practice exams"
          sub="Not Started → Learning → Revising → Confident"
          action={
            <button
              className="text-button"
              onClick={() => open({ entity: 'examTopic', prefill: { examId: id } })}
            >
              <Plus size={16} />
              Add topic
            </button>
          }
        >
          <SimpleRows entity="examTopic" rows={d.examTopic.filter((t) => t.examId === id)} />
        </Section>
      )}
      {!isSubject && !exam && (
        <details className="more-fields">
          <summary>Timeline & milestones</summary>
          <Section
            title="Assignment timeline"
            action={
              <button
                className="text-button"
                onClick={() => open({ entity: 'milestone', prefill: { assignmentId: id } })}
              >
                <Plus size={16} />
                Add milestone
              </button>
            }
          >
            <div className="timeline">
              {d.milestone
                .filter((m) => m.assignmentId === id)
                .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                .map((m) => (
                  <div key={m.id} className={'timeline-event ' + (m.done ? 'done' : '')}>
                    <div className="timeline-date">{formatDate(m.dueAt)}</div>
                    <SimpleRows entity="milestone" rows={[m]} />
                    {!m.done && m.dueAt < now && <Badge>Missed</Badge>}
                  </div>
                ))}
              <div className="timeline-event">
                <div className="timeline-date">{formatDate(r.dueAt)}</div>
                <strong>Submission · {formatTime(r.dueAt)}</strong>
                <Badge>{r.status}</Badge>
              </div>
            </div>
          </Section>
        </details>
      )}
      <Section
        title={exam ? 'Revision tasks' : 'Tasks'}
        action={
          <button className="text-button" onClick={() => open({ entity: 'task', prefill })}>
            <Plus size={16} />
            Add task
          </button>
        }
      >
        {tasks.length ? (
          tasks.map((t) => <TaskRow key={t.id} row={t} />)
        ) : (
          <Empty
            title="Break it into smaller steps"
            text="Add tasks with hour estimates to track your work."
          />
        )}
      </Section>
      <Section
        title="Study sessions"
        action={
          <button className="text-button" onClick={() => open({ entity: 'studySession', prefill })}>
            <Plus size={16} />
            Plan a session
          </button>
        }
      >
        <SimpleRows
          entity="studySession"
          rows={d.studySession.filter((s) =>
            isSubject ? s.subjectId === id : exam ? s.examId === id : s.assignmentId === id,
          )}
        />
      </Section>
      <Section title="Notes & useful links">
        <p className="notes">{r.notes || 'No notes yet. Use Edit details to add them.'}</p>
        {r.links
          ?.split('\n')
          .filter((u: string) => /^https?:\/\//.test(u.trim()))
          .map((u: string) => (
            <a
              className="external-link"
              key={u}
              href={u.trim()}
              target="_blank"
              rel="noopener noreferrer"
            >
              {u}
              <ArrowUpRight size={15} />
            </a>
          ))}
      </Section>
      {!isSubject && (
        <Section
          title="Result"
          action={
            <button
              className="text-button"
              onClick={() => {
                const g = d.grade.find((g) => (exam ? g.examId === id : g.assignmentId === id));
                open({
                  entity: 'grade',
                  row: g,
                  prefill: exam ? { examId: id } : { assignmentId: id },
                });
              }}
            >
              Record / edit grade
            </button>
          }
        >
          <p>
            {(() => {
              const g = d.grade.find((g) => (exam ? g.examId === id : g.assignmentId === id));
              return g
                ? `${g.score} / ${g.maximum} · ${round((g.score / g.maximum) * 100)}% · ${round((g.score / g.maximum) * r.weighting)} percentage points towards the subject`
                : 'No grade recorded yet.';
            })()}
          </p>
        </Section>
      )}
    </>
  );
}
