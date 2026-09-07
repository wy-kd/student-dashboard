import { addDays, calendarEvents, priorities, weekday, workload } from './calculations';
import type { Data } from './model';
export type StudyBlock = {
  id: string;
  name: string;
  dueAt: string;
  minutes: number;
  subjectId?: string;
  assignmentId?: string;
  examId?: string;
};
export function suggestDay(d: Data, day: string, now: string): StudyBlock[] {
  const existing = d.studySession.filter((s) => s.dueAt.slice(0, 10) === day),
    planned = existing.reduce((n, s) => n + s.plannedHours * 60, 0);
  let capacity = Math.max(0, d.setting.dailyHours * 60 - planned);
  const occupied = calendarEvents(d, day, day)
    .filter((e) => e.entity === 'class' || e.entity === 'studySession')
    .map((e) => ({
      start: e.start,
      end:
        e.entity === 'studySession'
          ? new Date(
              Date.parse(e.start + 'Z') +
                (d.studySession.find((s) => s.id === e.id)?.plannedHours ?? 1) * 3600000,
            )
              .toISOString()
              .slice(0, 16)
          : e.end!,
    }));
  const ranks = priorities(d, day + 'T08:00').filter((r) => r.hours > 0),
    blocks: StudyBlock[] = [];
  let cursor = day + 'T09:00';
  if (day === now.slice(0, 10) && cursor < now) cursor = now;
  const time = (s: string, n: number) =>
    new Date(Date.parse(s + 'Z') + n * 60000).toISOString().slice(0, 16);
  let rankIndex = 0;
  while (capacity >= 15 && cursor < day + 'T21:00' && blocks.length < 8 && ranks.length) {
    const r = ranks[rankIndex % ranks.length],
      used = blocks
        .filter((b) => (b.assignmentId || b.examId) === r.id)
        .reduce((n, b) => n + b.minutes, 0),
      minutes = Math.min(50, capacity, Math.max(0, r.hours * 60 - used));
    if (minutes < 15) {
      rankIndex++;
      if (rankIndex >= ranks.length * 2) break;
      continue;
    }
    const end = time(cursor, minutes),
      collision = occupied.find((o) => cursor < o.end && end > o.start);
    if (collision) {
      cursor = collision.end;
      continue;
    }
    if (end > day + 'T21:00') break;
    blocks.push({
      id: 'proposal-' + blocks.length,
      name: r.name,
      dueAt: cursor,
      minutes,
      subjectId: r.subjectId,
      ...(r.entity === 'exam' ? { examId: r.id } : { assignmentId: r.id }),
    });
    capacity -= minutes;
    cursor = time(end, 10);
    rankIndex++;
  }
  return blocks;
}
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
