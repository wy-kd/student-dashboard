import type { Data } from './model';
import { addDays, calendarEvents, weekday } from './calculations';
import { defaultPlanningPreferences } from './planning-model';
import {
  civilRange,
  dayInterval,
  instant,
  mergeIntervals,
  subtractIntervals,
  minute,
  type Interval,
} from './planning-time';
export type Occupied = Interval & {
  id: string;
  name: string;
  kind: string;
  fixed: boolean;
  blockId?: string;
};
export function availabilityDraft(planning: Data['planning']) {
  const p = planning?.preference ?? { revision: 0, ...defaultPlanningPreferences };
  return {
    revision: p.revision,
    preferences: {
      preferredMinutes: p.preferredMinutes,
      minimumMinutes: p.minimumMinutes,
      restMinutes: p.restMinutes,
      maxDailyMinutes: p.maxDailyMinutes,
    },
    windows: (planning?.windows ?? []).map(({ day, startTime, endTime }) => ({
      day,
      startTime,
      endTime,
    })),
    exceptions: (planning?.exceptions ?? []).map(({ date, windows }) => ({
      date,
      windows: windows.map((w: any) => ({ ...w })),
    })),
  };
}
export function availableOn(d: Data, date: string): Interval[] {
  const exception = d.planning?.exceptions.find((e) => e.date === date);
  const windows = exception
    ? exception.windows
    : (d.planning?.windows ?? []).filter((w) => w.day === weekday(date));
  return mergeIntervals(
    windows.map((w: any) =>
      civilRange(date + 'T' + w.startTime, date + 'T' + w.endTime, d.setting.timezone),
    ),
  );
}
export function occupiedBetween(
  d: Data,
  startDate: string,
  endDate: string,
  ignoreBlocks: string[] = [],
): Occupied[] {
  const zone = d.setting.timezone,
    result: Occupied[] = [],
    linkedSessions = new Set((d.planning?.blocks ?? []).map((b) => b.sessionId).filter(Boolean));
  for (const event of calendarEvents(d, addDays(startDate, -1), endDate)) {
    if (!['class', 'exam', 'studySession'].includes(event.entity)) continue;
    if (event.entity === 'studySession') {
      const row = d.studySession.find((s) => s.id === event.id)!;
      if (row.completed || linkedSessions.has(row.id) || !(row.plannedHours > 0)) continue;
      const start = instant(event.start, zone);
      result.push({
        id: 'legacy:' + row.id,
        name: row.name,
        kind: 'Legacy study plan',
        fixed: true,
        start,
        end: start + row.plannedHours * 60 * minute,
      });
    } else if (event.entity === 'exam') {
      const row = d.exam.find((e) => e.id === event.id)!;
      const start = instant(event.start, zone);
      result.push({
        id: 'exam:' + row.id,
        name: row.name,
        kind: 'Exam',
        fixed: true,
        start,
        end: start + row.duration * minute,
      });
    } else {
      let end = event.end!;
      if (end <= event.start) end = addDays(end, 1) + end.slice(10);
      result.push({
        id: 'class:' + event.id + ':' + event.start,
        name: event.name,
        kind: event.kind,
        fixed: true,
        ...civilRange(event.start, end, zone),
      });
    }
  }
  for (const c of d.planning?.commitments ?? [])
    result.push({
      id: 'commitment:' + c.id,
      name: c.name,
      kind: c.fixed ? 'Fixed appointment' : 'Flexible commitment',
      fixed: c.fixed,
      start: c.startAt,
      end: c.endAt,
    });
  for (const b of d.planning?.blocks ?? [])
    if (b.state === 'planned' && !ignoreBlocks.includes(b.id))
      result.push({
        id: 'block:' + b.id,
        blockId: b.id,
        name: b.name,
        kind: 'Confirmed study',
        fixed: b.locked,
        start: b.startAt,
        end: b.endAt,
      });
  const range = { start: dayInterval(startDate, zone).start, end: dayInterval(endDate, zone).end };
  return result
    .filter((x) => x.end > range.start && x.start < range.end)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
export function freeOn(d: Data, date: string, now: number, ignoreBlocks: string[] = []) {
  const available = availableOn(d, date)
    .map((x) => ({ ...x, start: Math.max(x.start, now) }))
    .filter((x) => x.end > x.start);
  const rest = (d.planning?.preference.restMinutes ?? 0) * minute;
  return subtractIntervals(
    available,
    occupiedBetween(d, date, date, ignoreBlocks).map((x) =>
      x.kind === 'Confirmed study' || x.kind === 'Legacy study plan'
        ? { start: x.start - rest, end: x.end + rest }
        : x,
    ),
  );
}
