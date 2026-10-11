import { defaults } from './model';
import { schemaFor } from './validation';
import type { Data, RecordRow } from './model';
export const breakdownTemplates = {
  'Research report': [
    'Understand the requirements',
    'Research relevant sources',
    'Create report outline',
    'Draft sections',
    'Review references',
    'Edit and proofread',
    'Submit',
  ],
  'Programming assignment': [
    'Review requirements',
    'Plan implementation',
    'Set up project',
    'Implement functionality',
    'Test and debug',
    'Review code',
    'Prepare submission',
  ],
  Presentation: [
    'Understand topic',
    'Research content',
    'Create outline',
    'Prepare slides',
    'Rehearse',
    'Final review',
    'Present or submit',
  ],
  'General assignment': [
    'Review instructions',
    'Plan work',
    'Complete main work',
    'Review',
    'Submit',
  ],
} as const;
export type BreakdownDraft = {
  key: string;
  selected: boolean;
  name: string;
  notes: string;
  dueAt: string;
  estimatedHours: string;
  priority: string;
  status: string;
};
export function moveBreakdownTask(rows: BreakdownDraft[], index: number, delta: number) {
  const next = index + delta;
  if (index < 0 || index >= rows.length || next < 0 || next >= rows.length) return rows;
  const result = [...rows];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
export function assignmentTaskSummary(assignment: RecordRow, data: Data) {
  const tasks = data.task.filter((t) => t.assignmentId === assignment.id);
  const pending = tasks.filter((t) => t.status !== 'Completed');
  return {
    tasks,
    completed: tasks.length - pending.length,
    estimated: tasks.reduce((sum, t) => sum + t.estimatedHours, 0),
    completedEstimate: tasks
      .filter((t) => t.status === 'Completed')
      .reduce((sum, t) => sum + t.estimatedHours, 0),
    remainingEstimate: pending.reduce(
      (sum, t) => sum + Math.max(0, t.estimatedHours - t.actualHours),
      0,
    ),
    next: pending[0] ?? null,
  };
}
export type BreakdownState = { requestId: string; rows: BreakdownDraft[]; attempted: boolean };
export function readBreakdownDraft(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): BreakdownState | null {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.requestId,
      ) ||
      typeof value.attempted !== 'boolean' ||
      !Array.isArray(value.rows) ||
      value.rows.length > 50
    )
      return null;
    if (
      !value.rows.every(
        (row: any) =>
          row &&
          typeof row.selected === 'boolean' &&
          ['key', 'name', 'notes', 'dueAt', 'estimatedHours', 'priority', 'status'].every(
            (field) => typeof row[field] === 'string',
          ),
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function selectedBreakdownTasks(rows: BreakdownDraft[]) {
  return rows
    .filter((row) => row.selected)
    .map((row) => ({
      name: row.name,
      notes: row.notes,
      dueAt: row.dueAt || null,
      estimatedHours: row.estimatedHours === '' ? 0 : Number(row.estimatedHours),
      priority: row.priority,
      status: row.status,
    }));
}

const draftTaskSchema = schemaFor('task');
export function breakdownDraftValid(rows: BreakdownDraft[]) {
  const selected = selectedBreakdownTasks(rows);
  return (
    selected.length > 0 &&
    selected.length <= 50 &&
    selected.every(
      (row) =>
        row.name.trim().length > 0 &&
        draftTaskSchema.safeParse({ ...defaults('task'), ...row }).success,
    )
  );
}
