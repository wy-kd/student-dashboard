import { z } from 'zod';
import { db } from './db';
import { AppError } from './service';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    'Choose a valid due date.',
  );
export const todoSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    dueDate: date.nullable(),
  })
  .strict();
export type TodoRow = z.infer<typeof todoSchema> & {
  id: string;
  completed: boolean;
  position: number;
  revision: number;
};
export const todoOrder = [{ position: 'asc' }, { id: 'asc' }] as const;

export async function todoAction(userId: string, b: any) {
  return db.$transaction(async (tx) => {
    if (b.action === 'todo.create') {
      const id = z.string().uuid().parse(b.requestId);
      const values = todoSchema.parse(b.todo);
      const previous = await tx.todoItem.findUnique({ where: { id } });
      if (previous) {
        if (previous.userId !== userId) throw new AppError('To-do unavailable.', 409);
        return previous; // Retried quick-add must not create a second item.
      }
      const last = await tx.todoItem.aggregate({ where: { userId }, _max: { position: true } });
      return tx.todoItem.create({
        data: {
          ...values,
          id,
          userId,
          position: (last._max.position ?? -1) + 1,
        },
      });
    }
    const id = z.string().min(1).max(100).parse(b.id);
    const old = await tx.todoItem.findFirst({ where: { id, userId } });
    if (!old || old.revision !== b.revision)
      throw new AppError('To-do changed or was deleted. Refresh before trying again.', 409);
    if (b.action === 'todo.delete') return tx.todoItem.delete({ where: { id } });
    if (b.action === 'todo.save')
      return tx.todoItem.update({
        where: { id },
        data: {
          ...todoSchema.parse(b.todo),
          revision: { increment: 1 },
        },
      });
    if (b.action === 'todo.complete')
      return tx.todoItem.update({
        where: { id },
        data: {
          completed: z.boolean().parse(b.completed),
          revision: { increment: 1 },
        },
      });
    if (b.action === 'todo.move') {
      const delta = z.union([z.literal(-1), z.literal(1)]).parse(b.delta);
      const rows = await tx.todoItem.findMany({ where: { userId }, orderBy: [...todoOrder] });
      const index = rows.findIndex((row) => row.id === id),
        next = index + delta;
      if (next < 0 || next >= rows.length) return;
      [rows[index], rows[next]] = [rows[next], rows[index]];
      // Keep one deterministic, compact order, including completed items.
      for (let position = 0; position < rows.length; position++)
        if (rows[position].position !== position)
          await tx.todoItem.update({
            where: { id: rows[position].id },
            data: {
              position,
              revision: { increment: 1 },
            },
          });
      return;
    }
    throw new AppError('Unknown to-do action.');
  });
}
