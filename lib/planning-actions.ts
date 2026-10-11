import { z } from 'zod';
import { db } from './db';
import { AppError, snapshot, validateRelations } from './service';
import { generateSchedule, workItems } from './planning-engine';
import { planningFingerprint, approveSchedule, undoSchedule } from './planning-approval';
import { availabilitySchema } from './planning-model';
import { civilRange, instant } from './planning-time';
import { suggestAdjustment } from './planning-adjustments';
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
  if (b.action === 'schedule.adjust') {
    const value = z
      .object({ id: z.string(), startDate: z.string(), endDate: z.string() })
      .strict()
      .parse(b.data);
    const d = await snapshot();
    d.productivity = {
      timer: await db.studyTimer.findFirst({
        where: { userId, activeKey: userId },
        select: { id: true },
      }),
    };
    if (!d.planning?.blocks.some((block) => block.id === value.id && block.userId === userId))
      throw new AppError('This planned session no longer exists.', 404);
    return {
      fingerprint: planningFingerprint(d),
      ...suggestAdjustment(d, Date.now(), value.id, value.startDate, value.endDate),
    };
  }
  if (b.action === 'block.context') return blockContext(userId, b.data);
  if (b.action === 'block.record') return recordPlannedWork(userId, b.data);
  if (b.action === 'block.lock') return setBlockLock(userId, b.data);
  if (b.action === 'block.dismiss') return dismissBlock(userId, b.data);
  if (b.action === 'schedule.approve') return approveSchedule(userId, b.data);
  if (b.action === 'schedule.undo') return undoSchedule(userId, b.data);
  if (b.action === 'estimate.save') return saveWorkEstimate(userId, b.data);
  if (b.action === 'schedule.generate') {
    const value = z
      .object({
        startDate: z.string(),
        endDate: z.string(),
        excluded: z.array(z.string()).max(20000).optional(),
        semesterId: z.string().nullable().optional(),
      })
      .strict()
      .parse(b.data);
    const d = await snapshot();
    const semesterId =
      value.semesterId === undefined ? d.setting.activeSemesterId : value.semesterId;
    if (semesterId && !d.semester.some((s) => s.id === semesterId))
      throw new AppError('Selected semester no longer exists.', 409);
    const subjects = new Set(d.subject.filter((s) => s.semesterId === semesterId).map((s) => s.id));
    const outside = semesterId
      ? workItems(d, Date.now())
          .items.filter((w) => w.subjectId && !subjects.has(w.subjectId))
          .map((w) => w.key)
      : [];
    return {
      fingerprint: planningFingerprint(d),
      ...generateSchedule(d, Date.now(), value.startDate, value.endDate, [
        ...(value.excluded ?? []),
        ...outside,
      ]),
    };
  }
  if (b.action === 'availability.save') return saveAvailability(userId, b.data);
  if (b.action === 'commitment.save') return saveCommitment(userId, b.data);
  if (b.action === 'commitment.delete') return deleteCommitment(userId, b.data);
  throw new AppError('Unsupported planning action.');
}

export async function saveWorkEstimate(userId: string, input: unknown) {
  const value = z
    .object({
      workKey: z.string().regex(/^(task|assignment|exam):[^:]+$/),
      minutes: z.number().finite().min(0).max(600000),
      revision: revisionSchema,
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const [entity, id] = value.workKey.split(':');
    if (!(await (tx as any)[entity].findUnique({ where: { id } })))
      throw new AppError('This work no longer exists.', 404);
    const old = await tx.workEstimate.findUnique({
      where: { userId_workKey: { userId, workKey: value.workKey } },
    });
    if ((old?.revision ?? 0) !== value.revision)
      throw new AppError('Remaining estimate changed. Reload before editing.', 409);
    return tx.workEstimate.upsert({
      where: { userId_workKey: { userId, workKey: value.workKey } },
      create: { userId, workKey: value.workKey, minutes: value.minutes, revision: 1 },
      update: { minutes: value.minutes, revision: { increment: 1 } },
    });
  });
}

export async function setBlockLock(userId: string, input: unknown) {
  const value = z
    .object({ id: z.string(), revision: revisionSchema, locked: z.boolean() })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const old = await tx.plannedWorkBlock.findFirst({ where: { id: value.id, userId } });
    if (!old || old.state !== 'planned')
      throw new AppError('This planned session is no longer editable.', 409);
    if (old.revision !== value.revision)
      throw new AppError('This planned session changed. Reload before editing.', 409);
    return tx.plannedWorkBlock.update({
      where: { id: value.id },
      data: { locked: value.locked, revision: { increment: 1 } },
    });
  });
}
export async function dismissBlock(userId: string, input: unknown) {
  const value = z.object({ id: z.string(), revision: revisionSchema }).strict().parse(input);
  return db.$transaction(async (tx) => {
    const old = await tx.plannedWorkBlock.findFirst({ where: { id: value.id, userId } });
    if (!old || old.state !== 'planned')
      throw new AppError('This planned session is no longer editable.', 409);
    if (old.revision !== value.revision)
      throw new AppError('This planned session changed. Reload before editing.', 409);
    if (old.timerId && (await tx.studyTimer.findUnique({ where: { id: old.timerId } }))?.activeKey)
      throw new AppError('Finish or discard its active timer before removing this plan.', 409);
    return tx.plannedWorkBlock.update({
      where: { id: value.id },
      data: { state: 'dismissed', revision: { increment: 1 } },
    });
  });
}

export async function blockContext(userId: string, input: unknown) {
  const { id } = z.object({ id: z.string() }).strict().parse(input);
  return db.$transaction(async (tx) => {
    const d = await snapshot(tx),
      block = d.planning!.blocks.find((b) => b.id === id && b.userId === userId);
    if (!block) throw new AppError('This planned session no longer exists.', 404);
    return {
      block,
      fingerprint: planningFingerprint(d),
      items: workItems(d, Date.now()).items,
      session: d.studySession.find((s) => s.id === block.sessionId) ?? null,
    };
  });
}
export async function recordPlannedWork(userId: string, input: unknown, now = Date.now()) {
  const value = z
    .object({
      id: z.string(),
      revision: revisionSchema,
      requestId: z.string().uuid(),
      actualStart: z.string(),
      minutes: z.number().finite().min(0).max(1440),
      note: z.string().max(2000),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    const block = await tx.plannedWorkBlock.findFirst({ where: { id: value.id, userId } });
    if (!block) throw new AppError('This planned session no longer exists.', 404);
    const sessionId = 'plan-record:' + value.requestId,
      zone =
        (await tx.setting.findUnique({ where: { id: 'settings' } }))?.timezone ??
        'Australia/Brisbane';
    const start = instant(value.actualStart, zone);
    if (start > now + 60000) throw new AppError('Recorded work must start now or in the past.');
    if (block.sessionId) {
      const session = await tx.studySession.findUnique({ where: { id: block.sessionId } });
      if (
        session?.id === sessionId &&
        session.actualHours === value.minutes / 60 &&
        session.notes === value.note &&
        session.dueAt === value.actualStart
      )
        return session;
      throw new AppError(
        'Work was already recorded for this plan. Open the existing study record.',
        409,
      );
    }
    if (block.revision !== value.revision || block.state !== 'planned')
      throw new AppError('This planned session changed. Review it again.', 409);
    if (
      block.timerId &&
      (await tx.studyTimer.findUnique({ where: { id: block.timerId } }))?.activeKey
    )
      throw new AppError('End and review the active timer instead of recording it again.', 409);
    const task = block.taskId ? await tx.task.findUnique({ where: { id: block.taskId } }) : null;
    if (task && (task.assignmentId !== block.assignmentId || task.examId !== block.examId))
      throw new AppError('Linked task changed. Review the plan association first.', 409);
    const links: any = {
      subjectId: task?.subjectId ?? null,
      assignmentId: block.assignmentId,
      examId: block.examId,
    };
    await validateRelations(tx, 'studySession', links);
    if (await tx.studySession.findUnique({ where: { id: sessionId } }))
      throw new AppError('This recording request was already used for another session.', 409);
    const session = await tx.studySession.create({
      data: {
        id: sessionId,
        name: block.name,
        ...links,
        dueAt: value.actualStart,
        plannedHours: (block.endAt - block.startAt) / 3600000,
        actualHours: value.minutes / 60,
        notes: value.note,
        completed: true,
      },
    });
    await tx.plannedWorkBlock.update({
      where: { id: block.id },
      data: { sessionId: session.id, state: 'reviewed', revision: { increment: 1 } },
    });
    return session;
  });
}
