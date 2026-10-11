import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  availabilityDraft,
  availableOn,
  occupiedBetween,
  freeOn,
} from '../lib/planning-availability';
import { instant, intervalMinutes } from '../lib/planning-time';
import { availabilitySchema } from '../lib/planning-model';
import { defaults } from '../lib/model';
const dir = mkdtempSync(join(tmpdir(), 'student-v23-availability-'));
process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
const sqlite = new DatabaseSync(join(dir, 'test.db'));
for (const name of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { snapshot, saveRow } = await import('../lib/service');
const { saveAvailability, saveCommitment, deleteCommitment } = await import(
  '../lib/planning-actions'
);
const { planningSnapshot } = await import('../lib/planning-store');
const { NextRequest } = await import('next/server');
const api = await import('../app/api/planning/route');
const stamp = (time: string) => instant('2026-10-12T' + time, 'Australia/Brisbane');
let current: any;
test('Availability CRUD supports multiple windows, exceptions, unavailable dates, reset and revision conflicts', async () => {
  await db.user.create({ data: { id: 'owner', passwordHash: 'fixture' } });
  const d = await snapshot();
  assert.equal(availableOn(d, '2026-10-12').length, 0, 'daily target invents no availability');
  const draft = availabilityDraft(d.planning);
  draft.windows = [
    { day: 1, startTime: '09:00', endTime: '12:00' },
    { day: 1, startTime: '14:00', endTime: '17:00' },
  ];
  draft.exceptions = [{ date: '2026-10-12', windows: [] }];
  await saveAvailability('owner', draft);
  assert.equal(availableOn(await snapshot(), '2026-10-12').length, 0);
  const next = availabilityDraft(await planningSnapshot());
  next.exceptions[0].windows = [{ startTime: '19:00', endTime: '21:00' }];
  await saveAvailability('owner', next);
  assert.deepEqual(availableOn(await snapshot(), '2026-10-12'), [
    { start: stamp('19:00'), end: stamp('21:00') },
  ]);
  await assert.rejects(saveAvailability('owner', next), /changed on another device/);
  const restore = availabilityDraft(await planningSnapshot());
  restore.exceptions = [];
  await saveAvailability('owner', restore);
  current = await snapshot();
  assert.equal(
    availableOn(current, '2026-10-12').reduce((n, x) => n + intervalMinutes(x), 0),
    360,
  );
  const bad = availabilityDraft(current.planning);
  bad.windows.push({ day: 1, startTime: '11:00', endTime: '13:00' });
  await assert.rejects(saveAvailability('owner', bad));
  assert.equal((await planningSnapshot()).windows.length, 2);
  assert.equal(
    availabilitySchema.safeParse({
      ...restore,
      preferences: { ...restore.preferences, minimumMinutes: 60, preferredMinutes: 20 },
    }).success,
    false,
  );
});
test('Localised date saves survive reopening, preserve other settings and affect capacity immediately', async () => {
  const { saveAvailabilityException } = await import('../lib/planning-actions');
  const before = await planningSnapshot();
  let result = await saveAvailabilityException('owner', {
    revision: before.preference.revision,
    date: '2026-10-12',
    windows: [
      { startTime: '18:00', endTime: '19:00' },
      { startTime: '20:00', endTime: '22:00' },
    ],
  });
  let reopened = await planningSnapshot();
  assert.deepEqual(reopened.windows, before.windows);
  assert.equal(reopened.preference.preferredMinutes, before.preference.preferredMinutes);
  assert.equal(
    availableOn(await snapshot(), '2026-10-12').reduce((n, x) => n + intervalMinutes(x), 0),
    180,
  );
  assert.deepEqual(
    JSON.parse(
      (await db.availabilityException.findFirstOrThrow({ where: { date: result.date } })).windows,
    ),
    reopened.exceptions[0].windows,
  );
  await assert.rejects(
    saveAvailabilityException('owner', { ...result, revision: before.preference.revision }),
    /changed on another device/,
  );
  await assert.rejects(
    saveAvailabilityException('owner', {
      ...result,
      windows: [
        { startTime: '18:00', endTime: '20:00' },
        { startTime: '19:00', endTime: '21:00' },
      ],
    }),
    /overlap/,
  );
  await assert.rejects(saveAvailabilityException('owner', { ...result, date: '2026-02-30' }));
  result = await saveAvailabilityException('owner', { ...result, windows: [] });
  assert.equal(availableOn(await snapshot(), result.date).length, 0);
  result = await saveAvailabilityException('owner', {
    ...result,
    windows: [{ startTime: '19:00', endTime: '21:00' }],
  });
  assert.equal(
    availableOn(await snapshot(), result.date).reduce((n, x) => n + intervalMinutes(x), 0),
    120,
  );
  await saveAvailabilityException('owner', { ...result, windows: null });
  reopened = await planningSnapshot();
  assert.equal(reopened.exceptions.length, 0);
  assert.deepEqual(reopened.windows, before.windows);
  assert.equal(
    availableOn(await snapshot(), result.date).reduce((n, x) => n + intervalMinutes(x), 0),
    360,
  );
});
test('Existing commitments exclude occupied intervals once; deadlines/informational dates never block; breaks suppress classes', async () => {
  const sem = await saveRow('semester', {
    ...defaults('semester'),
    name: 'Semester',
    startDate: '2026-07-20',
    endDate: '2026-11-20',
    teachingStart: '2026-07-20',
  });
  const sub = await saveRow('subject', {
    ...defaults('subject'),
    code: 'IFB240',
    name: 'Security',
    semesterId: sem.id,
  });
  await saveRow('class', {
    ...defaults('class'),
    name: 'Tutorial',
    subjectId: sub.id,
    day: 1,
    startDate: '2026-10-01',
    endDate: '2026-10-30',
    startTime: '10:00',
    endTime: '11:00',
  });
  const c = await saveCommitment('owner', {
    name: 'Appointment',
    start: '2026-10-12T10:30',
    end: '2026-10-12T12:00',
    fixed: true,
  });
  await saveCommitment('owner', {
    name: 'Overlapping appointment',
    start: '2026-10-12T11:00',
    end: '2026-10-12T12:00',
    fixed: true,
  });
  await saveRow('task', { ...defaults('task'), name: 'Deadline', dueAt: '2026-10-12T15:00' });
  await saveRow('importantDate', {
    ...defaults('importantDate'),
    name: 'Release information',
    dueAt: '2026-10-12T09:00',
    kind: 'Academic',
  });
  let d = await snapshot(),
    free = freeOn(d, '2026-10-12', stamp('09:30'));
  assert.deepEqual(free, [
    { start: stamp('09:30'), end: stamp('10:00') },
    { start: stamp('14:00'), end: stamp('17:00') },
  ]);
  await saveRow('importantDate', {
    ...defaults('importantDate'),
    name: 'Semester Break',
    semesterId: sem.id,
    dueAt: '2026-10-12T00:00',
    endDate: '2026-10-12',
    kind: 'Break',
  });
  d = await snapshot();
  assert.equal(
    occupiedBetween(d, '2026-10-12', '2026-10-12').some((x) => x.kind === 'Lecture'),
    false,
  );
  assert.deepEqual(freeOn(d, '2026-10-12', stamp('09:00'))[0], {
    start: stamp('09:00'),
    end: stamp('10:30'),
  });
  await saveCommitment('owner', {
    id: c.id,
    revision: c.revision,
    name: c.name,
    start: '2026-10-12T10:00',
    end: '2026-10-12T11:00',
    fixed: false,
  });
  await assert.rejects(deleteCommitment('owner', { id: c.id, revision: c.revision }), /changed/);
});
test('Overnight appointments and planned/actual links do not produce duplicate occupied time', async () => {
  await saveCommitment('owner', {
    name: 'Overnight',
    start: '2026-10-11T23:00',
    end: '2026-10-12T09:30',
    fixed: true,
  });
  const session = await saveRow('studySession', {
    ...defaults('studySession'),
    name: 'Linked history',
    dueAt: '2026-10-12T14:00',
    plannedHours: 1,
    actualHours: 0.5,
    completed: true,
  });
  await db.plannedWorkBlock.create({
    data: {
      userId: 'owner',
      name: 'Linked planned period',
      startAt: stamp('14:00'),
      endAt: stamp('15:00'),
      sessionId: session.id,
      state: 'reviewed',
    },
  });
  const unlinked = await saveRow('studySession', {
    ...defaults('studySession'),
    name: 'Existing manual plan',
    dueAt: '2026-10-12T15:00',
    plannedHours: 1,
  });
  const d = await snapshot(),
    occupied = occupiedBetween(d, '2026-10-12', '2026-10-12');
  assert.equal(occupied.filter((x) => x.id === 'legacy:' + session.id).length, 0);
  assert.equal(occupied.filter((x) => x.id === 'legacy:' + unlinked.id).length, 1);
  assert.ok(occupied.some((x) => x.name === 'Overnight'));
  const actualCount = await db.studySession.count();
  await saveAvailability('owner', availabilityDraft(d.planning));
  assert.equal(await db.studySession.count(), actualCount);
});
test('Planning API retains authentication and same-origin write protection', async () => {
  assert.equal((await api.GET(new NextRequest('http://localhost:3000/api/planning'))).status, 401);
  assert.equal(
    (
      await api.POST(
        new NextRequest('http://localhost:3000/api/planning', {
          method: 'POST',
          headers: { Origin: 'https://outside.invalid' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
});

test('Remaining estimates are explicit, revision-guarded and removed only when their source is deleted', async () => {
  const { saveWorkEstimate } = await import('../lib/planning-actions');
  const { deleteRow } = await import('../lib/service');
  const task = await saveRow('task', {
    ...defaults('task'),
    name: 'Review remaining effort',
    estimatedHours: 3,
    actualHours: 1,
  });
  const estimate = await saveWorkEstimate('owner', {
    workKey: 'task:' + task.id,
    minutes: 90,
    revision: 0,
  });
  assert.equal(estimate.minutes, 90);
  await assert.rejects(
    saveWorkEstimate('owner', { workKey: 'task:' + task.id, minutes: 60, revision: 0 }),
    /changed/,
  );
  await assert.rejects(
    saveWorkEstimate('owner', { workKey: 'task:missing', minutes: 60, revision: 0 }),
    /no longer exists/,
  );
  await deleteRow('task', task.id, task.revision);
  assert.equal(await db.workEstimate.count({ where: { workKey: 'task:' + task.id } }), 0);
});

test.after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
