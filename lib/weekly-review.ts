import { addDays, weekday, workload, priorities } from './calculations';
import type { Data } from './model';
export function weeklyReview(d: Data, now: string) {
  const start = addDays(now, -((weekday(now) + 6) % 7)),
    end = addDays(start, 6),
    next = addDays(start, 7),
    inWeek = (s?: string) => !!s && s.slice(0, 10) >= start && s.slice(0, 10) <= end;
  return {
    start,
    end,
    next,
    completed: d.task.filter((t) => inWeek(t.completedAt)).length,
    remaining: d.task.filter(
      (t) => t.status !== 'Completed' && (!t.dueAt || t.dueAt.slice(0, 10) <= end),
    ).length,
    hours: d.studySession.filter((s) => inWeek(s.dueAt)).reduce((n, s) => n + s.actualHours, 0),
    submitted: d.assignment.filter((a) => a.status === 'Submitted' && inWeek(a.submittedAt)).length,
    missed: d.studySession.filter((s) => inWeek(s.dueAt) && s.dueAt < now && !s.completed).length,
    planned: d.studySession.filter((s) => inWeek(s.dueAt)).length,
    nextWork: workload(d, next + 'T08:00', 7).total,
    upcoming: priorities(d, now).filter(
      (r) => r.dueAt.slice(0, 10) >= next && r.dueAt.slice(0, 10) <= addDays(next, 6),
    ),
  };
}
