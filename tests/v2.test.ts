import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import webpush from 'web-push';
import { NextRequest } from 'next/server';
import { defaults } from '../lib/model';
import { defaultLayout, moveWidget, layoutSchema } from '../lib/dashboard-layout';
import { timerView } from '../lib/timer';
import { suggestDay, weeklyReview } from '../lib/day-plan';
const fixture = mkdtempSync(join(tmpdir(), 'Student V2 fixture ')),
  previous = process.cwd();
process.env.DATABASE_URL = 'file:' + join(fixture, 'student.db');
const sqlite = new DatabaseSync(join(fixture, 'student.db'));
const migrations = readdirSync(resolve('prisma/migrations'))
  .filter((n) => /^\d/.test(n))
  .sort();
sqlite.exec(readFileSync(resolve('prisma/migrations', migrations[0], 'migration.sql'), 'utf8'));
sqlite.exec(
  "INSERT INTO User (id,passwordHash) VALUES ('owner','SECRET-existing-hash'); INSERT INTO Session (id,userId,expiresAt) VALUES ('existing-session','owner',9999999999999);",
);
for (const m of migrations.slice(1))
  sqlite.exec(readFileSync(resolve('prisma/migrations', m, 'migration.sql'), 'utf8'));
assert.equal(
  (sqlite.prepare('SELECT passwordHash FROM User').get() as any).passwordHash,
  'SECRET-existing-hash',
);
sqlite.close();
const { db } = await import('../lib/db');
const {
  productivityAction: act,
  timerAction,
  productivitySnapshot,
  nextOccurrence,
} = await import('../lib/productivity');
const { reconcileReminders, isQuiet, civilEpoch } = await import('../lib/reminders');
const { validPushEndpoint, subscriptionAction, deliverPush } = await import('../lib/push');
const { saveRow, snapshot, cleanInput } = await import('../lib/service');
const { exportBackup, restoreBackup } = await import('../lib/backup');
const api = await import('../app/api/productivity/route');
process.chdir(fixture);
test.after(async () => {
  await db.$disconnect();
  process.chdir(previous);
  rmSync(fixture, { recursive: true, force: true });
});
const base = Date.parse('2026-09-07T00:00:00Z');
let assignment: any, task: any, subject: any;
test('V2 additive migration retains authentication and existing records', async () => {
  assert.equal(
    (await db.user.findUnique({ where: { id: 'owner' } }))?.passwordHash,
    'SECRET-existing-hash',
  );
  assert.equal(await db.session.count(), 1);
  const semester = await saveRow('semester', {
    ...defaults('semester'),
    name: 'Semester',
    startDate: '2026-07-01',
    endDate: '2026-12-01',
    teachingStart: '2026-07-01',
  });
  subject = await saveRow('subject', {
    ...defaults('subject'),
    code: 'IFB240',
    name: 'Security',
    semesterId: semester.id,
  });
  assignment = await saveRow('assignment', {
    ...defaults('assignment'),
    name: 'Report',
    subjectId: subject.id,
    dueAt: '2026-09-10T10:00',
    weighting: 35,
  });
  task = await saveRow('task', {
    ...defaults('task'),
    name: 'Analysis',
    assignmentId: assignment.id,
    dueAt: '2026-09-08T10:00',
  });
  await db.setting.upsert({ where: { id: 'settings' }, create: { id: 'settings' }, update: {} });
});
test('separate dashboard layouts persist hide/show, reorder and reset with stale-write rejection', async () => {
  let s = await productivitySnapshot('owner');
  const l = defaultLayout();
  l.mobile[0].hidden = true;
  l.tablet[1].width = 6;
  const changed = moveWidget(l, 'desktop', 'timer', -2);
  await act('owner', { action: 'layout', layout: changed, revision: s.preference.revision });
  s = await productivitySnapshot('owner');
  assert.equal(JSON.parse(s.preference.layout).mobile[0].hidden, true);
  assert.equal(JSON.parse(s.preference.layout).desktop[0].id, 'timer');
  assert.equal(JSON.parse(s.preference.layout).tablet[1].width, 6);
  await assert.rejects(act('owner', { action: 'layout', layout: l, revision: 0 }), /changed/);
  await act('owner', {
    action: 'layout',
    layout: defaultLayout(),
    revision: s.preference.revision,
  });
  assert.deepEqual(
    JSON.parse((await productivitySnapshot('owner')).preference.layout),
    defaultLayout(),
  );
  assert.equal(
    layoutSchema.safeParse({ ...l, mobile: [{ ...l.mobile[0], width: 12 }] }).success,
    false,
  );
});
test('countdown pause/resume and recovery use timestamps; completion saves once without manual-hour double count', async () => {
  let t = await timerAction(
    'owner',
    {
      action: 'timer.start',
      timer: {
        requestId: randomUUID(),
        name: 'Report study',
        mode: 'countdown',
        focusMinutes: 25,
        breakMinutes: 5,
        rounds: 2,
        taskId: task.id,
      },
    },
    base,
  );
  assert.equal(timerView(t, base + 5 * 60000).remainingMs, 20 * 60000);
  t = await timerAction(
    'owner',
    { action: 'timer.pause', id: t.id, revision: t.revision },
    base + 5 * 60000,
  );
  assert.equal(timerView(t, base + 60 * 60000).elapsedMs, 5 * 60000);
  t = await timerAction(
    'owner',
    { action: 'timer.resume', id: t.id, revision: t.revision },
    base + 60 * 60000,
  );
  const recovered = await db.studyTimer.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(timerView(recovered, base + 80 * 60000).complete, true);
  assert.equal(timerView(recovered, base + 100 * 60000).totalFocusMs, 25 * 60000);
  t = await timerAction(
    'owner',
    { action: 'timer.break', id: t.id, revision: t.revision },
    base + 80 * 60000,
  );
  assert.equal(timerView(t, base + 85 * 60000).totalFocusMs, 25 * 60000);
  t = await timerAction(
    'owner',
    { action: 'timer.next', id: t.id, revision: t.revision },
    base + 85 * 60000,
  );
  t = await timerAction(
    'owner',
    { action: 'timer.finish', id: t.id, revision: t.revision },
    base + 95 * 60000,
  );
  assert.equal(t.focusMs, 35 * 60000);
  const command = {
    action: 'timer.save',
    id: t.id,
    revision: t.revision,
    completion: { minutes: 35, note: 'Focused work', completeTask: true },
  };
  const saved = await timerAction('owner', command, base + 95 * 60000);
  await timerAction('owner', command, base + 95 * 60000);
  assert.equal(await db.studySession.count({ where: { id: saved.sessionId! } }), 1);
  assert.equal(
    (await db.studySession.findUniqueOrThrow({ where: { id: saved.sessionId! } })).actualHours,
    35 / 60,
  );
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).actualHours, 0);
  assert.equal(
    (await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).actualHours,
    0,
  );
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'Completed');
});
test('stopwatch, start retry, stale device commands and cancel retain one active timer', async () => {
  const timer = {
    requestId: randomUUID(),
    name: 'Reading',
    mode: 'stopwatch',
    focusMinutes: 50,
    breakMinutes: 10,
    rounds: 1,
  };
  let t = await timerAction('owner', { action: 'timer.start', timer }, base);
  assert.equal((await timerAction('owner', { action: 'timer.start', timer }, base)).id, t.id);
  await assert.rejects(
    timerAction(
      'owner',
      { action: 'timer.start', timer: { ...timer, requestId: randomUUID() } },
      base,
    ),
    /already active/,
  );
  assert.equal(timerView(t, base + 7200000).elapsedMs, 7200000);
  t = await timerAction(
    'owner',
    { action: 'timer.pause', id: t.id, revision: t.revision },
    base + 60000,
  );
  await assert.rejects(
    timerAction('owner', { action: 'timer.resume', id: t.id, revision: 0 }, base),
    /changed/,
  );
  await timerAction(
    'owner',
    { action: 'timer.cancel', id: t.id, revision: t.revision },
    base + 60000,
  );
  assert.equal(await db.studyTimer.count({ where: { activeKey: 'owner' } }), 0);
});
test('reminders deduplicate missed offsets, recover after restart, reschedule and cancel completed records', async () => {
  await reconcileReminders('owner', base);
  const first = await db.notification.findMany({ where: { category: 'Deadline' } });
  assert.equal(first.length, 1);
  await db.$disconnect();
  await reconcileReminders('owner', base);
  assert.equal(await db.notification.count({ where: { category: 'Deadline' } }), 1);
  assignment = await saveRow(
    'assignment',
    cleanInput('assignment', { ...assignment, dueAt: '2026-09-20T10:00' }),
    assignment.id,
    assignment.revision,
  );
  await reconcileReminders('owner', base);
  assert.equal(await db.notification.count({ where: { category: 'Deadline' } }), 0);
  assert.ok(
    (await db.reminder.findMany({ where: { assignmentId: assignment.id } })).every(
      (r) => r.dueAt === '2026-09-20T10:00',
    ),
  );
  assignment = await saveRow(
    'assignment',
    cleanInput('assignment', { ...assignment, status: 'Submitted' }),
    assignment.id,
    assignment.revision,
  );
  await reconcileReminders('owner', base);
  assert.equal(await db.reminder.count({ where: { assignmentId: assignment.id } }), 0);
});
test('snooze survives restart; read/unread/dismiss and task completion actions work', async () => {
  const row = await saveRow('task', {
    ...defaults('task'),
    name: 'Due now',
    dueAt: '2026-09-07T10:00',
  });
  await reconcileReminders('owner', base);
  let n = await db.notification.findFirstOrThrow({ where: { reminder: { taskId: row.id } } });
  await act('owner', { action: 'notification.read', id: n.id }, base);
  assert.ok((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt);
  await act('owner', { action: 'notification.unread', id: n.id }, base);
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt, null);
  await act('owner', { action: 'notification.snooze', id: n.id, minutes: 15 }, base);
  await db.$disconnect();
  await reconcileReminders('owner', base + 14 * 60000);
  assert.equal(await db.notification.count({ where: { reminder: { taskId: row.id } } }), 0);
  await reconcileReminders('owner', base + 15 * 60000);
  n = await db.notification.findFirstOrThrow({ where: { reminder: { taskId: row.id } } });
  await act('owner', { action: 'notification.complete', id: n.id }, base + 16 * 60000);
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: row.id } })).status, 'Completed');
  await reconcileReminders('owner', base + 16 * 60000);
  assert.equal(await db.reminder.count({ where: { taskId: row.id } }), 0);
});
test('quiet hours preserve in-app reminders and timezone conversion', async () => {
  assert.equal(isQuiet('2026-09-07T23:30', '23:00', '08:00'), true);
  assert.equal(isQuiet('2026-09-08T07:59', '23:00', '08:00'), true);
  assert.equal(isQuiet('2026-09-08T08:00', '23:00', '08:00'), false);
  assert.equal(isQuiet('2026-09-08T08:00', '08:00', '08:00'), false);
  assert.equal(civilEpoch('2026-09-07T10:00', 'Australia/Brisbane'), base);
  const row = await saveRow('task', {
    ...defaults('task'),
    name: 'Late task',
    dueAt: '2026-09-07T23:30',
  });
  const result = await reconcileReminders('owner', Date.parse('2026-09-07T13:30Z'));
  assert.equal(result.quiet, true);
  assert.equal(await db.notification.count({ where: { reminder: { taskId: row.id } } }), 1);
});
test('deleting a record removes pending reminders by foreign key', async () => {
  const row = await saveRow('task', {
    ...defaults('task'),
    name: 'Temporary',
    dueAt: '2026-09-08T10:00',
  });
  await reconcileReminders('owner', base);
  assert.equal(await db.reminder.count({ where: { taskId: row.id } }), 1);
  await db.task.delete({ where: { id: row.id } });
  assert.equal(await db.reminder.count({ where: { taskId: row.id } }), 0);
});
test('recurrence creates only one outstanding task, preserves history and changes future occurrences', async () => {
  const r = {
    name: 'Weekly review',
    subjectId: null,
    assignmentId: null,
    priority: 'Medium',
    estimatedHours: 1,
    anchor: '2026-09-07',
    time: '17:00',
    intervalDays: 7,
    weekdays: '',
    weekInterval: 1,
    endDate: null,
    enabled: true,
  };
  await act('owner', { action: 'recurrence.save', recurrence: r }, base);
  let rule = await db.recurrence.findFirstOrThrow();
  let occurrences = await db.taskOccurrence.findMany({
    where: { recurrenceId: rule.id },
    include: { task: true },
  });
  assert.equal(occurrences.length, 1);
  await reconcileReminders('owner', base + 30 * 86400000);
  assert.equal(await db.taskOccurrence.count({ where: { recurrenceId: rule.id } }), 1);
  const first = occurrences[0].task;
  await saveRow(
    'task',
    cleanInput('task', { ...first, status: 'Completed' }),
    first.id,
    first.revision,
  );
  await act(
    'owner',
    {
      action: 'recurrence.save',
      id: rule.id,
      revision: rule.revision,
      recurrence: { ...r, name: 'Plan the week' },
    },
    base + 7 * 86400000,
  );
  occurrences = await db.taskOccurrence.findMany({
    where: { recurrenceId: rule.id },
    include: { task: true },
  });
  assert.equal(occurrences.length, 2);
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: first.id } })).name,
    'Weekly review',
  );
  assert.ok(occurrences.some((o) => o.task.name === 'Plan the week'));
  assert.equal(
    nextOccurrence({ ...r, weekdays: '1,3', weekInterval: 2 }, '2026-09-10'),
    '2026-09-21',
  );
});
test('Quick Capture organises transactionally into a linked task and cannot convert twice', async () => {
  const item = (await act('owner', { action: 'capture', name: 'Tutorial questions' }, base)) as any;
  await act(
    'owner',
    {
      action: 'inbox.organise',
      id: item.id,
      task: {
        ...defaults('task'),
        name: item.name,
        assignmentId: assignment.id,
        dueAt: '2026-09-09T17:00',
        priority: 'High',
      },
    },
    base,
  );
  assert.equal(await db.inboxItem.count({ where: { id: item.id } }), 0);
  const t = await db.task.findFirstOrThrow({ where: { name: item.name } });
  assert.equal(t.subjectId, subject.id);
  await assert.rejects(
    act('owner', { action: 'inbox.organise', id: item.id, task: {} }),
    /already organised/,
  );
});
test('day planning avoids classes, capacity and duplicate saves; review uses actual submission time', async () => {
  await db.assignment.update({ where: { id: assignment.id }, data: { status: 'In Progress' } });
  await saveRow('class', {
    ...defaults('class'),
    name: 'Tutorial',
    subjectId: subject.id,
    day: 1,
    startTime: '10:00',
    endTime: '12:00',
    startDate: '2026-09-01',
    endDate: '2026-12-01',
  });
  const d = await snapshot();
  const plan = suggestDay(d, '2026-09-07', '2026-09-07T09:00');
  assert.ok(plan.length);
  assert.ok(
    plan.every(
      (b) =>
        !(
          b.dueAt < '2026-09-07T12:00' &&
          new Date(Date.parse(b.dueAt + 'Z') + b.minutes * 60000).toISOString().slice(0, 16) >
            '2026-09-07T10:00'
        ),
    ),
  );
  assert.ok(plan.reduce((n, b) => n + b.minutes, 0) <= 180);
  const blocks = plan.map((b) => ({ ...b, id: randomUUID() }));
  await act('owner', { action: 'plan.save', blocks }, base);
  await act('owner', { action: 'plan.save', blocks }, base);
  assert.equal(
    await db.studySession.count({ where: { id: { in: blocks.map((b) => b.id) } } }),
    blocks.length,
  );
  assert.equal(weeklyReview(d, '2026-09-07T12:00').submitted, 0);
});
test('push endpoints reject SSRF and stale subscriptions can be removed without exposing keys', async () => {
  for (const endpoint of [
    'http://127.0.0.1:3000',
    'https://localhost/',
    'https://fcm.googleapis.com.evil.example/send',
    'https://fcm.googleapis.com:444/send',
    'https://user:pass@web.push.apple.com/x',
  ])
    assert.equal(validPushEndpoint(endpoint), false);
  assert.equal(validPushEndpoint('https://web.push.apple.com/Q/test'), true);
  const sub = await db.pushSubscription.create({
    data: {
      userId: 'owner',
      name: 'Fixture phone',
      origin: 'https://fixture.example.ts.net',
      endpoint: 'https://web.push.apple.com/Q/test',
      p256dh: 'SECRET-public',
      auth: 'SECRET-auth',
      createdAt: base,
    },
  });
  const s = await productivitySnapshot('owner');
  assert.equal(JSON.stringify(s.subscriptions).includes('SECRET'), false);
  await subscriptionAction(
    'owner',
    { action: 'push.remove', id: sub.id },
    'https://fixture.example.ts.net',
  );
  assert.equal(await db.pushSubscription.count(), 0);
});
test('V2 API keeps authentication and same-origin checks', async () => {
  assert.equal(
    (await api.GET(new NextRequest('http://localhost:3000/api/productivity'))).status,
    401,
  );
  const response = await api.POST(
    new NextRequest('http://localhost:3000/api/productivity', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'https://attacker.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'timer.start' }),
    }),
  );
  assert.equal(response.status, 403);
});
test('push delivery uses private payloads, durable per-device dedupe, retries and stale-device removal', async () => {
  mkdirSync('data', { recursive: true });
  writeFileSync(
    'data/vapid.json',
    JSON.stringify({ ...webpush.generateVAPIDKeys(), subject: 'mailto:fixture@example.com' }),
  );
  const sub = await db.pushSubscription.create({
    data: {
      userId: 'owner',
      name: 'Push fixture',
      origin: 'https://fixture.example.ts.net',
      endpoint: 'https://web.push.apple.com/Q/delivery',
      p256dh: 'fixture-key',
      auth: 'fixture-auth',
      createdAt: base - 1,
    },
  });
  await db.notification.create({
    data: {
      id: 'push-fixture',
      userId: 'owner',
      dedupeKey: 'push-fixture',
      category: 'Deadline',
      title: 'PRIVATE academic title',
      message: 'PRIVATE academic detail',
      createdAt: base,
    },
  });
  const payloads: string[] = [];
  const send: any = async (_: any, payload: string) => {
    payloads.push(payload);
  };
  await deliverPush('owner', { privatePush: true }, base, send);
  const count = payloads.length;
  assert.ok(count > 0);
  assert.ok(payloads.every((p) => !p.includes('PRIVATE')));
  await deliverPush('owner', { privatePush: true }, base + 1, send);
  assert.equal(payloads.length, count);
  await db.notification.create({
    data: {
      id: 'retry-fixture',
      userId: 'owner',
      dedupeKey: 'retry-fixture',
      category: 'Task',
      title: 'Retry',
      message: 'Retry',
      createdAt: base + 2,
    },
  });
  await deliverPush('owner', { privatePush: true }, base + 2, (async () => {
    throw { statusCode: 503 };
  }) as any);
  const lease = await db.pushDelivery.findFirstOrThrow({
    where: { notificationId: 'retry-fixture' },
  });
  assert.equal(lease.attempts, 1);
  assert.equal(lease.deliveredAt, null);
  await db.$disconnect();
  await deliverPush('owner', { privatePush: true }, base + 300003, (async () => {
    throw { statusCode: 410 };
  }) as any);
  assert.equal(await db.pushSubscription.count({ where: { id: sub.id } }), 0);
});
test('daily summary is opt-in, configurable, and created once per civil day', async () => {
  let p = (await productivitySnapshot('owner')).preference;
  assert.equal(p.dailySummary, false);
  const { userId, revision, layout, ...preference } = p;
  await act(
    'owner',
    {
      action: 'preferences',
      preference: { ...preference, dailySummary: true, summaryTime: '10:00' },
      revision: p.revision,
    },
    base,
  );
  await reconcileReminders('owner', base - 60000);
  assert.equal(
    await db.notification.count({ where: { dedupeKey: 'owner:summary:2026-09-07' } }),
    0,
  );
  await reconcileReminders('owner', base);
  await db.$disconnect();
  await reconcileReminders('owner', base + 60000);
  assert.equal(
    await db.notification.count({ where: { dedupeKey: 'owner:summary:2026-09-07' } }),
    1,
  );
});
test('V2 JSON backup round-trips new relational state and V1 still imports without touching auth', async () => {
  const backup = await exportBackup();
  assert.equal(backup.version, 2);
  await assert.rejects(restoreBackup({ ...backup, productivity: undefined }), /Missing V2/);
  assert.equal(JSON.stringify(backup).includes('SECRET'), false);
  const hash = (await db.user.findUniqueOrThrow({ where: { id: 'owner' } })).passwordHash;
  await restoreBackup(backup);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: 'owner' } })).passwordHash, hash);
  assert.equal(await db.session.count(), 1);
  assert.equal(await db.recurrence.count(), backup.productivity.recurrence.length);
  assert.equal(await db.studyTimer.count(), backup.productivity.studyTimer.length);
  const v1 = { ...backup, version: 1 };
  delete (v1 as any).productivity;
  await restoreBackup(v1);
  assert.equal(await db.recurrence.count(), 0);
  assert.equal(await db.assignment.count(), backup.data.assignment.length);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: 'owner' } })).passwordHash, hash);
});
