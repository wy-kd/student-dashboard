import { teachingWeekInfo } from './teaching-weeks';
import type { Data, RecordRow } from './model';
export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const round = (n: number) => Math.round(n * 10) / 10;
export function civilNow(timezone = 'Australia/Brisbane', date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function dayNumber(s: string) {
  return Date.parse(s.slice(0, 10) + 'T00:00:00Z') / 86400000;
}
export function addDays(s: string, n: number) {
  return new Date((dayNumber(s) + n) * 86400000).toISOString().slice(0, 10);
}
export const weekday = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00Z').getUTCDay();
export const daysUntil = (due: string, now: string) => dayNumber(due) - dayNumber(now);
export function countdown(due: string, now: string, exam = false) {
  const n = daysUntil(due, now);
  if (due < now)
    return n < 0 ? `${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'} overdue` : 'Overdue today';
  if (n === 0) return exam ? 'Exam today' : 'Due today';
  if (n === 1) return exam ? 'Exam tomorrow' : 'Due tomorrow';
  return exam ? `${n} days until exam` : `Due in ${n} days`;
}
export function assignmentProgress(a: RecordRow, d: Data) {
  if (a.status === 'Submitted') return 100;
  const tasks = d.task.filter((t) => t.assignmentId === a.id);
  if (!tasks.length) return a.progress;
  const total = tasks.reduce((s, t) => s + (t.estimatedHours || 1), 0);
  return round(
    (tasks
      .filter((t) => t.status === 'Completed')
      .reduce((s, t) => s + (t.estimatedHours || 1), 0) /
      total) *
      100,
  );
}
export function examProgress(e: RecordRow, d: Data) {
  if (e.completed) return 100;
  const topics = d.examTopic.filter((t) => t.examId === e.id);
  const v: Record<string, number> = {
    'Not Started': 0,
    Learning: 33,
    Revising: 67,
    Confident: 100,
  };
  return topics.length
    ? round(topics.reduce((s, t) => s + v[t.status], 0) / topics.length)
    : e.progress;
}
export function remaining(a: RecordRow, d: Data, exam = false) {
  const p = exam ? examProgress(a, d) : assignmentProgress(a, d);
  const taskHours = d.task
    .filter((t) => (exam ? t.examId === a.id : t.assignmentId === a.id) && t.status !== 'Completed')
    .reduce((s, t) => s + Math.max(0, t.estimatedHours - t.actualHours), 0);
  return round(Math.max(a.estimatedHours * (1 - p / 100), taskHours));
}
export function health(a: RecordRow, d: Data, now: string) {
  if (a.status === 'Submitted') return 'Submitted';
  const ms = d.milestone.filter((m) => m.assignmentId === a.id);
  if (a.dueAt < now || ms.some((m) => !m.done && m.dueAt < now)) return 'Behind';
  const days = Math.max(1, daysUntil(a.dueAt, now));
  const work = remaining(a, d);
  if (work > days * d.setting.dailyHours) return 'At Risk';
  const start = a.releaseDate ?? addDays(a.dueAt, -21);
  const elapsed = clamp(
    ((dayNumber(now) - dayNumber(start)) / Math.max(1, dayNumber(a.dueAt) - dayNumber(start))) *
      100,
  );
  const p = assignmentProgress(a, d);
  if (p >= elapsed + 15 || (ms.some((m) => m.done && m.dueAt > now) && p >= elapsed))
    return 'Ahead';
  if (p < elapsed - 20) return 'At Risk';
  return 'On Track';
}
export function priorities(d: Data, now: string) {
  return [
    ...d.assignment.filter((a) => a.status !== 'Submitted').map((a) => ({ a, exam: false })),
    ...d.exam.filter((e) => !e.completed).map((a) => ({ a, exam: true })),
  ]
    .map(({ a, exam }) => {
      const days = daysUntil(a.dueAt, now),
        p = exam ? examProgress(a, d) : assignmentProgress(a, d),
        hours = remaining(a, d, exam);
      const overdue = d.task.filter(
        (t) =>
          (exam ? t.examId === a.id : t.assignmentId === a.id) &&
          t.status !== 'Completed' &&
          t.dueAt &&
          t.dueAt < now,
      ).length;
      const urgency =
        a.dueAt < now ? 60 : days <= 1 ? 45 : days <= 3 ? 36 : days <= 7 ? 26 : days <= 14 ? 16 : 5;
      const weight = a.weighting * 0.2,
        load = Math.min(15, (hours / Math.max(1, days)) * 3),
        difficulty = (exam ? 6 - a.confidence : a.difficulty) * 2;
      const score = Math.round(
        urgency + weight + (100 - p) * 0.1 + load + difficulty + Math.min(15, overdue * 5),
      );
      return {
        id: a.id,
        entity: exam ? 'exam' : 'assignment',
        name: a.name,
        subjectId: a.subjectId,
        dueAt: a.dueAt,
        progress: p,
        hours,
        score,
        level: score >= 80 ? 'Critical' : score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low',
        reason: `${countdown(a.dueAt, now, exam)} · ${a.weighting}% weighting · ${hours}h remaining${overdue ? ` · ${overdue} overdue tasks` : ''}`,
        breakdown: {
          urgency,
          weight: round(weight),
          incomplete: round((100 - p) * 0.1),
          load: round(load),
          difficulty,
          overdue: Math.min(15, overdue * 5),
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.dueAt.localeCompare(b.dueAt));
}
export function gradeSummary(subjectId: string, d: Data, target = 75) {
  const assessments = [
    ...d.assignment
      .filter((a) => a.subjectId === subjectId)
      .map((a) => ({ ...a, kind: 'assignment' })),
    ...d.exam.filter((e) => e.subjectId === subjectId).map((e) => ({ ...e, kind: 'exam' })),
  ] as RecordRow[];
  const rows: (RecordRow & {
    grade: RecordRow | undefined;
    percentage: number | null;
    contribution: number;
  })[] = assessments.map((a) => {
    const g = d.grade.find((g) =>
      a.kind === 'assignment' ? g.assignmentId === a.id : g.examId === a.id,
    );
    const pct = g ? (g.score / g.maximum) * 100 : null;
    return {
      ...a,
      grade: g,
      percentage: pct,
      contribution: pct === null ? 0 : (pct * a.weighting) / 100,
    };
  });
  const completed = rows.filter((r) => r.grade).reduce((s, r) => s + r.weighting, 0),
    weighted = rows.reduce((s, r) => s + r.contribution, 0),
    total = assessments.reduce((s, a) => s + a.weighting, 0),
    left = 100 - completed;
  return {
    rows,
    completed: round(completed),
    weighted: round(weighted),
    current: completed ? round((weighted / completed) * 100) : null,
    remaining: round(left),
    total: round(total),
    required: left > 0 ? round(((target - weighted) / left) * 100) : null,
  };
}
export function semesterProgress(s: RecordRow, now: string, d: Data) {
  const ids = new Set(d.subject.filter((x) => x.semesterId === s.id).map((x) => x.id));
  const assignments = d.assignment.filter((a) => ids.has(a.subjectId)),
    assessments = [...assignments, ...d.exam.filter((e) => ids.has(e.subjectId))];
  const teaching = teachingWeekInfo(s, now, d);
  return {
    percent: clamp(
      round(
        ((dayNumber(now) - dayNumber(s.startDate)) /
          Math.max(1, dayNumber(s.endDate) - dayNumber(s.startDate))) *
          100,
      ),
    ),
    week: teaching.week,
    teaching,
    completed: assignments.filter((a) => a.status === 'Submitted').length,
    total: assignments.length,
    weightSubmitted: assessments
      .filter((a) => a.status === 'Submitted' || a.completed)
      .reduce((n, a) => n + a.weighting, 0),
    weightRemaining: assessments
      .filter((a) => a.status !== 'Submitted' && !a.completed)
      .reduce((n, a) => n + a.weighting, 0),
  };
}
export type CalendarEvent = {
  id: string;
  entity: string;
  name: string;
  start: string;
  end?: string;
  subjectId?: string;
  kind: string;
};
export function calendarEvents(d: Data, start: string, end: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const [entity, kind] of [
    ['assignment', 'Assignment'],
    ['exam', 'Exam'],
    ['task', 'Task'],
    ['milestone', 'Milestone'],
    ['studySession', 'Study'],
    ['importantDate', 'Important'],
  ] as const) {
    for (const x of d[entity])
      if (x.dueAt && x.dueAt.slice(0, 10) <= end && (x.endDate ?? x.dueAt.slice(0, 10)) >= start)
        events.push({
          id: x.id,
          entity,
          name: x.name,
          start: x.dueAt,
          end: x.endDate,
          subjectId: x.subjectId ?? d.assignment.find((a) => a.id === x.assignmentId)?.subjectId,
          kind: entity === 'importantDate' && x.kind === 'Break' ? 'Break' : kind,
        });
  }
  for (const a of d.assignment)
    if (a.releaseDate && a.releaseDate >= start && a.releaseDate <= end)
      events.push({
        id: a.id,
        entity: 'assignment',
        name: `Released: ${a.name}`,
        start: a.releaseDate + 'T00:00',
        subjectId: a.subjectId,
        kind: 'Release',
      });
  for (let day = start; day <= end; day = addDays(day, 1))
    for (const c of d.class)
      if (c.day === weekday(day) && day >= c.startDate && day <= c.endDate) {
        const s = d.subject.find((s) => s.id === c.subjectId);
        const isBreak = d.importantDate.some(
          (e) =>
            ['Break', 'Holiday'].includes(e.kind) &&
            (!e.semesterId || e.semesterId === s?.semesterId) &&
            e.dueAt.slice(0, 10) <= day &&
            (e.endDate ?? e.dueAt.slice(0, 10)) >= day,
        );
        if (!isBreak)
          events.push({
            id: c.id,
            entity: 'class',
            name: c.name,
            start: day + 'T' + c.startTime,
            end: day + 'T' + c.endTime,
            subjectId: c.subjectId,
            kind: c.kind,
          });
      }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
export function workload(d: Data, now: string, horizon = 14) {
  const deadlines = priorities(d, now).filter((p) => p.dueAt.slice(0, 10) <= addDays(now, horizon));
  const bins = Array.from({ length: horizon }, (_, i) => ({
    date: addDays(now, i),
    hours: 0,
    deadlines: 0,
    weight: 0,
  }));
  for (const p of deadlines) {
    const days = Math.min(horizon, Math.max(1, daysUntil(p.dueAt, now) + 1));
    for (let i = 0; i < days; i++) bins[i].hours += p.hours / days;
    const ix = clamp(daysUntil(p.dueAt, now), 0, horizon - 1);
    bins[ix].deadlines++;
    const a =
      p.entity === 'exam'
        ? d.exam.find((e) => e.id === p.id)
        : d.assignment.find((e) => e.id === p.id);
    bins[ix].weight += a?.weighting ?? 0;
  }
  for (const t of d.task.filter(
    (t) =>
      !t.assignmentId &&
      !t.examId &&
      t.status !== 'Completed' &&
      t.dueAt &&
      t.dueAt.slice(0, 10) <= addDays(now, horizon - 1),
  )) {
    const ix = clamp(daysUntil(t.dueAt, now), 0, horizon - 1);
    bins[ix].hours += Math.max(0, t.estimatedHours - t.actualHours);
  }
  const collisions = [];
  for (let i = 0; i < horizon; i += 7) {
    const b = bins.slice(i, i + 7),
      count = b.reduce((s, x) => s + x.deadlines, 0),
      weight = b.reduce((s, x) => s + x.weight, 0),
      hours = b.reduce((s, x) => s + x.hours, 0);
    if (count >= 3 || hours > b.length * d.setting.dailyHours)
      collisions.push({
        start: b[0].date,
        end: b.at(-1)!.date,
        count,
        weight: round(weight),
        hours: round(hours),
      });
  }
  return {
    bins: bins.map((b) => ({ ...b, hours: round(b.hours) })),
    collisions,
    total: round(bins.reduce((s, b) => s + b.hours, 0)),
  };
}
