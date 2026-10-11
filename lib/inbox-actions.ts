import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db } from './db';
import { AppError, cleanInput, validateRelations } from './service';
import { schemaFor } from './validation';
import { todoSchema } from './todos';
import { instant } from './planning-time';
export const inboxReviewSchema = z
  .object({
    frequency: z.enum(['off', 'daily', 'weekly']),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    weekday: z.number().int().min(0).max(6),
  })
  .strict();
export async function inboxAction(userId: string, b: any, now: number) {
  return db.$transaction(async (tx) => {
    if (b.action === 'inbox.review-preferences') {
      const revision = z.number().int().nonnegative().parse(b.revision),
        values = inboxReviewSchema.parse(b.preference);
      const old = await tx.inboxReviewPreference.findUnique({ where: { userId } });
      if ((old?.revision ?? 0) !== revision)
        throw new AppError(
          'Inbox reminder settings changed on another device. Reload before saving.',
          409,
        );
      return tx.inboxReviewPreference.upsert({
        where: { userId },
        create: { userId, ...values, revision: 1 },
        update: { ...values, revision: { increment: 1 } },
      });
    }
    const id = z.string().min(1).max(100).parse(b.id);
    const item = await tx.inboxItem.findFirst({ where: { id, userId } });
    if (!item) throw new AppError('Capture already organised or deleted.', 409);
    const converting = b.action === 'inbox.convert' || b.action === 'inbox.organise';
    const kind =
      b.action === 'inbox.organise'
        ? 'task'
        : converting
          ? z.enum(['task', 'todo']).parse(b.kind)
          : null;
    const requestId =
      b.action === 'inbox.organise'
        ? null
        : converting
          ? z.string().uuid().parse(b.requestId)
          : null;
    if (
      requestId &&
      item.state === 'processed' &&
      item.processedRequestId === requestId &&
      item.processedType === kind
    )
      return { id: item.processedId, kind, alreadyProcessed: true };
    const revision =
      b.action === 'inbox.organise'
        ? item.revision
        : z.number().int().nonnegative().parse(b.revision);
    if (item.revision !== revision)
      throw new AppError(
        'This capture changed on another device. Reload before retrying; your draft has been kept.',
        409,
      );
    if (converting) {
      if (!['pending', 'snoozed'].includes(item.state))
        throw new AppError('Capture already organised or archived.', 409);
      const recordId = 'inbox-' + kind + '-' + createHash('sha256').update(item.id).digest('hex');
      if (kind === 'task') {
        const row: any = schemaFor('task').parse(
          cleanInput('task', { ...b.task, name: b.task?.name || item.name }),
        );
        await validateRelations(tx, 'task', row);
        await tx.task.create({ data: { ...row, id: recordId } });
      } else {
        const values = todoSchema.parse(b.todo);
        const last = await tx.todoItem.aggregate({ where: { userId }, _max: { position: true } });
        await tx.todoItem.create({
          data: { ...values, id: recordId, userId, position: (last._max.position ?? -1) + 1 },
        });
      }
      await tx.inboxItem.update({
        where: { id },
        data: {
          state: 'processed',
          processedId: recordId,
          processedType: kind,
          processedRequestId: requestId,
          snoozedUntil: null,
          revision: { increment: 1 },
        },
      });
      return { id: recordId, kind };
    }
    if (b.action === 'inbox.delete') return tx.inboxItem.delete({ where: { id } });
    if (b.action === 'inbox.archive' || b.action === 'inbox.restore') {
      if (item.state === 'processed')
        throw new AppError(
          'A converted capture stays in processed history. It can be deleted explicitly.',
        );
      return tx.inboxItem.update({
        where: { id },
        data: {
          state: b.action === 'inbox.archive' ? 'archived' : 'pending',
          snoozedUntil: null,
          revision: { increment: 1 },
        },
      });
    }
    if (b.action === 'inbox.snooze') {
      if (!['pending', 'snoozed'].includes(item.state))
        throw new AppError('Only unprocessed captures can be snoozed.');
      const zone =
        (await tx.setting.findUnique({ where: { id: 'settings' } }))?.timezone ??
        'Australia/Brisbane';
      const until = instant(z.string().parse(b.until), zone);
      if (until <= now || until > now + 366 * 86400000)
        throw new AppError('Choose a review time in the next year.');
      return tx.inboxItem.update({
        where: { id },
        data: { state: 'snoozed', snoozedUntil: until, revision: { increment: 1 } },
      });
    }
    throw new AppError('Unknown Inbox action.');
  });
}
