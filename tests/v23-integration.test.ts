import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaults } from '../lib/model';
import { calendarEvents } from '../lib/calculations';
import { todayPlanning } from '../lib/planning-view';
import { workItems } from '../lib/planning-engine';
import { scheduleIssues } from '../lib/planning-disruptions';
import { suggestAdjustment } from '../lib/planning-adjustments';
import { instant, minute } from '../lib/planning-time';
const dir = mkdtempSync(join(tmpdir(), 'student-v23-integration-'));
process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
const sqlite = new DatabaseSync(join(dir, 'test.db'));
for (const name of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { saveRow, snapshot } = await import('../lib/service');
const { timerAction, productivitySnapshot } = await import('../lib/productivity');
const { approveSchedule, planningFingerprint } = await import('../lib/planning-approval');
const { recordPlannedWork, dismissBlock, planningAction } = await import('../lib/planning-actions');
const zone = 'Australia/Brisbane',
  date = '2026-10-12',
  stamp = (t: string) => instant(date + 'T' + t, zone);
let task: any, block: any;
test.before(async () => {
  await db.user.create({ data: { id: 'owner', passwordHash: 'fixture' } });
  await db.schedulingPreference.create({ data: { userId: 'owner', revision: 1 } });
  for (let day = 0; day < 7; day++)
    await db.availabilityWindow.create({
      data: { userId: 'owner', day, startTime: '09:00', endTime: '17:00' },
    });
});
test.beforeEach(async () => {
  await db.commitment.deleteMany();
  await db.availabilityException.deleteMany();
  await db.plannedWorkBlock.deleteMany();
  await db.scheduleBatch.deleteMany();
  await db.studyTimer.deleteMany();
  await db.studySession.deleteMany();
  await db.task.deleteMany();
  task = await saveRow('task', {
    ...defaults('task'),
    name: 'Research',
    estimatedHours: 2,
    dueAt: date + 'T18:00',
  });
  await approveSchedule(
    'owner',
    {
      requestId: randomUUID(),
      fingerprint: planningFingerprint(await snapshot()),
      changes: [
        {
          id: 'test',
          name: 'Research focus',
          workKey: 'task:' + task.id,
          startAt: stamp('10:00'),
          endAt: stamp('11:00'),
          override: false,
        },
      ],
    },
    stamp('08:00'),
  );
  block = await db.plannedWorkBlock.findFirst();
});
const start = () =>
  timerAction(
    'owner',
    {
      action: 'timer.start',
      timer: {
        requestId: randomUUID(),
        plannedBlockId: block.id,
        name: 'Ignored caller title',
        mode: 'stopwatch',
        focusMinutes: 25,
        breakMinutes: 5,
        rounds: 4,
      },
    },
    stamp('10:00'),
  );
test('Confirmed intentions appear once in Today and Calendar; existing task appears once and fixed appointments remain visible', async () => {
  await db.commitment.create({
    data: { userId: 'owner', name: 'Appointment', startAt: stamp('12:00'), endAt: stamp('13:00') },
  });
  const d = await snapshot(),
    events = calendarEvents(d, date, date),
    summary = todayPlanning(d, date, stamp('09:00'));
  assert.equal(events.filter((e) => e.entity === 'plannedWorkBlock').length, 1);
  assert.equal(events.filter((e) => e.entity === 'commitment').length, 1);
  assert.equal(summary.plannedMinutes, 60);
  assert.equal(summary.recordedMinutes, 0);
  assert.equal(summary.remainingMinutes, 60);
  assert.equal(summary.tasks.filter((t) => t.id === task.id).length, 1);
  assert.ok(summary.availableMinutes! < 7 * 60);
  assert.equal(await db.studySession.count(), 0);
  await db.commitment.deleteMany();
});
test('Planned timer uses existing pause/resume/End/review flow, records 35 actual against 60 intended exactly once and synchronises snapshots', async () => {
  let timer = await start();
  assert.equal(timer.focusMinutes, 60);
  assert.equal(timer.rounds, 1);
  assert.equal(timer.name, block.name);
  assert.equal(timer.taskId, task.id);
  const otherDevice = await productivitySnapshot('owner');
  assert.equal(otherDevice.timer?.id, timer.id);
  timer = await timerAction(
    'owner',
    { action: 'timer.pause', id: timer.id, revision: timer.revision },
    stamp('10:10'),
  );
  assert.equal((await productivitySnapshot('owner')).timer?.status, 'paused');
  timer = await timerAction(
    'owner',
    { action: 'timer.resume', id: timer.id, revision: timer.revision },
    stamp('10:15'),
  );
  timer = await timerAction(
    'owner',
    { action: 'timer.finish', id: timer.id, revision: timer.revision },
    stamp('10:40'),
  );
  assert.equal(timer.status, 'review');
  assert.equal(await db.studySession.count(), 0);
  const command = {
    action: 'timer.save',
    id: timer.id,
    revision: timer.revision,
    completion: { minutes: 35, note: 'Reviewed actual work', completeTask: false },
  };
  const saved = await timerAction('owner', command, stamp('10:41'));
  await timerAction('owner', command, stamp('10:41'));
  assert.equal(await db.studySession.count(), 1);
  const d = await snapshot(),
    session = d.studySession[0],
    plan = d.planning!.blocks[0];
  assert.equal(session.actualHours, 35 / 60);
  assert.equal(session.plannedHours, 1);
  assert.equal(plan.sessionId, saved.sessionId);
  assert.equal(plan.state, 'reviewed');
  assert.equal(d.task[0].status, 'Not Started');
  assert.equal(d.task[0].actualHours, 0);
  assert.equal(
    d.planning!.taskRecordedMinutes?.[task.id],
    35,
    'timer and plan links count the same actual session once',
  );
  assert.equal(
    workItems(d, stamp('11:00')).items[0].minutes,
    null,
    'remaining effort is not guessed as 25 minutes',
  );
  assert.equal(
    calendarEvents(d, date, date).filter(
      (e) => e.entity === 'plannedWorkBlock' || e.entity === 'studySession',
    ).length,
    1,
  );
  const summary = todayPlanning(d, date, stamp('11:00'));
  assert.equal(summary.plannedMinutes, 60);
  assert.equal(summary.recordedMinutes, 35);
  assert.equal(summary.remainingMinutes, 0);
});
test('Discard preserves the intention, creates no history and manual reviewed recording is guarded and idempotent', async () => {
  let timer = await start();
  const live = await db.plannedWorkBlock.findUnique({ where: { id: block.id } });
  await assert.rejects(
    dismissBlock('owner', { id: block.id, revision: live!.revision }),
    /active timer/i,
  );
  await assert.rejects(
    recordPlannedWork(
      'owner',
      {
        id: block.id,
        revision: live!.revision,
        requestId: randomUUID(),
        actualStart: date + 'T10:00',
        minutes: 30,
        note: '',
      },
      stamp('11:00'),
    ),
    /active timer/i,
  );
  timer = await timerAction(
    'owner',
    { action: 'timer.finish', id: timer.id, revision: timer.revision },
    stamp('10:35'),
  );
  await timerAction(
    'owner',
    { action: 'timer.cancel', id: timer.id, revision: timer.revision },
    stamp('10:35'),
  );
  assert.equal(await db.studySession.count(), 0);
  const current = await db.plannedWorkBlock.findUnique({ where: { id: block.id } });
  assert.equal(current!.state, 'planned');
  const command = {
    id: block.id,
    revision: current!.revision,
    requestId: randomUUID(),
    actualStart: date + 'T10:00',
    minutes: 35,
    note: '',
  };
  const session = await recordPlannedWork('owner', command, stamp('11:00'));
  assert.equal((await recordPlannedWork('owner', command, stamp('11:00'))).id, session.id);
  await assert.rejects(
    recordPlannedWork('owner', { ...command, requestId: randomUUID() }, stamp('11:00')),
    /already recorded/,
  );
  assert.equal(await db.studySession.count(), 1);
  const d = await snapshot();
  assert.equal(d.planning!.taskRecordedMinutes?.[task.id], 35);
  assert.equal(workItems(d, stamp('11:00')).items[0].minutes, null);
});
test('A reviewed allocation on a different day does not duplicate intended hours on the actual-record date', async () => {
  await recordPlannedWork(
    'owner',
    {
      id: block.id,
      revision: block.revision,
      requestId: randomUUID(),
      actualStart: '2026-10-13T10:00',
      minutes: 35,
      note: '',
    },
    instant('2026-10-13T11:00', zone),
  );
  const d = await snapshot(),
    next = todayPlanning(d, '2026-10-13', instant('2026-10-13T11:00', zone));
  assert.equal(next.plannedMinutes, 0);
  assert.equal(next.recordedMinutes, 35);
});
test('Source completion prevents starting an obsolete plan and semester generation excludes other work without dropping global commitments', async () => {
  await db.task.update({ where: { id: task.id }, data: { status: 'Completed' } });
  await assert.rejects(start(), /completed or removed/);
  assert.equal(await db.studyTimer.count(), 0);
  const semester = await saveRow('semester', {
    ...defaults('semester'),
    name: 'Other semester',
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    teachingStart: '2026-01-01',
  });
  await assert.rejects(
    planningAction('owner', {
      action: 'schedule.generate',
      data: { startDate: date, endDate: date, semesterId: 'missing' },
    }),
    /semester/,
  );
  assert.ok(semester.id);
  const selected = await saveRow('semester', {
    ...defaults('semester'),
    name: 'Selected semester',
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    teachingStart: '2026-01-01',
  });
  const ownSubject = await saveRow('subject', {
    ...defaults('subject'),
    semesterId: selected.id,
    code: 'OWN',
    name: 'Selected subject',
  });
  const otherSubject = await saveRow('subject', {
    ...defaults('subject'),
    semesterId: semester.id,
    code: 'OTHER',
    name: 'Other subject',
  });
  const ownTask = await saveRow('task', {
    ...defaults('task'),
    subjectId: ownSubject.id,
    name: 'Selected work',
    estimatedHours: 1,
    dueAt: date + 'T18:00',
  });
  const otherTask = await saveRow('task', {
    ...defaults('task'),
    subjectId: otherSubject.id,
    name: 'Other work',
    estimatedHours: 1,
    dueAt: date + 'T18:00',
  });
  await db.commitment.create({
    data: {
      userId: 'owner',
      name: 'Global appointment',
      startAt: stamp('09:00'),
      endAt: stamp('10:00'),
    },
  });
  const realNow = Date.now;
  Date.now = () => stamp('08:00');
  try {
    const proposal: any = await planningAction('owner', {
      action: 'schedule.generate',
      data: { startDate: date, endDate: date, semesterId: selected.id },
    });
    assert.ok(proposal.suggestions.some((b: any) => b.workKey === 'task:' + ownTask.id));
    assert.ok(!proposal.suggestions.some((b: any) => b.workKey === 'task:' + otherTask.id));
    assert.ok(
      proposal.suggestions.every((b: any) => b.startAt >= stamp('11:00')),
      'all physical commitments and other confirmed blocks still reserve time',
    );
  } finally {
    Date.now = realNow;
  }
});
test('Recorded appointments produce unsaved guarded alternatives; only approval moves the existing reservation', async () => {
  const appointment = await db.commitment.create({
    data: {
      userId: 'owner',
      name: 'New recorded appointment',
      startAt: stamp('10:30'),
      endAt: stamp('11:30'),
    },
  });
  let d = await snapshot();
  assert.match(scheduleIssues(d, stamp('08:00'))[0].reasons.join(' '), /recorded appointment/i);
  const proposal = suggestAdjustment(d, stamp('08:00'), block.id, date, '2026-10-18');
  assert.equal(proposal.suggestions.length, 1);
  assert.equal(proposal.suggestions[0].moveId, block.id);
  assert.equal(
    (await db.plannedWorkBlock.findUnique({ where: { id: block.id } }))!.startAt,
    stamp('10:00'),
  );
  assert.equal(await db.studySession.count(), 0);
  const request = {
    requestId: randomUUID(),
    fingerprint: planningFingerprint(d),
    changes: proposal.suggestions,
  };
  await db.task.update({
    where: { id: task.id },
    data: { dueAt: date + 'T17:00', revision: { increment: 1 } },
  });
  await assert.rejects(approveSchedule('owner', request, stamp('08:00')), /changed while/);
  d = await snapshot();
  const fresh = {
    requestId: randomUUID(),
    fingerprint: planningFingerprint(d),
    changes: suggestAdjustment(d, stamp('08:00'), block.id, date, '2026-10-18').suggestions,
  };
  await approveSchedule('owner', fresh, stamp('08:00'));
  await approveSchedule('owner', fresh, stamp('08:00'));
  assert.equal(await db.plannedWorkBlock.count(), 1);
  assert.equal(await db.studySession.count(), 0);
  assert.equal(
    (await db.commitment.findUnique({ where: { id: appointment.id } }))!.startAt,
    stamp('10:30'),
  );
  assert.equal(scheduleIssues(await snapshot(), stamp('08:00')).length, 0);
});
test('Availability exceptions and changed deadlines explain gaps; completed work and fixed/active plans are never automatically moved', async () => {
  await db.availabilityException.create({ data: { userId: 'owner', date, windows: '[]' } });
  let d = await snapshot();
  assert.match(
    scheduleIssues(d, stamp('08:00'))[0].reasons.join(' '),
    /outside current recorded availability/,
  );
  let p = suggestAdjustment(d, stamp('08:00'), block.id, date, '2026-10-18');
  assert.equal(p.suggestions.length, 0);
  assert.equal(p.status, 'Needs adjustment');
  assert.ok(p.unscheduled[0].reason);
  await db.availabilityException.deleteMany();
  await db.task.update({ where: { id: task.id }, data: { dueAt: date + 'T10:30' } });
  d = await snapshot();
  assert.match(scheduleIssues(d, stamp('08:00'))[0].reasons.join(' '), /effective.*deadline/);
  p = suggestAdjustment(d, stamp('08:00'), block.id, date, date);
  assert.ok(p.suggestions[0].endAt <= stamp('10:30'));
  await db.plannedWorkBlock.update({ where: { id: block.id }, data: { locked: true } });
  assert.throws(
    () =>
      suggestAdjustment(
        { ...d, planning: { ...d.planning!, blocks: [{ ...block, locked: true }] } },
        stamp('08:00'),
        block.id,
        date,
        date,
      ),
    /fixed/,
  );
  await db.task.update({ where: { id: task.id }, data: { status: 'Completed' } });
  d = await snapshot();
  assert.equal(scheduleIssues(d, stamp('08:00'))[0].canSuggest, false);
  assert.equal(
    (await db.plannedWorkBlock.findUnique({ where: { id: block.id } }))!.startAt,
    stamp('10:00'),
  );
  assert.equal(await db.studySession.count(), 0);
});
test('Past unconfirmed plans stay neutral; keeping detection has no writes and explicit dismissal preserves all academic data', async () => {
  const d = await snapshot(),
    issues = scheduleIssues(d, stamp('12:00'));
  assert.equal(issues[0].unconfirmed, true);
  assert.match(issues[0].reasons.join(' '), /hasn't been confirmed/);
  assert.doesNotMatch(issues[0].reasons.join(' '), /failed|missed work/);
  assert.equal((await db.task.findUnique({ where: { id: task.id } }))!.status, 'Not Started');
  assert.equal(await db.studySession.count(), 0);
  await dismissBlock('owner', { id: block.id, revision: block.revision });
  assert.equal(scheduleIssues(await snapshot(), stamp('12:00')).length, 0);
  assert.equal(await db.task.count(), 1);
  assert.equal(await db.studySession.count(), 0);
});
test('Active plan timers block adjustment proposals and recorded manual moves are reflected in occupied-time checks', async () => {
  const timer = await start(),
    d = await snapshot();
  d.productivity = await productivitySnapshot('owner');
  await assert.rejects(
    planningAction('owner', {
      action: 'schedule.adjust',
      data: { id: block.id, startDate: date, endDate: date },
    }),
    /active timer/,
  );
  assert.throws(() => suggestAdjustment(d, stamp('12:00'), block.id, date, date), /active timer/);
  const issues = scheduleIssues(d, stamp('12:00'));
  assert.ok(
    !issues.some(
      (i) => i.unconfirmed && i.reasons.some((r) => r.includes("hasn't been confirmed")),
    ),
  );
  await timerAction(
    'owner',
    { action: 'timer.cancel', id: timer.id, revision: timer.revision },
    stamp('12:00'),
  );
  await db.plannedWorkBlock.create({
    data: {
      userId: 'owner',
      name: 'Moved reservation',
      startAt: stamp('10:45'),
      endAt: stamp('11:45'),
      state: 'planned',
      origin: 'manual',
    },
  });
  assert.match(
    scheduleIssues(await snapshot(), stamp('08:00'))[0].reasons.join(' '),
    /Moved reservation/,
  );
});
test.after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
