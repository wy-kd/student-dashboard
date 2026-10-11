import { z } from 'zod';
import { db } from './db';
import { AppError } from './service';
import { availabilitySchema } from './planning-model';
import { civilRange } from './planning-time';
const revisionSchema = z.number().int().nonnegative();
export async function saveAvailability(userId: string, input: unknown) {
  const value = availabilitySchema.parse(input);
  return db.$transaction(async (tx) => {
    const old = await tx.schedulingPreference.findUnique({ where: { userId } });
    if ((old?.revision ?? 0) !== value.revision)
      throw new AppError(
        'Availability changed on another device. Cancel/reload before editing again.',
        409,
      );
    const preference = await tx.schedulingPreference.upsert({
      where: { userId },
      create: { userId, ...value.preferences, revision: 1 },
      update: { ...value.preferences, revision: { increment: 1 } },
    });
    await tx.availabilityWindow.deleteMany({ where: { userId } });
    await tx.availabilityException.deleteMany({ where: { userId } });
    for (const window of value.windows)
      await tx.availabilityWindow.create({ data: { userId, ...window } });
    for (const exception of value.exceptions)
      await tx.availabilityException.create({
        data: { userId, date: exception.date, windows: JSON.stringify(exception.windows) },
      });
    return preference;
  });
}
export async function saveCommitment(userId: string, input: unknown) {
  const value = z
    .object({
      id: z.string().optional(),
      revision: revisionSchema.optional(),
      name: z.string().trim().min(1).max(200),
      start: z.string(),
      end: z.string(),
      fixed: z.boolean(),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const zone =
      (await tx.setting.findUnique({ where: { id: 'settings' } }))?.timezone ??
      'Australia/Brisbane';
    const interval = civilRange(value.start, value.end, zone);
    if (interval.end - interval.start > 366 * 86400000)
      throw new AppError('Commitments must be shorter than one year.');
    if (value.id) {
      const old = await tx.commitment.findFirst({ where: { id: value.id, userId } });
      if (!old) throw new AppError('This commitment no longer exists.', 404);
      if (old.revision !== value.revision)
        throw new AppError('This commitment changed. Reload before editing.', 409);
    }
    const data = {
      name: value.name,
      startAt: interval.start,
      endAt: interval.end,
      fixed: value.fixed,
    };
    return value.id
      ? tx.commitment.update({
          where: { id: value.id },
          data: { ...data, revision: { increment: 1 } },
        })
      : tx.commitment.create({ data: { userId, ...data } });
  });
}
export async function deleteCommitment(userId: string, input: unknown) {
  const value = z.object({ id: z.string(), revision: revisionSchema }).strict().parse(input);
  return db.$transaction(async (tx) => {
    const old = await tx.commitment.findFirst({ where: { id: value.id, userId } });
    if (!old) throw new AppError('This commitment no longer exists.', 404);
    if (old.revision !== value.revision)
      throw new AppError('This commitment changed. Reload before deleting.', 409);
    return tx.commitment.delete({ where: { id: value.id } });
  });
}
export async function planningAction(userId: string, b: any) {
  if (b.action === 'availability.save') return saveAvailability(userId, b.data);
  if (b.action === 'commitment.save') return saveCommitment(userId, b.data);
  if (b.action === 'commitment.delete') return deleteCommitment(userId, b.data);
  throw new AppError('Unsupported planning action.');
}
