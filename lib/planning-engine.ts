import { addDays } from './calculations';
import type { Data, RecordRow } from './model';
import { freeOn, occupiedBetween } from './planning-availability';
import {
  civilAt,
  dayInterval,
  instant,
  intervalMinutes,
  overlaps,
  minute,
  type Interval,
} from './planning-time';
import { defaultPlanningPreferences } from './planning-model';
import { validDate } from './validation';
export type WorkItem = {
  key: string;
  entity: 'task' | 'assignment' | 'exam';
  id: string;
  name: string;
  taskId: string | null;
  assignmentId: string | null;
  examId: string | null;
  subjectId: string | null;
  deadline: number | null;
  minutes: number | null;
  recordedMinutes: number;
  priority: string;
  reason: string;
  confirmedMinutes: number;
};
export type SuggestedBlock = {
  id: string;
  workKey: string | null;
  name: string;
  startAt: number;
  endAt: number;
  override: boolean;
  moveId?: string;
  revision?: number;
  reason: string;
};
export type ScheduleProposal = {
  startDate: string;
  endDate: string;
  generatedAt: number;
  items: WorkItem[];
  suggestions: SuggestedBlock[];
  occupied: ReturnType<typeof occupiedBetween>;
  unscheduled: { workKey: string; name: string; minutes: number | null; reason: string }[];
  warnings: string[];
  capacityMinutes: number;
  confirmedMinutes: number;
  requiredMinutes: number;
  unallocatedMinutes: number;
  status:
    | 'Fits your schedule'
    | 'Limited flexibility'
    | 'Needs adjustment'
    | 'Insufficient information';
  conflicts: string[];
};
const rank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
export function workItems(d: Data, now: number): { items: WorkItem[]; warnings: string[] } {
  const items: WorkItem[] = [],
    warnings: string[] = [];
  for (const entity of ['task', 'assignment', 'exam'] as const)
    for (const row of d[entity]) {
      if (row.status === 'Completed' || row.status === 'Submitted' || row.completed) continue;
      const parent =
        entity === 'task'
          ? (d.assignment.find((a) => a.id === row.assignmentId) ??
            d.exam.find((e) => e.id === row.examId))
          : null;
      if (parent?.status === 'Submitted' || parent?.completed) continue;
      if (entity !== 'task') {
        const children = d.task.filter((t) => t[entity + 'Id'] === row.id);
        if (children.length) {
          const total = children.reduce((n, t) => n + (t.estimatedHours || 0), 0);
          if (Math.abs(total - row.estimatedHours) > 0.01)
            warnings.push(
              `${row.name}: parent estimate ${row.estimatedHours}h; linked Tasks ${Number(total.toFixed(2))}h. Review the difference; only linked Tasks are scheduled.`,
            );
          continue;
        }
      }
      const key = entity + ':' + row.id,
        override = d.planning?.estimates.find((e) => e.workKey === key);
      const recordedMinutes =
        entity === 'task'
          ? (row.actualHours || 0) * 60 + (d.planning?.taskRecordedMinutes?.[row.id] ?? 0)
          : (row.actualHours || 0) * 60 +
            d.studySession
              .filter((s) => s[entity + 'Id'] === row.id)
              .reduce((n, s) => n + (s.actualHours || 0) * 60, 0);
      const partial =
        recordedMinutes > 0 ||
        row.status === 'In Progress' ||
        (entity !== 'task' && (row.progress || 0) > 0);
      const minutes = override
        ? override.minutes
        : row.estimatedHours > 0 && !partial
          ? row.estimatedHours * 60
          : null;
      const dates = [row.dueAt, parent?.dueAt]
        .filter(Boolean)
        .map((v) => instant(v, d.setting.timezone));
      const deadline = dates.length ? Math.min(...dates) : null;
      const confirmed =
        d.planning?.blocks.filter(
          (b) =>
            b.state === 'planned' &&
            b.workKey === key &&
            b.endAt > now &&
            (deadline == null || b.endAt <= deadline),
        ) ?? [];
      let confirmedMinutes = confirmed.reduce(
        (n, b) => n + Math.max(0, b.endAt - Math.max(now, b.startAt)) / minute,
        0,
      );
      if (entity !== 'task')
        confirmedMinutes += d.studySession
          .filter((s) => !s.completed && s[entity + 'Id'] === row.id && s.plannedHours > 0)
          .reduce((n, s) => {
            const start = instant(s.dueAt, d.setting.timezone),
              end = start + s.plannedHours * 60 * minute;
            return (
              n +
              (end > now && (deadline == null || end <= deadline)
                ? Math.max(0, end - Math.max(now, start)) / minute
                : 0)
            );
          }, 0);
      items.push({
        key,
        entity,
        id: row.id,
        name: row.name,
        taskId: entity === 'task' ? row.id : null,
        assignmentId: entity === 'assignment' ? row.id : (row.assignmentId ?? null),
        examId: entity === 'exam' ? row.id : (row.examId ?? null),
        subjectId: row.subjectId ?? parent?.subjectId ?? null,
        deadline,
        minutes,
        recordedMinutes,
        priority: row.priority ?? 'Medium',
        confirmedMinutes,
        reason: override
          ? 'User-entered remaining estimate'
          : partial
            ? 'Recorded/partly completed work needs a remaining estimate'
            : minutes == null
              ? 'Duration unknown'
              : 'Existing estimate for unstarted work',
      });
    }
  items.sort(
    (a, b) =>
      (a.deadline ?? Infinity) - (b.deadline ?? Infinity) ||
      (rank[b.priority] ?? 2) - (rank[a.priority] ?? 2) ||
      (b.minutes ?? 0) - (a.minutes ?? 0) ||
      a.key.localeCompare(b.key),
  );
  return { items, warnings };
}
export function plannedOn(d: Data, date: string) {
  const day = dayInterval(date, d.setting.timezone),
    linked = new Set((d.planning?.blocks ?? []).map((b) => b.sessionId).filter(Boolean));
  const ranges = (d.planning?.blocks ?? [])
    .filter((b) => b.state !== 'dismissed')
    .map((b) => ({ start: b.startAt, end: b.endAt }));
  for (const s of d.studySession)
    if (!s.completed && !linked.has(s.id) && s.plannedHours > 0) {
      const start = instant(s.dueAt, d.setting.timezone);
      ranges.push({ start, end: start + s.plannedHours * 60 * minute });
    }
  return ranges.reduce(
    (n, x) => n + Math.max(0, Math.min(day.end, x.end) - Math.max(day.start, x.start)) / minute,
    0,
  );
}
export function generateSchedule(
  d: Data,
  now: number,
  startDate = civilAt(now, d.setting.timezone).slice(0, 10),
  endDate = addDays(startDate, 6),
  excluded: string[] = [],
): ScheduleProposal {
  const today = civilAt(now, d.setting.timezone).slice(0, 10);
  if (
    !validDate(startDate) ||
    !validDate(endDate) ||
    startDate.length !== 10 ||
    endDate.length !== 10 ||
    startDate < today ||
    endDate < startDate ||
    endDate > addDays(startDate, 13)
  )
    throw Error('Choose today or a future period of up to 14 days.');
  const { items: all, warnings } = workItems(d, now),
    items = all.filter((x) => !excluded.includes(x.key));
  const preferences = d.planning?.preference ?? defaultPlanningPreferences;
  const days: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) days.push(date);
  const slots = new Map<string, Interval[]>(),
    dayUsed = new Map<string, number>();
  for (const date of days) {
    try {
      slots.set(date, freeOn(d, date, Math.ceil((now + 5 * minute) / minute) * minute));
    } catch (e: any) {
      slots.set(date, []);
      warnings.push(`${date}: ${e.message}`);
    }
    dayUsed.set(date, plannedOn(d, date));
  }
  const capacityMinutes = days.reduce(
    (n, date) =>
      n +
      Math.min(
        slots.get(date)!.reduce((sum, x) => sum + intervalMinutes(x), 0),
        Math.max(0, (preferences.maxDailyMinutes ?? 1440) - dayUsed.get(date)!),
      ),
    0,
  );
  const suggestions: SuggestedBlock[] = [],
    unscheduled: ScheduleProposal['unscheduled'] = [];
  for (const work of items) {
    if (work.minutes == null) {
      unscheduled.push({ workKey: work.key, name: work.name, minutes: null, reason: work.reason });
      continue;
    }
    let remaining = Math.max(0, work.minutes - work.confirmedMinutes);
    if (!remaining) continue;
    const due = work.deadline ?? Infinity;
    if (due <= now) {
      unscheduled.push({
        workKey: work.key,
        name: work.name,
        minutes: remaining,
        reason:
          'The effective deadline has passed; review the deadline. No past or late block is proposed.',
      });
      continue;
    }
    for (const soft of [true, false])
      for (const date of days) {
        if (remaining < 0.001) break;
        const maximum = preferences.maxDailyMinutes ?? 1440,
          cap = soft ? Math.min(maximum, d.setting.dailyHours * 60) : maximum;
        let budget = Math.max(0, cap - dayUsed.get(date)!);
        for (const slot of slots.get(date)!) {
          while (remaining >= preferences.minimumMinutes && budget >= preferences.minimumMinutes) {
            const room = (Math.min(slot.end, due) - slot.start) / minute;
            if (room < preferences.minimumMinutes) break;
            let duration = Math.min(remaining, preferences.preferredMinutes, room, budget);
            if (remaining > duration && remaining - duration < preferences.minimumMinutes) {
              const adjusted = remaining - preferences.minimumMinutes;
              if (adjusted >= preferences.minimumMinutes) duration = Math.min(duration, adjusted);
            }
            if (duration < preferences.minimumMinutes) break;
            const start = slot.start,
              end = start + duration * minute;
            suggestions.push({
              id: 'suggestion-' + suggestions.length,
              workKey: work.key,
              name: work.name,
              startAt: start,
              endAt: end,
              override: false,
              reason:
                (work.deadline ? `Before ${civilAt(work.deadline, d.setting.timezone)}. ` : '') +
                'Fits configured availability; ' +
                work.reason.toLowerCase() +
                '.',
            });
            remaining = Math.max(0, remaining - duration);
            budget -= duration;
            dayUsed.set(date, dayUsed.get(date)! + duration);
            slot.start = end + preferences.restMinutes * minute;
          }
        }
      }
    if (remaining > 0.001)
      unscheduled.push({
        workKey: work.key,
        name: work.name,
        minutes: remaining,
        reason:
          'This work cannot fit before its deadline with current availability, reservations, session lengths and daily limits.',
      });
  }
  suggestions.sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id));
  const occupied = occupiedBetween(d, startDate, endDate),
    conflicts: string[] = [];
  for (let i = 0; i < occupied.length; i++)
    for (let j = i + 1; j < occupied.length; j++)
      if (overlaps(occupied[i], occupied[j]))
        conflicts.push(`${occupied[i].name} overlaps ${occupied[j].name}.`);
  const requiredMinutes = items.reduce(
      (n, w) => n + (w.minutes == null ? 0 : Math.max(0, w.minutes - w.confirmedMinutes)),
      0,
    ),
    confirmedMinutes = days.reduce((n, date) => n + plannedOn(d, date), 0);
  const allocated = suggestions.reduce((n, b) => n + (b.endAt - b.startAt) / minute, 0),
    unallocatedMinutes = Math.max(0, capacityMinutes - allocated);
  const incomplete =
    unscheduled.some((x) => x.minutes == null) ||
    !(d.planning?.windows.length || d.planning?.exceptions.some((e) => e.windows.length));
  const status = incomplete
    ? 'Insufficient information'
    : unscheduled.length || conflicts.length
      ? 'Needs adjustment'
      : capacityMinutes > 0 && unallocatedMinutes < capacityMinutes * 0.2
        ? 'Limited flexibility'
        : 'Fits your schedule';
  return {
    startDate,
    endDate,
    generatedAt: now,
    items,
    suggestions,
    occupied,
    unscheduled,
    warnings,
    capacityMinutes,
    confirmedMinutes,
    requiredMinutes,
    unallocatedMinutes,
    status,
    conflicts,
  };
}
