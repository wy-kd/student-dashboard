import type { Data } from './model';
import { addDays } from './civil';
import { workItems, plannedOn } from './planning-engine';
import { availableOn, occupiedBetween } from './planning-availability';
import { civilAt, overlaps, minute } from './planning-time';
export type ScheduleIssue = {
  block: any;
  reasons: string[];
  unconfirmed: boolean;
  active: boolean;
  canSuggest: boolean;
  key: string;
};
// Current recorded facts only. Detection never edits a plan or infers whether work happened.
export function scheduleIssues(d: Data, now: number): ScheduleIssue[] {
  const work = new Map(workItems(d, now).items.map((w) => [w.key, w]));
  return (d.planning?.blocks ?? [])
    .filter((b) => b.state === 'planned' && !b.sessionId)
    .map((block): ScheduleIssue => {
      const reasons: string[] = [],
        unconfirmed = block.endAt <= now;
      const active = !!block.timerId && d.productivity?.timer?.id === block.timerId;
      const item = block.workKey ? work.get(block.workKey) : null;
      let sourceValid = !block.workKey || !!item;
      if (unconfirmed && !active)
        reasons.push(
          "Your earlier study session hasn't been confirmed. Would you like to review it?",
        );
      else if (block.startAt < now && !active)
        reasons.push(
          'The intended start has passed without a recorded confirmation. Review this plan.',
        );
      if (block.workKey && !item)
        reasons.push(
          'Linked work is completed, removed or represented by linked Tasks. Review its association before rescheduling.',
        );
      if (
        item &&
        (block.taskId !== item.taskId ||
          block.assignmentId !== item.assignmentId ||
          block.examId !== item.examId)
      ) {
        sourceValid = false;
        reasons.push('The Task/assessment association changed. Review the linked work.');
      }
      if (item?.deadline != null && block.endAt > item.deadline)
        reasons.push('This allocation ends after the current effective Task/assessment deadline.');
      if (!unconfirmed) {
        const startDate = civilAt(block.startAt, d.setting.timezone).slice(0, 10),
          endDate = civilAt(block.endAt - 1, d.setting.timezone).slice(0, 10);
        try {
          if (
            block.origin !== 'manual' &&
            (startDate !== endDate ||
              !availableOn(d, startDate).some(
                (w) => w.start <= block.startAt && w.end >= block.endAt,
              ))
          )
            reasons.push('This allocation is outside current recorded availability.');
          const rest = (d.planning?.preference.restMinutes ?? 0) * minute;
          for (const event of occupiedBetween(d, startDate, endDate, [block.id])) {
            const padding = ['Confirmed study', 'Legacy study plan'].includes(event.kind)
              ? rest
              : 0;
            if (
              overlaps(
                { start: block.startAt, end: block.endAt },
                { start: event.start - padding, end: event.end + padding },
              )
            )
              reasons.push('Recorded overlap or rest conflict with ' + event.name + '.');
          }
          const maximum = d.planning?.preference.maxDailyMinutes;
          if (maximum != null)
            for (let date = startDate; date <= endDate; date = addDays(date, 1))
              if (plannedOn(d, date) > maximum + 0.00001) {
                reasons.push('Confirmed work exceeds the current maximum daily workload.');
                break;
              }
        } catch {
          reasons.push('A recorded local-time interval needs review for this timezone.');
        }
      }
      return {
        block,
        reasons,
        unconfirmed,
        active,
        canSuggest: sourceValid && !block.locked && !active,
        key: block.id + ':' + block.revision + ':' + reasons.join('|'),
      };
    })
    .filter((issue) => issue.reasons.length > 0)
    .sort((a, b) => a.block.startAt - b.block.startAt || a.block.id.localeCompare(b.block.id));
}
