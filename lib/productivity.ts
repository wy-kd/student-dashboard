import { z } from 'zod';
import { db } from './db';
import { AppError, validateRelations, cleanInput } from './service';
import { schemaFor } from './validation';
import { civilNow, addDays, weekday, dayNumber } from './calculations';
import { layoutSchema, defaultLayout } from './dashboard-layout';
import { timerView } from './timer';
import { randomUUID } from 'node:crypto';
const idSchema = z.string().min(1).max(100);
const optionalId = idSchema.nullish();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
export const preferenceSchema = z
  .object({
    density: z.enum(['Comfortable', 'Compact']),
    assignmentReminders: z.boolean(),
    examReminders: z.boolean(),
    taskReminders: z.boolean(),
    studyReminders: z.boolean(),
    workloadWarnings: z.boolean(),
    dailySummary: z.boolean(),
    summaryTime: time,
    quietStart: time,
    quietEnd: time,
    privatePush: z.boolean(),
  })
  .strict();
export const recurrenceSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    subjectId: optionalId,
    assignmentId: optionalId,
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
    estimatedHours: z.number().min(0).max(1000),
    anchor: day,
    time,
    intervalDays: z.number().int().min(1).max(365),
    weekdays: z.string().regex(/^(?:[0-6](?:,[0-6])*)?$/),
    weekInterval: z.number().int().min(1).max(52),
    endDate: day.nullish(),
    enabled: z.boolean(),
  })
  .strict()
  .refine((x) => !x.endDate || x.endDate >= x.anchor, 'End date must follow start date.');
export async function ensurePreferences(userId: string, client: any = db) {
  let p = await client.preference.findUnique({ where: { userId } });
  if (!p) {
    p = await client.preference.create({
      data: { userId, layout: JSON.stringify(defaultLayout()) },
    });
    for (const [kind, minutes] of Object.entries({
      assignment: [10080, 4320, 1440],
      exam: [20160, 10080, 4320, 1440],
      task: [0],
      studySession: [15, 0],
    }))
      for (const leadMinutes of minutes)
        await client.reminderRule.create({ data: { userId, kind, leadMinutes } });
  }
  return p;
}
export function nextOccurrence(r: any, from: string): string | null {
  for (let i = 0; i <= 366 * 2; i++) {
    const date = addDays(from, i);
    if (r.endDate && date > r.endDate) return null;
    if (date < r.anchor) continue;
    const offset = dayNumber(date) - dayNumber(r.anchor);
    if (
      r.weekdays
        ? r.weekdays.split(',').includes(String(weekday(date))) &&
          Math.floor((offset + ((weekday(r.anchor) + 6) % 7)) / 7) % r.weekInterval === 0
        : offset % r.intervalDays === 0
    )
      return date;
  }
  return null;
}
export async function generateOccurrences(client: any, userId: string, now: string) {
  const rules = await client.recurrence.findMany({
    where: { userId, enabled: true },
    include: { occurrences: { include: { task: true } } },
  });
  for (const r of rules) {
    if (r.occurrences.some((o: any) => o.task.status !== 'Completed')) continue;
    const latest = r.occurrences
      .map((o: any) => o.date)
      .sort()
      .at(-1);
    const from = [r.nextDate, now.slice(0, 10), ...(latest ? [addDays(latest, 1)] : [])]
      .sort()
      .at(-1)!;
    const date = nextOccurrence(r, from);
    if (!date || date > addDays(now, 14)) continue;
    // One outstanding occurrence per series, unique date + task links preserve completion history.
    const task = await client.task.create({
      data: {
        name: r.name,
        subjectId: r.subjectId,
        assignmentId: r.assignmentId,
        priority: r.priority,
        estimatedHours: r.estimatedHours,
        dueAt: date + 'T' + r.time,
      },
    });
    await client.taskOccurrence.create({ data: { recurrenceId: r.id, taskId: task.id, date } });
    await client.recurrence.update({ where: { id: r.id }, data: { nextDate: addDays(date, 1) } });
  }
}
export async function productivitySnapshot(userId: string) {
  return db.$transaction(async (tx) => {
    const preference = await ensurePreferences(userId, tx);
    const [timer, inbox, recurrences, rules, notifications, subscriptions] = await Promise.all([
      tx.studyTimer.findUnique({ where: { activeKey: userId } }),
      tx.inboxItem.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      tx.recurrence.findMany({
        where: { userId },
        include: { occurrences: { select: { taskId: true, date: true } } },
      }),
      tx.reminderRule.findMany({ where: { userId }, orderBy: { leadMinutes: 'desc' } }),
      tx.notification.findMany({
        where: { userId, dismissed: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { reminder: true },
      }),
      tx.pushSubscription.findMany({
        where: { userId },
        select: { id: true, name: true, origin: true, createdAt: true },
      }),
    ]);
    return {
      preference,
      timer,
      inbox,
      recurrences,
      rules,
      notifications,
      subscriptions,
      serverNow: Date.now(),
    };
  });
}
export async function timerAction(userId: string, b: any, now = Date.now()) {
  return db.$transaction(async (tx) => {
    if (b.action === 'timer.start') {
      const input = z
        .object({
          requestId: z.string().uuid(),
          name: z.string().trim().min(1).max(500),
          mode: z.enum(['countdown', 'stopwatch']),
          focusMinutes: z.number().int().min(1).max(240),
          breakMinutes: z.number().int().min(0).max(120),
          rounds: z.number().int().min(1).max(12),
          subjectId: optionalId,
          assignmentId: optionalId,
          taskId: optionalId,
          examId: optionalId,
        })
        .strict()
        .parse(b.timer);
      const existing = await tx.studyTimer.findUnique({ where: { id: input.requestId } });
      if (existing?.userId === userId) return existing;
      if (await tx.studyTimer.findUnique({ where: { activeKey: userId } }))
        throw new AppError('A timer is already active. Refresh to use it.', 409);
      const links: any = {
        subjectId: input.subjectId ?? null,
        assignmentId: input.assignmentId ?? null,
        examId: input.examId ?? null,
      };
      if (input.taskId) {
        const task = await tx.task.findUnique({ where: { id: input.taskId } });
        if (!task) throw new AppError('Linked task no longer exists.');
        Object.assign(links, {
          subjectId: task.subjectId,
          assignmentId: task.assignmentId,
          examId: task.examId,
        });
      }
      if (links.assignmentId && links.examId) throw new AppError('Choose one assessment.');
      await validateRelations(tx, 'studySession', links);
      const { requestId, ...values } = input;
      return tx.studyTimer.create({
        data: {
          ...values,
          ...links,
          id: requestId,
          userId,
          activeKey: userId,
          startedAt: now,
          segmentAt: now,
        },
      });
    }
    const t = await tx.studyTimer.findUnique({ where: { id: idSchema.parse(b.id) } });
    if (!t || t.userId !== userId) throw new AppError('Timer not found.', 404);
    if (b.action === 'timer.save' && t.status === 'saved') return t;
    if (t.revision !== b.revision || !t.activeKey)
      throw new AppError('Timer changed on another device. Refresh before continuing.', 409);
    const v = timerView(t, now),
      changes: any = { revision: { increment: 1 } };
    if (b.action === 'timer.pause') {
      if (t.status !== 'running') throw new AppError('Timer is not running.');
      Object.assign(changes, { status: 'paused', elapsedMs: v.elapsedMs, segmentAt: null });
    } else if (b.action === 'timer.resume') {
      if (t.status !== 'paused') throw new AppError('Timer is not paused.');
      Object.assign(changes, { status: 'running', segmentAt: now });
    } else if (b.action === 'timer.finish')
      Object.assign(changes, {
        status: 'review',
        focusMs: v.totalFocusMs,
        elapsedMs: 0,
        phase: 'review',
        segmentAt: null,
      });
    else if (b.action === 'timer.break') {
      if (t.phase !== 'focus' || !v.complete || t.round >= t.rounds)
        throw new AppError('Complete a focus round first.');
      Object.assign(changes, {
        phase: 'break',
        status: 'running',
        focusMs: v.totalFocusMs,
        elapsedMs: 0,
        segmentAt: now,
      });
    } else if (b.action === 'timer.next') {
      if (t.round >= t.rounds || !(t.phase === 'break' || (t.phase === 'focus' && v.complete)))
        throw new AppError('No next round is available.');
      Object.assign(changes, {
        phase: 'focus',
        status: 'running',
        focusMs: v.totalFocusMs,
        elapsedMs: 0,
        segmentAt: now,
        round: t.round + 1,
      });
    } else if (b.action === 'timer.cancel')
      Object.assign(changes, { status: 'cancelled', activeKey: null, segmentAt: null });
    else if (b.action === 'timer.save') {
      if (t.status !== 'review') throw new AppError('Finish the timer before saving.');
      const input = z
        .object({
          minutes: z.number().min(0).max(1440),
          note: z.string().max(2000),
          completeTask: z.boolean(),
        })
        .strict()
        .parse(b.completion);
      const setting = await tx.setting.findUnique({ where: { id: 'settings' } });
      const session = await tx.studySession.create({
        data: {
          name: t.name,
          subjectId: t.subjectId,
          assignmentId: t.assignmentId,
          examId: t.examId,
          dueAt: civilNow(setting?.timezone, new Date(t.startedAt)),
          plannedHours: t.mode === 'countdown' ? (t.focusMinutes * t.round) / 60 : 0,
          actualHours: input.minutes / 60,
          completed: true,
          notes: input.note,
        },
      });
      if (input.completeTask && t.taskId) {
        const linked = await tx.task.findUnique({ where: { id: t.taskId } });
        if (
          !linked ||
          linked.assignmentId !== t.assignmentId ||
          linked.examId !== t.examId ||
          linked.subjectId !== t.subjectId
        )
          throw new AppError('Linked task changed. Save without marking it complete.', 409);
        if (linked.status !== 'Completed')
          await tx.task.update({
            where: { id: t.taskId },
            data: {
              status: 'Completed',
              completedAt: civilNow(setting?.timezone, new Date(now)),
              demo: false,
              revision: { increment: 1 },
            },
          });
      }
      // Time belongs only to StudySession. Never increment task/assessment manual hours as well.
      Object.assign(changes, {
        sessionId: session.id,
        status: 'saved',
        activeKey: null,
        segmentAt: null,
      });
    } else throw new AppError('Unknown timer action.');
    return tx.studyTimer.update({ where: { id: t.id }, data: changes });
  });
}
export async function productivityAction(userId: string, b: any, now = Date.now()) {
  if (typeof b.action !== 'string') throw new AppError('Choose an action.');
  if (b.action.startsWith('timer.')) return timerAction(userId, b, now);
  return db.$transaction(async (tx) => {
    const setting = await tx.setting.findUnique({ where: { id: 'settings' } }),
      civil = civilNow(setting?.timezone, new Date(now));
    if (b.action === 'layout' || b.action === 'preferences') {
      const p = await ensurePreferences(userId, tx);
      if (b.revision !== p.revision)
        throw new AppError('Preferences changed on another device. Refresh before saving.', 409);
      return tx.preference.update({
        where: { userId },
        data: {
          ...(b.action === 'layout'
            ? { layout: JSON.stringify(layoutSchema.parse(b.layout)) }
            : preferenceSchema.parse(b.preference)),
          revision: { increment: 1 },
        },
      });
    }
    if (b.action === 'rules') {
      const rules = z
        .array(
          z
            .object({
              kind: z.enum(['assignment', 'exam', 'task', 'studySession']),
              leadMinutes: z.number().int().min(0).max(525600),
            })
            .strict(),
        )
        .max(40)
        .parse(b.rules);
      if (new Set(rules.map((r) => r.kind + ':' + r.leadMinutes)).size !== rules.length)
        throw new AppError('Remove duplicate reminder times.');
      await tx.reminderRule.deleteMany({ where: { userId } });
      for (const r of rules) await tx.reminderRule.create({ data: { ...r, userId } });
      return;
    }
    if (b.action === 'plan.save') {
      const blocks = z
        .array(
          z
            .object({
              id: z.string().uuid(),
              name: z.string().min(1).max(500),
              dueAt: z.string(),
              minutes: z.number().min(15).max(240),
              subjectId: optionalId,
              assignmentId: optionalId,
              examId: optionalId,
            })
            .strict(),
        )
        .min(1)
        .max(8)
        .parse(b.blocks);
      for (const block of blocks) {
        const existing = await tx.studySession.findUnique({ where: { id: block.id } });
        if (existing) continue;
        const row: any = schemaFor('studySession').parse(
          cleanInput('studySession', {
            ...block,
            plannedHours: block.minutes / 60,
            actualHours: 0,
            completed: false,
          }),
        );
        await validateRelations(tx, 'studySession', row);
        await tx.studySession.create({ data: { ...row, id: block.id } });
      }
      return;
    }
    if (b.action === 'capture')
      return tx.inboxItem.create({
        data: { userId, name: z.string().trim().min(1).max(500).parse(b.name), createdAt: now },
      });
    if (b.action === 'inbox.delete' || b.action === 'inbox.organise') {
      const item = await tx.inboxItem.findFirst({ where: { id: idSchema.parse(b.id), userId } });
      if (!item) throw new AppError('Capture already organised or deleted.', 409);
      if (b.action === 'inbox.organise') {
        const row: any = schemaFor('task').parse(
          cleanInput('task', { ...b.task, name: b.task?.name || item.name }),
        );
        await validateRelations(tx, 'task', row);
        await tx.task.create({ data: row });
      }
      await tx.inboxItem.delete({ where: { id: item.id } });
      return;
    }
    if (b.action === 'recurrence.save') {
      const row = recurrenceSchema.parse(b.recurrence);
      await validateRelations(tx, 'task', row);
      if (b.id) {
        const old = await tx.recurrence.findFirst({ where: { id: idSchema.parse(b.id), userId } });
        if (!old || old.revision !== b.revision)
          throw new AppError('Series changed. Refresh before saving.', 409);
        await tx.recurrence.update({
          where: { id: old.id },
          data: {
            ...row,
            nextDate: row.anchor > civil.slice(0, 10) ? row.anchor : civil.slice(0, 10),
            revision: { increment: 1 },
          },
        });
      } else await tx.recurrence.create({ data: { ...row, userId, nextDate: row.anchor } });
      await generateOccurrences(tx, userId, civil);
      return;
    }
    if (b.action === 'notification.allRead') {
      await tx.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
      return;
    }
    if (b.action.startsWith('notification.')) {
      const n = await tx.notification.findFirst({
        where: { id: idSchema.parse(b.id), userId },
        include: { reminder: true },
      });
      if (!n) throw new AppError('Notification is no longer available.', 404);
      if (b.action === 'notification.snooze') {
        if (!n.reminder) throw new AppError('This summary cannot be snoozed.');
        const minutes = z.union([z.literal(15), z.literal(60), z.literal(1440)]).parse(b.minutes);
        await tx.reminder.update({
          where: { id: n.reminder.id },
          data: { state: 'pending', notifyAt: now + minutes * 60000 },
        });
        await tx.notification.delete({ where: { id: n.id } });
        return;
      }
      if (b.action === 'notification.complete') {
        if (!n.reminder?.taskId) throw new AppError('No linked task.');
        await tx.task.update({
          where: { id: n.reminder.taskId },
          data: {
            status: 'Completed',
            completedAt: civil,
            demo: false,
            revision: { increment: 1 },
          },
        });
      }
      if (
        ![
          'notification.read',
          'notification.unread',
          'notification.dismiss',
          'notification.complete',
        ].includes(b.action)
      )
        throw new AppError('Unknown notification action.');
      return tx.notification.update({
        where: { id: n.id },
        data: {
          readAt: b.action === 'notification.unread' ? null : now,
          dismissed: b.action === 'notification.dismiss' || b.action === 'notification.complete',
        },
      });
    }
    throw new AppError('Unknown action.');
  });
}
