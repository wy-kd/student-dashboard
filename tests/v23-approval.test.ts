import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaults } from '../lib/model';
import { generateSchedule } from '../lib/planning-engine';
import { instant, minute } from '../lib/planning-time';
const dir = mkdtempSync(join(tmpdir(), 'student-v23-approval-'));
process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
const sqlite = new DatabaseSync(join(dir, 'test.db'));
for (const name of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { saveRow, snapshot, cleanInput } = await import('../lib/service');
const { approveSchedule, undoSchedule, planningFingerprint } = await import(
  '../lib/planning-approval'
);
const { saveCommitment, saveAvailability, setBlockLock } = await import('../lib/planning-actions');
const now = instant('2026-10-12T08:00', 'Australia/Brisbane'),
  stamp = (time: string) => instant('2026-10-12T' + time, 'Australia/Brisbane');
let task: any;
async function proposal() {
  const d = await snapshot();
  return { fingerprint: planningFingerprint(d), ...generateSchedule(d, now) };
}
async function request() {
  const p = await proposal();
  return {
    requestId: randomUUID(),
    fingerprint: p.fingerprint,
    changes: p.suggestions.map((b) => ({
      id: b.id,
      workKey: b.workKey,
      name: b.name,
      startAt: b.startAt,
      endAt: b.endAt,
      override: false,
    })),
  };
}
test.before(async () => {
  await db.user.create({ data: { id: 'owner', passwordHash: 'fixture' } });
  await db.schedulingPreference.create({ data: { userId: 'owner', maxDailyMinutes: 180 } });
  for (let day = 0; day < 7; day++)
    await db.availabilityWindow.create({
      data: { userId: 'owner', day, startTime: '09:00', endTime: '17:00' },
    });
});
test.beforeEach(async () => {
  await db.plannedWorkBlock.deleteMany();
  await db.scheduleBatch.deleteMany();
  await db.commitment.deleteMany();
  await db.workEstimate.deleteMany();
  await db.studyTimer.deleteMany();
  await db.studySession.deleteMany();
  await db.task.deleteMany();
  await db.schedulingPreference.update({
    where: { userId: 'owner' },
    data: { maxDailyMinutes: 180, revision: 0 },
  });
  task = await saveRow('task', {
    ...defaults('task'),
    name: 'Report task',
    estimatedHours: 2,
    dueAt: '2026-10-13T11:00',
  });
});
test('Preview has no writes; selective edited approval is atomic, idempotent and does not record work', async () => {
  const body = await request();
  assert.equal(await db.plannedWorkBlock.count(), 0);
  assert.equal(await db.scheduleBatch.count(), 0);
  body.changes = [{ ...body.changes[0], startAt: stamp('14:00'), endAt: stamp('15:00') }];
  const first = await approveSchedule('owner', body, now),
    retry = await approveSchedule('owner', body, now);
  assert.equal(retry.batchId, first.batchId);
  assert.equal(retry.repeated, true);
  assert.equal(await db.plannedWorkBlock.count(), 1);
  assert.equal(await db.studySession.count(), 0);
  assert.equal((await db.task.findUnique({ where: { id: task.id } }))?.status, 'Not Started');
  assert.equal((await db.plannedWorkBlock.findFirst())?.startAt, stamp('14:00'));
  await assert.rejects(
    approveSchedule(
      'owner',
      { ...body, changes: [{ ...body.changes[0], name: 'Different request' }] },
      now,
    ),
    /different changes/,
  );
});
test('Changed work/availability makes previews stale; completed work and exact due times remain guarded', async () => {
  const body = await request();
  await saveRow('task', { ...cleanInput('task', task), name: 'Changed' }, task.id, task.revision);
  await assert.rejects(approveSchedule('owner', body, now), (e) => (e as any).status === 409);
  assert.equal(await db.plannedWorkBlock.count(), 0);
  const d = await snapshot();
  await saveAvailability('owner', {
    revision: 0,
    preferences: {
      preferredMinutes: 50,
      minimumMinutes: 20,
      restMinutes: 10,
      maxDailyMinutes: 180,
    },
    windows: d.planning!.windows.map(({ day, startTime, endTime }) => ({
      day,
      startTime,
      endTime,
    })),
    exceptions: [],
  });
  await assert.rejects(
    approveSchedule('owner', { ...body, fingerprint: planningFingerprint(d) }, now),
    /changed while/,
  );
  const fresh = await request();
  fresh.changes = [
    {
      ...fresh.changes[0],
      startAt: instant('2026-10-13T10:30', 'Australia/Brisbane'),
      endAt: instant('2026-10-13T11:30', 'Australia/Brisbane'),
    },
  ];
  await assert.rejects(approveSchedule('owner', fresh, now), /effective.*deadline/);
  assert.equal(await db.scheduleBatch.count(), 0);
});
test('Fixed commitments, selected overlap, rest spacing, missing availability and maximum workload are revalidated', async () => {
  await saveCommitment('owner', {
    name: 'Fixed appointment',
    start: '2026-10-12T09:00',
    end: '2026-10-12T10:00',
    fixed: true,
  });
  const body = await request();
  body.changes = [
    {
      id: 'conflict',
      workKey: 'task:' + task.id,
      name: task.name,
      startAt: stamp('09:00'),
      endAt: stamp('10:00'),
      override: true,
    },
  ];
  await assert.rejects(approveSchedule('owner', body, now), /conflicts with Fixed appointment/);
  const next = await request(),
    a = {
      id: 'a',
      workKey: 'task:' + task.id,
      name: task.name,
      startAt: stamp('11:00'),
      endAt: stamp('12:00'),
      override: false,
    };
  next.changes = [a, { ...a, id: 'b', startAt: stamp('12:05'), endAt: stamp('13:05') }];
  await assert.rejects(approveSchedule('owner', next, now), /insufficient rest/);
  next.changes = [{ ...a, startAt: stamp('13:00'), endAt: stamp('16:20') }];
  await assert.rejects(approveSchedule('owner', next, now), /maximum daily/);
  next.changes = [{ ...a, startAt: stamp('18:00'), endAt: stamp('19:00') }];
  await assert.rejects(approveSchedule('owner', next, now), /outside configured/);
  next.changes[0].override = true;
  await approveSchedule('owner', next, now);
  assert.equal((await db.plannedWorkBlock.findFirst())?.origin, 'manual');
});
test('Confirmed moves require approval and revisions; locked sessions stay fixed', async () => {
  const existing = await db.plannedWorkBlock.create({
    data: {
      userId: 'owner',
      workKey: 'task:' + task.id,
      taskId: task.id,
      name: task.name,
      startAt: stamp('09:00'),
      endAt: stamp('10:00'),
      locked: true,
    },
  });
  const body = await request();
  body.changes = [
    {
      id: 'move',
      moveId: existing.id,
      revision: existing.revision,
      workKey: 'task:' + task.id,
      name: task.name,
      startAt: stamp('14:00'),
      endAt: stamp('15:00'),
      override: false,
    } as any,
  ];
  await assert.rejects(approveSchedule('owner', body, now), /locked/);
  await setBlockLock('owner', { id: existing.id, revision: existing.revision, locked: false });
  body.fingerprint = planningFingerprint(await snapshot());
  (body.changes[0] as any).revision = 1;
  const result = await approveSchedule('owner', body, now);
  assert.equal(await db.plannedWorkBlock.count(), 1);
  assert.equal(
    (await db.plannedWorkBlock.findUnique({ where: { id: existing.id } }))?.startAt,
    stamp('14:00'),
  );
  await undoSchedule('owner', { batchId: result.batchId });
  assert.equal(
    (await db.plannedWorkBlock.findUnique({ where: { id: existing.id } }))?.startAt,
    stamp('09:00'),
  );
  assert.equal(await db.studySession.count(), 0);
});
test('Undo new reservations is idempotent and protects later revisions and recorded study history', async () => {
  let body = await request(),
    result = await approveSchedule('owner', body, now);
  await undoSchedule('owner', { batchId: result.batchId });
  await undoSchedule('owner', { batchId: result.batchId });
  assert.equal(await db.plannedWorkBlock.count(), 0);
  body = await request();
  result = await approveSchedule('owner', body, now);
  const block = (await db.plannedWorkBlock.findFirst())!;
  await setBlockLock('owner', { id: block.id, revision: block.revision, locked: true });
  await assert.rejects(undoSchedule('owner', { batchId: result.batchId }), /newer information/);
  const session = await saveRow('studySession', {
    ...defaults('studySession'),
    name: 'Recorded actual',
    dueAt: '2026-10-12T09:00',
    actualHours: 0.5,
    completed: true,
  });
  await db.plannedWorkBlock.update({
    where: { id: block.id },
    data: { sessionId: session.id, state: 'reviewed', revision: { increment: 1 } },
  });
  await assert.rejects(undoSchedule('owner', { batchId: result.batchId }), /newer information/);
  assert.equal(await db.studySession.count(), 1);
  assert.ok(await db.task.findUnique({ where: { id: task.id } }));
});
test('Undo a moved plan refuses newly occupied original time without modifying the approved plan', async () => {
  const block = await db.plannedWorkBlock.create({
    data: {
      userId: 'owner',
      workKey: 'task:' + task.id,
      taskId: task.id,
      name: task.name,
      startAt: stamp('09:00'),
      endAt: stamp('10:00'),
    },
  });
  const body = await request();
  body.changes = [
    {
      id: 'move',
      moveId: block.id,
      revision: 0,
      workKey: 'task:' + task.id,
      name: task.name,
      startAt: stamp('14:00'),
      endAt: stamp('15:00'),
      override: false,
    } as any,
  ];
  const result = await approveSchedule('owner', body, now);
  await saveCommitment('owner', {
    name: 'New fixed appointment',
    start: '2026-10-12T09:00',
    end: '2026-10-12T10:00',
    fixed: true,
  });
  await assert.rejects(
    undoSchedule('owner', { batchId: result.batchId }),
    /conflicts with New fixed/,
  );
  assert.equal(
    (await db.plannedWorkBlock.findUnique({ where: { id: block.id } }))?.startAt,
    stamp('14:00'),
  );
});
test('Concurrent approvals cannot reserve the same intervals twice', async () => {
  const body = await request();
  const results = await Promise.allSettled([
    approveSchedule('owner', body, now),
    approveSchedule('owner', { ...body, requestId: randomUUID() }, now),
  ]);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  assert.equal(await db.scheduleBatch.count(), 1);
  assert.equal(await db.plannedWorkBlock.count(), body.changes.length);
});
test.after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
