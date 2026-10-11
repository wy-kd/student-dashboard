import type { ScheduleProposal } from './planning-engine';
/** Presentation only: counts and labels are derived from the existing engine result. */
export function reviewGroups(proposal: ScheduleProposal) {
  const missing = proposal.unscheduled.filter((x) => x.minutes === null);
  const deadlines = proposal.unscheduled.filter(
    (x) => x.minutes !== null && /past|passed/i.test(x.reason),
  );
  const capacity = proposal.unscheduled.filter((x) => x.minutes !== null && !deadlines.includes(x));
  return {
    missing,
    deadlines,
    capacity,
    unscheduledMinutes: capacity.reduce((n, x) => n + (x.minutes ?? 0), 0),
  };
}
export function proposalTotals(
  rows: { selected: boolean; start: string; end: string }[],
  duration: (start: string, end: string) => number,
) {
  const selected = rows.filter((x) => x.selected);
  let minutes = 0,
    invalid = false;
  for (const row of selected) {
    try {
      const value = duration(row.start, row.end);
      if (value <= 0) invalid = true;
      else minutes += value;
    } catch {
      invalid = true;
    }
  }
  return { count: selected.length, minutes, invalid };
}
