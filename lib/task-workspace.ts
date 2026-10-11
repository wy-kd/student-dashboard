import type { RecordRow } from './model';
import { fields } from './model';
import { schemaFor } from './validation';
import { addDays, weekday } from './calculations';
export const taskViews = [
  'Today',
  'Tomorrow',
  'This Week',
  'Upcoming',
  'Overdue',
  'Completed',
  'By Subject',
  'By Assignment',
  'All',
] as const;
export const initialTaskView = 'All';
export const listPageSize = 6;
// Same predicates/order as the existing Tasks view. Input is already semester-scoped.
export function filterTaskRows(rows: RecordRow[], filter: string, query: string, now: string) {
  const today = now.slice(0, 10),
    endWeek = addDays(today, 7 - (weekday(today) || 7));
  return rows
    .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    .filter((t) =>
      filter === 'All'
        ? true
        : filter === 'Completed'
          ? t.status === 'Completed'
          : t.status !== 'Completed',
    )
    .filter((t) =>
      filter === 'Today'
        ? t.dueAt?.slice(0, 10) === today
        : filter === 'Tomorrow'
          ? t.dueAt?.slice(0, 10) === addDays(today, 1)
          : filter === 'This Week'
            ? t.dueAt && t.dueAt.slice(0, 10) >= today && t.dueAt.slice(0, 10) <= endWeek
            : filter === 'Overdue'
              ? t.dueAt && t.dueAt < now
              : filter === 'Upcoming'
                ? t.dueAt && t.dueAt >= now
                : true,
    )
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
}
export function taskLists(rows: RecordRow[], filter: string) {
  return {
    primary: filter === 'Completed' ? rows : rows.filter((t) => t.status !== 'Completed'),
    completed: filter === 'All' ? rows.filter((t) => t.status === 'Completed') : [],
  };
}
export type TaskQuickDraft = {
  name: string;
  dueDate: string;
  dueTime: string;
  priority: string;
  status: string;
  hours: string;
  minutes: string;
  durationChanged: boolean;
};
export function taskQuickDraft(row: RecordRow): TaskQuickDraft {
  const estimate = row.estimatedHours ?? 0;
  let hours = Math.floor(estimate),
    minutes = Number(((estimate - hours) * 60).toFixed(6));
  if (minutes >= 60) {
    hours += 1;
    minutes = 0;
  }
  return {
    name: row.name,
    dueDate: row.dueAt?.slice(0, 10) ?? '',
    dueTime: row.dueAt?.slice(11, 16) ?? '17:00',
    priority: row.priority,
    status: row.status,
    hours: String(hours),
    minutes: String(minutes),
    durationChanged: false,
  };
}
export function taskQuickValues(row: RecordRow, draft: TaskQuickDraft) {
  let estimate = row.estimatedHours;
  if (draft.durationChanged) {
    if (!/^\d+$/.test(draft.hours) || !/^\d+(\.\d+)?$/.test(draft.minutes))
      throw Error('Enter non-negative Hours and Minutes. Hours must be whole numbers.');
    const h = Number(draft.hours),
      m = Number(draft.minutes);
    if (!Number.isSafeInteger(h) || m >= 60 || h + m / 60 > 10000)
      throw Error('Minutes must be below 60 and the estimate cannot exceed 10000 hours.');
    estimate = h + m / 60;
  }
  const values = Object.fromEntries(
    fields.task.map((f) => [f.key, row[f.key] ?? f.default ?? null]),
  );
  return schemaFor('task').parse({
    ...values,
    name: draft.name.trim(),
    dueAt: draft.dueDate ? `${draft.dueDate}T${draft.dueTime}` : null,
    priority: draft.priority,
    status: draft.status,
    estimatedHours: estimate,
  });
}
export function cancelQuickEditKey(
  event: { key: string; preventDefault(): void; stopPropagation(): void },
  busy: boolean,
  close: () => void,
) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  if (!busy) close();
}
export type QuickEditState = { active: string | null; busy: boolean };
export function quickEditReducer(
  state: QuickEditState,
  action: { type: 'begin' | 'close' | 'busy'; id?: string; busy?: boolean },
): QuickEditState {
  if (action.type === 'busy') return { ...state, busy: !!action.busy };
  if (state.busy) return state;
  return { ...state, active: action.type === 'begin' ? action.id! : null };
}
export function nextMenuIndex(key: string, current: number, count: number) {
  if (!count) return -1;
  return key === 'Home'
    ? 0
    : key === 'End'
      ? count - 1
      : key === 'ArrowDown'
        ? (current + 1 + count) % count
        : key === 'ArrowUp'
          ? (current - 1 + count) % count
          : current;
}
