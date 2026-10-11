import type { Data } from './model';
import { AppError } from './service';
import { addDays } from './civil';
import {
  workItems,
  generateSchedule,
  type ScheduleProposal,
  type SuggestedBlock,
} from './planning-engine';
import { freeOn } from './planning-availability';
import { validateScheduleChanges } from './planning-approval';
import { civilAt, minute } from './planning-time';
// Reallocate one existing intention. This never guesses remaining effort or writes a record.
export function suggestAdjustment(
  d: Data,
  now: number,
  id: string,
  startDate: string,
  endDate: string,
): ScheduleProposal {
  const block = d.planning?.blocks.find((b) => b.id === id);
  if (!block || block.state !== 'planned' || block.sessionId)
    throw new AppError('This planned session is no longer available.', 409);
  if (block.locked)
    throw new AppError(
      'This session is fixed. Unlock it explicitly before requesting alternatives.',
      409,
    );
  if (block.timerId && d.productivity?.timer?.id === block.timerId)
    throw new AppError('End and review the active timer before requesting alternatives.', 409);
  const items = workItems(d, now).items;
  const item = block.workKey ? items.find((w) => w.key === block.workKey) : null;
  if (
    block.workKey &&
    (!item ||
      item.taskId !== block.taskId ||
      item.assignmentId !== block.assignmentId ||
      item.examId !== block.examId)
  )
    throw new AppError(
      'Linked work is completed, removed or reassociated. Review the work association before requesting alternatives.',
      409,
    );
  const proposal = generateSchedule(
    d,
    now,
    startDate,
    endDate,
    items.map((w) => w.key),
  ); // Reuse range/capacity validation.
  const duration = block.endAt - block.startAt,
    suggestions: SuggestedBlock[] = [];
  let lastFailure =
    'No contiguous available slot preserves this reservation, its deadline, rest and daily workload limits.';
  const deadline = items.find((w) => w.key === block.workKey)?.deadline ?? Infinity;
  let capacityMinutes = 0;
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    let free;
    try {
      free = freeOn(d, date, Math.ceil((now + 5 * minute) / minute) * minute, [block.id]);
    } catch {
      continue;
    }
    capacityMinutes += free.reduce((n, w) => n + (w.end - w.start) / minute, 0);
    if (suggestions.length) continue;
    for (const slot of free) {
      const start = Math.ceil(slot.start / minute) * minute,
        end = start + duration;
      if (end > slot.end || end > deadline) continue;
      const change: SuggestedBlock = {
        id: 'move-' + block.id,
        moveId: block.id,
        revision: block.revision,
        name: block.name,
        workKey: block.workKey,
        startAt: start,
        endAt: end,
        override: false,
        reason:
          'Move the existing ' +
          (duration / minute).toFixed(0) +
          '-minute reservation from ' +
          civilAt(block.startAt, d.setting.timezone) +
          ' to ' +
          civilAt(start, d.setting.timezone) +
          '. This is intended time, not an estimate of remaining effort.',
      };
      try {
        validateScheduleChanges(d, [change], now);
        suggestions.push(change);
        break;
      } catch (e: any) {
        lastFailure = e.message;
      }
    }
  }
  return {
    ...proposal,
    items,
    suggestions,
    capacityMinutes,
    requiredMinutes: duration / minute,
    unallocatedMinutes: suggestions.length ? 0 : duration / minute,
    status: suggestions.length ? 'Fits your schedule' : 'Needs adjustment',
    conflicts: [],
    warnings: [
      ...proposal.warnings,
      'The current confirmed plan remains unchanged until this move is approved. Fixed commitments and all other confirmed sessions remain in place.',
    ],
    unscheduled: suggestions.length
      ? []
      : [
          {
            workKey: block.workKey ?? 'block:' + id,
            name: block.name,
            minutes: duration / minute,
            reason: lastFailure + ' Review availability or edit/reassociate the plan manually.',
          },
        ],
  };
}
