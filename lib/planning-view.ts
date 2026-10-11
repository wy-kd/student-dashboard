import type { Data } from './model';
import { dayInterval, instant, minute } from './planning-time';
import { freeOn } from './planning-availability';
export function blockSubjectId(d: Data, b: any) {
  return (
    d.task.find((t) => t.id === b.taskId)?.subjectId ??
    d.assignment.find((a) => a.id === b.assignmentId)?.subjectId ??
    d.exam.find((e) => e.id === b.examId)?.subjectId ??
    null
  );
}
export function todayPlanning(d: Data, date: string, now: number, allData = d) {
  const day = dayInterval(date, d.setting.timezone),
    blocks = (d.planning?.blocks ?? []).filter(
      (b) => b.state !== 'dismissed' && b.startAt < day.end && b.endAt > day.start,
    ),
    linked = new Set((d.planning?.blocks ?? []).map((b) => b.sessionId).filter(Boolean));
  const legacy = d.studySession.filter((s) => s.dueAt.slice(0, 10) === date && !linked.has(s.id));
  const plannedMinutes =
    blocks.reduce(
      (n, b) =>
        n + Math.max(0, Math.min(day.end, b.endAt) - Math.max(day.start, b.startAt)) / minute,
      0,
    ) + legacy.reduce((n, s) => n + s.plannedHours * 60, 0);
  const recordedMinutes = d.studySession
    .filter((s) => s.dueAt.slice(0, 10) === date)
    .reduce((n, s) => n + s.actualHours * 60, 0);
  const remainingMinutes =
    blocks
      .filter((b) => b.state === 'planned')
      .reduce(
        (n, b) =>
          n +
          Math.max(0, Math.min(day.end, b.endAt) - Math.max(now, day.start, b.startAt)) / minute,
        0,
      ) +
    legacy
      .filter((s) => !s.completed)
      .reduce((n, s) => {
        const start = instant(s.dueAt, d.setting.timezone);
        return (
          n + Math.max(0, start + s.plannedHours * 60 * minute - Math.max(now, start)) / minute
        );
      }, 0);
  let availableMinutes: number | null = null;
  try {
    if (
      allData.planning?.preference.revision > 0 ||
      allData.planning?.windows.length ||
      allData.planning?.exceptions.length
    )
      availableMinutes = freeOn(allData, date, now).reduce(
        (n, x) => n + (x.end - x.start) / minute,
        0,
      );
  } catch {}
  const taskIds = new Set(
    blocks
      .filter((b) => b.state === 'planned')
      .map((b) => b.taskId)
      .filter(Boolean),
  );
  const tasks = d.task.filter(
    (t) => t.status !== 'Completed' && (taskIds.has(t.id) || t.dueAt?.slice(0, 10) <= date),
  );
  return { blocks, plannedMinutes, recordedMinutes, remainingMinutes, availableMinutes, tasks };
}
