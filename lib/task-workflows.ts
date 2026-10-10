import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { AppError, validateRelations } from './service';
import { defaults } from './model';
import { schemaFor } from './validation';
import { civilNow } from './calculations';

const id = z.string().min(1).max(100);
const taskInput = z
  .object({
    name: z.string().trim().min(1).max(500),
    notes: z.string().max(20000).default(''),
    dueAt: z.string().nullable().default(null),
    estimatedHours: z.number().min(0).max(10000).default(0),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
    status: z.enum(['Not Started', 'In Progress', 'Completed']).default('Not Started'),
  })
  .strict();
export const breakdownSchema = z
  .object({
    assignmentId: id,
    requestId: z.string().uuid(),
    tasks: z.array(taskInput).min(1).max(50),
  })
  .strict();
const conversionSchema = z
  .object({
    todoId: id,
    revision: z.number().int().min(0),
    task: taskInput.extend({ assignmentId: id.nullable(), subjectId: id.nullable() }).strict(),
  })
  .strict();

async function createTask(tx: any, values: any, taskId: string) {
  const row: any = schemaFor('task').parse({ ...defaults('task'), ...values });
  await validateRelations(tx, 'task', row);
  const setting = await tx.setting.findUnique({ where: { id: 'settings' } });
  return tx.task.create({
    data: {
      ...row,
      id: taskId,
      completedAt: row.status === 'Completed' ? civilNow(setting?.timezone) : null,
    },
  });
}
export async function saveAssignmentBreakdown(input: unknown) {
  const b = breakdownSchema.parse(input);
  return db.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({ where: { id: b.assignmentId } });
    if (!assignment) throw new AppError('Assignment no longer exists.', 404);
    const prefix = `breakdown-${b.requestId}-`;
    const taskIds = b.tasks.map((_, index) => prefix + String(index).padStart(3, '0'));
    const previous = await tx.task.findMany({ where: { id: { startsWith: prefix } } });
    if (previous.length) {
      if (
        previous.length !== taskIds.length ||
        previous.some((t) => t.assignmentId !== b.assignmentId || !taskIds.includes(t.id))
      )
        throw new AppError(
          'This saved breakdown has changed. Review the assignment tasks before adding more.',
          409,
        );
      // The whole batch already committed. Never overwrite task edits/completions on retry.
      return taskIds;
    }
    for (let index = 0; index < b.tasks.length; index++)
      await createTask(
        tx,
        {
          ...b.tasks[index],
          assignmentId: assignment.id,
          subjectId: assignment.subjectId,
          examId: null,
        },
        taskIds[index],
      );
    return taskIds;
  });
}
export async function convertTodoToTask(userId: string, input: unknown) {
  const b = conversionSchema.parse(input);
  const taskId =
    'todo-task-' +
    createHash('sha256')
      .update(JSON.stringify([userId, b.todoId]))
      .digest('hex');
  return db.$transaction(async (tx) => {
    const old = await tx.todoItem.findFirst({ where: { id: b.todoId, userId } });
    const previous = await tx.task.findUnique({ where: { id: taskId } });
    if (previous) {
      if (old)
        throw new AppError(
          'A converted task already exists. Review Tasks before converting again.',
          409,
        );
      return previous.id; // Response lost after commit: acknowledge without creating another task.
    }
    if (!old || old.revision !== b.revision)
      throw new AppError('To-do changed or was deleted. Refresh before converting.', 409);
    await createTask(tx, { ...b.task, examId: null }, taskId);
    await tx.todoItem.delete({ where: { id: old.id } });
    return taskId;
  });
}
