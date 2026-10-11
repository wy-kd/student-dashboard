import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { snapshot, AppError } from './service';
import type { Data } from './model';
import { workItems, plannedOn } from './planning-engine';
import { availableOn, occupiedBetween } from './planning-availability';
import { civilAt, overlaps, minute, type Interval } from './planning-time';
import { addDays } from './calculations';
export function planningFingerprint(d: Data) {
  const { batches, ...planning } = d.planning ?? {};
  return createHash('sha256')
    .update(
      JSON.stringify({
        setting: d.setting,
        semester: d.semester,
        subject: d.subject,
        task: d.task,
        assignment: d.assignment,
        exam: d.exam,
        class: d.class,
        importantDate: d.importantDate,
        studySession: d.studySession,
        planning,
      }),
    )
    .digest('hex');
}
export const changeSchema = z
  .object({
    id: z.string().min(1).max(100),
    workKey: z
      .string()
      .regex(/^(task|assignment|exam):[^:]+$/)
      .nullable(),
    name: z.string().trim().min(1).max(500),
    startAt: z.number().finite().nonnegative().max(253402300799999),
    endAt: z.number().finite().nonnegative().max(253402300799999),
    override: z.boolean(),
    moveId: z.string().max(100).optional(),
    revision: z.number().int().nonnegative().optional(),
    locked: z.boolean().optional(),
    reason: z.string().max(1000).optional(),
  })
  .strict();
export const approvalSchema = z
  .object({
    requestId: z.string().uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    changes: z.array(changeSchema).min(1).max(200),
  })
  .strict();
export function validateScheduleChanges(
  d: Data,
  changes: z.infer<typeof changeSchema>[],
  now: number,
) {
  const ids = new Set<string>(),
    moving = new Set<string>();
  for (const change of changes) {
    if (ids.has(change.id)) throw new AppError('A suggestion was selected twice.');
    ids.add(change.id);
    if (change.moveId) {
      if (moving.has(change.moveId)) throw new AppError('A confirmed session can move only once.');
      moving.add(change.moveId);
    }
  }
  const currentWork = new Map(workItems(d, now).items.map((w) => [w.key, w]));
  const staged: Interval[] = [],
    rest = (d.planning?.preference.restMinutes ?? 0) * minute;
  const currentBlocks = d.planning?.blocks ?? [];
  const basis = {
    ...d,
    planning: d.planning
      ? { ...d.planning, blocks: currentBlocks.filter((b) => !moving.has(b.id)) }
      : undefined,
  };
  const result = changes.map((change) => {
    if (change.endAt <= change.startAt || change.endAt - change.startAt > 960 * minute)
      throw new AppError('A work block must last between 5 minutes and 16 hours.');
    if (change.endAt - change.startAt < 5 * minute)
      throw new AppError('A work block must last at least 5 minutes.');
    if (change.startAt < now)
      throw new AppError('A suggested time has passed. Regenerate or choose a later start.', 409);
    if (change.moveId) {
      const old = currentBlocks.find((b) => b.id === change.moveId);
      if (!old || old.state !== 'planned')
        throw new AppError('This confirmed session is no longer available to move.', 409);
      if (old.revision !== change.revision)
        throw new AppError('This confirmed session changed. Review it again.', 409);
      if (old.locked)
        throw new AppError('This session is locked. Unlock it explicitly before moving it.', 409);
    }
    const work = change.workKey ? currentWork.get(change.workKey) : null;
    if (change.workKey && !work)
      throw new AppError(
        'Selected work is completed, deleted or now represented by its linked Tasks. Review the proposal.',
        409,
      );
    if (work?.deadline != null && change.endAt > work.deadline)
      throw new AppError('This session ends after the effective Task/assessment deadline.');
    const range = { start: change.startAt, end: change.endAt },
      startDate = civilAt(range.start, d.setting.timezone).slice(0, 10),
      endDate = civilAt(range.end - 1, d.setting.timezone).slice(0, 10);
    if (!change.override) {
      if (
        startDate !== endDate ||
        !availableOn(d, startDate).some((w) => w.start <= range.start && w.end >= range.end)
      )
        throw new AppError(
          'This session is outside configured availability. Adjust it or explicitly choose the manual override.',
        );
    }
    const occupied = occupiedBetween(basis, startDate, endDate);
    for (const event of occupied) {
      const padded =
        event.kind === 'Confirmed study' || event.kind === 'Legacy study plan'
          ? { start: event.start - rest, end: event.end + rest }
          : event;
      if (overlaps(range, padded))
        throw new AppError(
          `This session conflicts with ${event.name}${rest && padded !== event ? ' or its rest interval' : ''}.`,
        );
    }
    for (const previous of staged)
      if (overlaps(range, { start: previous.start - rest, end: previous.end + rest }))
        throw new AppError('Selected sessions overlap or leave insufficient rest time.');
    staged.push(range);
    return {
      change,
      work,
      data: {
        userId: 'owner',
        name: change.name,
        workKey: change.workKey,
        taskId: work?.taskId ?? null,
        assignmentId: work?.assignmentId ?? null,
        examId: work?.examId ?? null,
        startAt: change.startAt,
        endAt: change.endAt,
        locked: change.locked ?? false,
        origin: change.override ? 'manual' : 'suggested',
        state: 'planned',
      },
    };
  });
  const maximum = d.planning?.preference.maxDailyMinutes;
  if (maximum != null) {
    const dates = new Set<string>();
    for (const interval of staged)
      for (
        let date = civilAt(interval.start, d.setting.timezone).slice(0, 10);
        date <= civilAt(interval.end - 1, d.setting.timezone).slice(0, 10);
        date = addDays(date, 1)
      )
        dates.add(date);
    const hypothetical = {
      ...basis,
      planning: {
        ...basis.planning!,
        blocks: [...basis.planning!.blocks, ...result.map((x) => ({ ...x.data, id: x.change.id }))],
      },
    };
    for (const date of dates)
      if (plannedOn(hypothetical, date) > maximum + 0.00001)
        throw new AppError('Selected sessions exceed the configured maximum daily workload.');
  }
  return result;
}
export async function approveSchedule(userId: string, input: unknown, now = Date.now()) {
  const value = approvalSchema.parse(input),
    requestHash = createHash('sha256')
      .update(JSON.stringify({ fingerprint: value.fingerprint, changes: value.changes }))
      .digest('hex');
  try {
    return await db.$transaction(
      async (tx) => {
        const existing = await tx.scheduleBatch.findUnique({ where: { id: value.requestId } });
        if (existing) {
          if (existing.userId !== userId || existing.requestHash !== requestHash)
            throw new AppError(
              'This approval request was already used for different changes.',
              409,
            );
          return { batchId: existing.id, state: existing.state, repeated: true };
        }
        const d = await snapshot(tx);
        if (planningFingerprint(d) !== value.fingerprint)
          throw new AppError(
            'Tasks, availability or commitments changed while this proposal was open. Regenerate and review again.',
            409,
          );
        const validated = validateScheduleChanges(d, value.changes, now);
        const payload: { created: any[]; moved: any[] } = { created: [], moved: [] };
        for (const { change } of validated)
          if (change.moveId) {
            const b = d.planning!.blocks.find((b) => b.id === change.moveId)!;
            if (b.timerId) {
              const timer = await tx.studyTimer.findUnique({ where: { id: b.timerId } });
              if (timer?.activeKey)
                throw new AppError(
                  'Finish or discard the active timer before moving its plan.',
                  409,
                );
            }
          }
        await tx.scheduleBatch.create({
          data: { id: value.requestId, userId, requestHash, payload: '{}', createdAt: now },
        });
        for (const { change, data } of validated) {
          if (change.moveId) {
            const before = d.planning!.blocks.find((b) => b.id === change.moveId)!;
            const after = await tx.plannedWorkBlock.update({
              where: { id: before.id },
              data: { ...data, userId, batchId: value.requestId, revision: { increment: 1 } },
            });
            payload.moved.push({ before, after: { id: after.id, revision: after.revision } });
          } else {
            const block = await tx.plannedWorkBlock.create({
              data: {
                ...data,
                userId,
                id: value.requestId + ':' + payload.created.length,
                batchId: value.requestId,
              },
            });
            payload.created.push({ id: block.id, revision: block.revision });
          }
        }
        await tx.scheduleBatch.update({
          where: { id: value.requestId },
          data: { payload: JSON.stringify(payload) },
        });
        return { batchId: value.requestId, state: 'approved', repeated: false };
      },
      { timeout: 60000 },
    );
  } catch (e: any) {
    if (e.code === 'P2002') {
      const existing = await db.scheduleBatch.findUnique({ where: { id: value.requestId } });
      if (existing?.userId === userId && existing.requestHash === requestHash)
        return { batchId: existing.id, state: existing.state, repeated: true };
    }
    if (['P2034', 'P2028'].includes(e.code))
      throw new AppError(
        'Planning changed during the save. Retry the same approval or regenerate after checking confirmed sessions.',
        409,
      );
    throw e;
  }
}
export async function undoSchedule(userId: string, input: unknown) {
  const { batchId } = z.object({ batchId: z.string().uuid() }).strict().parse(input);
  return db.$transaction(
    async (tx) => {
      const batch = await tx.scheduleBatch.findFirst({ where: { id: batchId, userId } });
      if (!batch) throw new AppError('Approval history no longer exists.', 404);
      if (batch.state === 'undone') return { ok: true, repeated: true };
      if (batch.state !== 'approved')
        throw new AppError('This restored approval no longer has a safe undo baseline.', 409);
      const payload = JSON.parse(batch.payload);
      for (const expected of [...payload.created, ...payload.moved.map((m: any) => m.after)]) {
        const current = await tx.plannedWorkBlock.findFirst({ where: { id: expected.id, userId } });
        if (
          !current ||
          current.revision !== expected.revision ||
          current.state !== 'planned' ||
          current.sessionId
        )
          throw new AppError(
            'A session changed or recorded work since approval. Undo would overwrite newer information.',
            409,
          );
        if (
          current.timerId &&
          (await tx.studyTimer.findUnique({ where: { id: current.timerId } }))?.activeKey
        )
          throw new AppError('An affected timer is active. Finish or discard it before undo.', 409);
      }
      if (payload.moved.length) {
        const d = await snapshot(tx);
        d.planning!.blocks = d.planning!.blocks.filter(
          (b) => !payload.created.some((x: any) => x.id === b.id),
        );
        validateScheduleChanges(
          d,
          payload.moved.map(({ before }: any) => ({
            id: 'undo-' + before.id,
            moveId: before.id,
            revision: d.planning!.blocks.find((b) => b.id === before.id)!.revision,
            workKey: before.workKey ?? null,
            name: before.name,
            startAt: before.startAt,
            endAt: before.endAt,
            override: before.origin === 'manual',
            locked: before.locked,
          })),
          Date.now(),
        );
      }
      for (const item of payload.created)
        await tx.plannedWorkBlock.delete({ where: { id: item.id } });
      for (const { before } of payload.moved) {
        const { id, revision, ...data } = before;
        await tx.plannedWorkBlock.update({
          where: { id },
          data: { ...data, revision: { increment: 1 } },
        });
      }
      await tx.scheduleBatch.update({ where: { id: batch.id }, data: { state: 'undone' } });
      return { ok: true, repeated: false };
    },
    { timeout: 60000 },
  );
}
