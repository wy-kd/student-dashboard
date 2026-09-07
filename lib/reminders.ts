import { createHash } from 'node:crypto';
import { db } from './db';
import { snapshot } from './service';
import { ensurePreferences, generateOccurrences } from './productivity';
import { addDays, civilNow, calendarEvents, priorities, workload } from './calculations';
export function civilEpoch(civil: string, timezone: string) {
  const desired = Date.parse(civil + 'Z');
  let stamp = desired;
  for (let i = 0; i < 4; i++) {
    const seen = Date.parse(civilNow(timezone, new Date(stamp)) + 'Z'),
      delta = desired - seen;
    if (!delta) break;
    stamp += delta;
  }
  return stamp;
}
export function isQuiet(civil: string, start: string, end: string) {
  const t = civil.slice(11, 16);
  return start === end ? false : start < end ? t >= start && t < end : t >= start || t < end;
}
export async function reconcileReminders(userId: string, now = Date.now()) {
  return db.$transaction(
    async (tx) => {
      const p = await ensurePreferences(userId, tx),
        d = await snapshot(tx),
        civil = civilNow(d.setting.timezone, new Date(now));
      await generateOccurrences(tx, userId, civil);
      // Re-read tasks only after bounded occurrence generation.
      d.task = await tx.task.findMany();
      const rules = await tx.reminderRule.findMany({ where: { userId } }),
        desired = new Map<string, any>();
      for (const rule of rules) {
        const kind = rule.kind as 'assignment' | 'exam' | 'task' | 'studySession';
        if (
          !{
            assignment: p.assignmentReminders,
            exam: p.examReminders,
            task: p.taskReminders,
            studySession: p.studyReminders,
          }[kind]
        )
          continue;
        for (const row of d[kind]) {
          if (
            !row.dueAt ||
            row.status === 'Submitted' ||
            row.status === 'Completed' ||
            row.completed
          )
            continue;
          const id = createHash('sha256')
            .update([userId, kind, row.id, row.dueAt, rule.leadMinutes].join('|'))
            .digest('hex');
          desired.set(id, {
            id,
            userId,
            kind,
            [kind + 'Id']: row.id,
            dueAt: row.dueAt,
            notifyAt: civilEpoch(row.dueAt, d.setting.timezone) - rule.leadMinutes * 60000,
            name: row.name,
          });
        }
      }
      const existing = await tx.reminder.findMany({ where: { userId } });
      for (const r of existing)
        if (!desired.has(r.id)) await tx.reminder.delete({ where: { id: r.id } });
      const known = new Set(existing.map((r) => r.id));
      for (const r of desired.values())
        if (!known.has(r.id)) {
          const { name, ...row } = r;
          await tx.reminder.create({ data: row });
        }
      const due = await tx.reminder.findMany({
        where: { userId, state: 'pending', notifyAt: { lte: now } },
        orderBy: { notifyAt: 'desc' },
      });
      // Catch up one most useful reminder per record, rather than a burst of every missed offset.
      const seen = new Set<string>();
      for (const r of due) {
        const record = [r.kind, r.assignmentId || r.examId || r.taskId || r.studySessionId].join(
          ':',
        );
        if (seen.has(record)) {
          await tx.reminder.update({ where: { id: r.id }, data: { state: 'superseded' } });
          continue;
        }
        seen.add(record);
        const info = desired.get(r.id);
        if (!info) continue;
        await tx.notification.upsert({
          where: { dedupeKey: r.id },
          create: {
            userId,
            reminderId: r.id,
            dedupeKey: r.id,
            category:
              r.kind === 'assignment'
                ? 'Deadline'
                : r.kind === 'exam'
                  ? 'Exam'
                  : r.kind === 'task'
                    ? 'Task'
                    : 'Study',
            title: info.name,
            message: (r.kind === 'studySession' ? 'Starts ' : 'Due ') + r.dueAt.replace('T', ' · '),
            createdAt: now,
          },
          update: {},
        });
        await tx.reminder.update({ where: { id: r.id }, data: { state: 'delivered' } });
      }
      if (!p.workloadWarnings)
        await tx.notification.deleteMany({ where: { userId, category: 'Workload' } });
      if (!p.dailySummary)
        await tx.notification.deleteMany({
          where: { userId, dedupeKey: { startsWith: userId + ':summary:' } },
        });
      const today = civil.slice(0, 10);
      if (p.dailySummary && civil.slice(11) >= p.summaryTime) {
        const events = calendarEvents(d, today, today),
          sessions = d.studySession.filter((s) => s.dueAt.slice(0, 10) === today),
          next = priorities(d, civil)[0];
        await tx.notification.upsert({
          where: { dedupeKey: userId + ':summary:' + today },
          create: {
            userId,
            dedupeKey: userId + ':summary:' + today,
            category: 'System',
            title: 'Today',
            message: `${d.task.filter((t) => t.status !== 'Completed' && t.dueAt?.slice(0, 10) <= today).length} tasks · ${events.filter((e) => e.entity === 'class').length} classes · ${sessions.reduce((n, s) => n + s.plannedHours, 0).toFixed(1)}h study planned${next ? ' · Next: ' + next.name : ''}`,
            createdAt: now,
          },
          update: {},
        });
      }
      if (p.workloadWarnings) {
        const f = workload(d, civil, 7);
        if (f.collisions.length)
          await tx.notification.upsert({
            where: { dedupeKey: userId + ':workload:' + today },
            create: {
              userId,
              dedupeKey: userId + ':workload:' + today,
              category: 'Workload',
              title: 'Review this week’s workload',
              message: `${f.total}h estimated. Open Today to adjust your study plan.`,
              createdAt: now,
            },
            update: {},
          });
      }
      // Retain at most 100 current notifications and 30 days of history. Reminder tombstones
      // remain for active records so cleanup cannot resurrect the same reminder.
      await tx.notification.deleteMany({
        where: { userId, createdAt: { lt: now - 30 * 86400000 } },
      });
      const overflow = await tx.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 100,
        select: { id: true },
      });
      if (overflow.length)
        await tx.notification.deleteMany({ where: { id: { in: overflow.map((n) => n.id) } } });
      return { quiet: isQuiet(civil, p.quietStart, p.quietEnd), preference: p };
    },
    { timeout: 30000 },
  );
}
