import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaults } from '../lib/model';
const directory = mkdtempSync(join(tmpdir(), 'student-v23-data-'));
process.env.DATABASE_URL = 'file:' + join(directory, 'test.db');
const sqlite = new DatabaseSync(join(directory, 'test.db'));
for (const name of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { saveRow, deleteRow, snapshot } = await import('../lib/service');
test('Missing record diagnosis: stale deletion rejects without affecting a different current task', async () => {
  const deleted = await saveRow('task', { ...defaults('task'), name: 'Removed elsewhere' });
  const other = await saveRow('task', { ...defaults('task'), name: 'Current record' });
  await deleteRow('task', deleted.id, deleted.revision);
  await assert.rejects(
    deleteRow('task', deleted.id, deleted.revision),
    (e) => (e as any).status === 404 && /Record not found/.test((e as Error).message),
  );
  assert.equal((await snapshot()).task.find((t) => t.id === other.id)?.name, 'Current record');
});
test.after(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

test('Additive migration preserves a populated V2.2.1 database including credentials and local records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'student-v221-migration-')),
    sql = new DatabaseSync(join(dir, 'old.db'));
  try {
    const names = readdirSync(resolve('prisma/migrations'))
      .filter((x) => /^\d/.test(x))
      .sort();
    for (const name of names.filter((x) => !x.includes('v23_planning')))
      sql.exec(readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'));
    sql.exec(`INSERT INTO User(id,passwordHash) VALUES('owner','fixture-hash');
      INSERT INTO Session(id,expiresAt,userId) VALUES('fixture-session',123456789,'owner');
      INSERT INTO Setting(id,name,timezone,dailyHours) VALUES('settings','Fixture','Australia/Brisbane',3);
      INSERT INTO Semester(id,name,startDate,endDate,teachingStart) VALUES('sem','Real semester','2026-07-20','2026-11-20','2026-07-20');
      INSERT INTO Subject(id,name,code,semesterId) VALUES('sub','Security','IFB240','sem');
      INSERT INTO Assignment(id,name,subjectId,dueAt,actualHours,revision) VALUES('assessment','Active report','sub','2026-11-01T11:00',2.5,7);
      INSERT INTO Task(id,name,assignmentId,estimatedHours,actualHours,revision) VALUES('work','Write','assessment',3,1,4);
      INSERT INTO StudySession(id,name,assignmentId,dueAt,plannedHours,actualHours,completed) VALUES('history','Recorded work','assessment','2026-10-10T10:00',1,0.6,1);
      INSERT INTO TodoItem(id,userId,name,position,revision) VALUES('todo','owner','Email',3,2);`);
    const tables = sql
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r: any) => r.name as string);
    const before = Object.fromEntries(
      tables.map((name) => [
        name,
        sql.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all(),
      ]),
    );
    const migration = readFileSync(
      resolve('prisma/migrations/20261011060000_v23_planning/migration.sql'),
      'utf8',
    );
    assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
    sql.exec(migration);
    for (const name of tables)
      assert.deepEqual(
        sql.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all(),
        before[name],
        name + ' preserved',
      );
    assert.equal(sql.prepare('SELECT count(*) as n FROM PlannedWorkBlock').get()?.n, 0);
    assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('V3 scheduling backup/restore is transactional; V1/V2 remain supported and do not retain orphan plans', async () => {
  const { exportBackup, restoreBackup } = await import('../lib/backup');
  await db.user.create({ data: { id: 'owner', passwordHash: 'private-fixture-hash' } });
  await db.session.create({ data: { id: 'keep-session', userId: 'owner', expiresAt: 1e15 } });
  const task = (await snapshot()).task[0];
  await db.schedulingPreference.create({
    data: { userId: 'owner', preferredMinutes: 60, minimumMinutes: 20, restMinutes: 5 },
  });
  await db.availabilityWindow.create({
    data: { userId: 'owner', day: 1, startTime: '09:00', endTime: '12:00' },
  });
  await db.availabilityException.create({
    data: { userId: 'owner', date: '2026-10-12', windows: '[]' },
  });
  await db.commitment.create({
    data: { userId: 'owner', name: 'Appointment', startAt: 1e12, endAt: 1e12 + 3600000 },
  });
  await db.workEstimate.create({
    data: { userId: 'owner', workKey: 'task:' + task.id, minutes: 90 },
  });
  await db.scheduleBatch.create({
    data: {
      id: 'batch',
      userId: 'owner',
      requestHash: 'a'.repeat(64),
      payload: '{}',
      createdAt: 1e12,
    },
  });
  await db.plannedWorkBlock.create({
    data: {
      userId: 'owner',
      taskId: task.id,
      batchId: 'batch',
      name: 'Planned effort',
      startAt: 1e12 + 3600000,
      endAt: 1e12 + 7200000,
    },
  });
  const backup = await exportBackup();
  assert.equal(backup.version, 3);
  assert.equal(backup.scheduling.plannedWorkBlock.length, 1);
  assert.equal('planning' in backup.data, false);
  assert.equal(JSON.stringify(backup).includes('private-fixture-hash'), false);
  const studyCount = await db.studySession.count();
  await restoreBackup(backup);
  assert.equal(await db.plannedWorkBlock.count(), 1);
  assert.equal(await db.studySession.count(), studyCount);
  assert.equal((await db.scheduleBatch.findUnique({ where: { id: 'batch' } }))?.state, 'restored');
  assert.equal((await db.task.findUnique({ where: { id: task.id } }))?.status, task.status);
  const bad = structuredClone(backup);
  bad.scheduling.plannedWorkBlock[0].taskId = 'missing';
  await assert.rejects(restoreBackup(bad));
  assert.equal(await db.plannedWorkBlock.count(), 1);
  const invalid = structuredClone(backup);
  invalid.scheduling.availabilityWindow[0].endTime = '08:00';
  await assert.rejects(restoreBackup(invalid));
  assert.equal(await db.plannedWorkBlock.count(), 1);
  const older: any = { ...backup, version: 2 };
  delete older.scheduling;
  await restoreBackup(older);
  assert.equal(await db.plannedWorkBlock.count(), 0);
  assert.equal(await db.availabilityWindow.count(), 0);
  assert.equal(
    (await db.user.findUnique({ where: { id: 'owner' } }))?.passwordHash,
    'private-fixture-hash',
  );
  assert.ok(await db.session.findUnique({ where: { id: 'keep-session' } }));
  const oldest: any = { ...older, version: 1 };
  delete oldest.productivity;
  await restoreBackup(oldest);
  assert.equal(await db.task.count(), backup.data.task.length);
});
