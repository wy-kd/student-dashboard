import type { Data, RecordRow } from './model';
import { addDays, daysUntil } from './calculations';
import { formatDate } from './format';
export function teachingWeekInfo(s: RecordRow, now: string, d: Data) {
  const today = now.slice(0, 10);
  const breaks = d.importantDate.filter(
    (b) => b.kind === 'Break' && (!b.semesterId || b.semesterId === s.id),
  );
  const onBreak = (day: string) =>
    breaks.some((b) => b.dueAt.slice(0, 10) <= day && (b.endDate ?? b.dueAt.slice(0, 10)) >= day);
  // Keep the existing seven-day teaching blocks anchored to teachingStart. Only a
  // whole block covered by breaks is skipped; overlapping breaks count once.
  const weeks: { start: string; end: string }[] = [];
  for (
    let start = s.teachingStart;
    start <= s.endDate && weeks.length < s.teachingWeeks;
    start = addDays(start, 7)
  ) {
    const end = [addDays(start, 6), s.endDate].sort()[0];
    let active = false;
    for (let day = start; day <= end; day = addDays(day, 1)) if (!onBreak(day)) active = true;
    if (active) weeks.push({ start, end });
  }
  const numberAt = (day: string) => weeks.findIndex((w) => w.start <= day && w.end >= day) + 1;
  const total = s.teachingWeeks;
  if (today < s.teachingStart)
    return {
      state: 'before',
      week: 0,
      total,
      label: `Semester starts in ${daysUntil(s.teachingStart, today)} ${daysUntil(s.teachingStart, today) === 1 ? 'day' : 'days'}`,
      resumeDate: null,
      resumeWeek: null,
    };
  if (!weeks.length || today > weeks.at(-1)!.end)
    return {
      state: 'complete',
      week: Math.min(total, weeks.length),
      total,
      label: 'Teaching complete',
      resumeDate: null,
      resumeWeek: null,
    };
  if (onBreak(today)) {
    let resume = today;
    while (resume <= weeks.at(-1)!.end && onBreak(resume)) resume = addDays(resume, 1);
    const resumeWeek = numberAt(resume) || null;
    const week = weeks.filter((w) => w.start < today).length;
    return {
      state: 'break',
      week: Math.min(total, week),
      total,
      label: 'Semester Break',
      resumeDate: resumeWeek ? resume : null,
      resumeWeek,
    };
  }
  const week = numberAt(today);
  return {
    state: 'teaching',
    week,
    total,
    label: `Week ${week} of ${total}`,
    resumeDate: null,
    resumeWeek: null,
  };
}
export function teachingResumeLabel(info: ReturnType<typeof teachingWeekInfo>) {
  return info.resumeDate
    ? `Teaching Week ${info.resumeWeek} resumes ${formatDate(info.resumeDate)}`
    : '';
}
