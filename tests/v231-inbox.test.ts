import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { actionableInbox } from '../lib/inbox-state';
import { instant } from '../lib/planning-time';
const migrationRoot = resolve('prisma/migrations');
const migrations = readdirSync(migrationRoot)
  .filter((x) => /^\d/.test(x))
  .sort();
const directory = mkdtempSync(join(tmpdir(), 'student-v231-inbox-'));
process.env.DATABASE_URL = 'file:' + join(directory, 'test.db');
const sql = new DatabaseSync(join(directory, 'test.db'));
for (const name of migrations)
  sql.exec(readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8'));
sql.close();
const previousDirectory = process.cwd();
process.chdir(directory);
const { db } = await import('../lib/db');
const { productivityAction: act, productivitySnapshot } = await import('../lib/productivity');
const { reconcileReminders } = await import('../lib/reminders');
const { exportBackup, restoreBackup } = await import('../lib/backup');
const at = (civil: string) => instant(civil, 'Australia/Brisbane');
const capture = (name: string) =>
  act(
    'owner',
    { action: 'capture', requestId: randomUUID(), name },
    at('2026-10-12T10:00'),
  ) as Promise<any>;
let first: any;
test.before(async () => {
  await db.user.create({ data: { id: 'owner', passwordHash: 'fixture-hash' } });
  await db.session.create({ data: { id: 'fixture-session', userId: 'owner', expiresAt: 1e15 } });
  await db.setting.create({ data: { id: 'settings', timezone: 'Australia/Brisbane' } });
});
test.after(async () => {
  await db.$disconnect();
  process.chdir(previousDirectory);
  rmSync(directory, { recursive: true, force: true });
});
test('Additive V2.3.1 migration preserves all old columns in a populated V2.3 database', () => {
  const file = join(directory, 'populated-v23.db'),
    old = new DatabaseSync(file);
  try {
    for (const name of migrations.filter((x) => !x.includes('v231_inbox')))
      old.exec(readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8'));
    old.exec(`INSERT INTO User(id,passwordHash) VALUES('owner','fixture');
      INSERT INTO Session(id,userId,expiresAt) VALUES('session','owner',999999999999);
      INSERT INTO InboxItem(id,userId,name,createdAt) VALUES('capture','owner','Original announcement',123);
      INSERT INTO Setting(id,name) VALUES('settings','Fixture');
      INSERT INTO Task(id,name,estimatedHours,actualHours,revision) VALUES('task','Active work',2,0.5,8);
      INSERT INTO StudySession(id,name,dueAt,plannedHours,actualHours,completed) VALUES('history','Saved work','2026-10-11T10:00',1,0.5,1);
      INSERT INTO SchedulingPreference(userId,revision) VALUES('owner',4);
      INSERT INTO AvailabilityWindow(id,userId,day,startTime,endTime) VALUES('window','owner',1,'09:00','12:00');
      INSERT INTO AvailabilityException(id,userId,date,windows) VALUES('exception','owner','2026-10-14','[]');
      INSERT INTO Commitment(id,userId,name,startAt,endAt) VALUES('appointment','owner','Appointment',1000,2000);
      INSERT INTO WorkEstimate(id,userId,workKey,minutes) VALUES('estimate','owner','task:task',50);
      INSERT INTO ScheduleBatch(id,userId,requestHash,payload,createdAt) VALUES('approval','owner','hash','{}',123);
      INSERT INTO PlannedWorkBlock(id,userId,name,taskId,workKey,startAt,endAt,batchId) VALUES('plan','owner','Intended work','task','task:task',3000,4000,'approval');`);
    const tables = old
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((x: any) => x.name);
    const before = new Map(
      tables.map((name) => [
        name,
        {
          columns: old
            .prepare(`PRAGMA table_info("${name}")`)
            .all()
            .map((x: any) => x.name),
          rows: old.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
        },
      ]),
    );
    const migration = readFileSync(
      join(migrationRoot, '20261011090000_v231_inbox/migration.sql'),
      'utf8',
    );
    assert.doesNotMatch(migration, /^\s*(DROP|DELETE|UPDATE|INSERT)\b/im);
    old.exec(migration);
    for (const [name, value] of before)
      assert.deepEqual(
        old
          .prepare(
            `SELECT ${value.columns.map((x: string) => '"' + x + '"').join(',')} FROM "${name}" ORDER BY rowid`,
          )
          .all(),
        value.rows,
        name,
      );
    assert.equal(old.prepare('SELECT state FROM InboxItem').get()?.state, 'pending');
    assert.equal(old.prepare('SELECT count(*) AS n FROM InboxReviewPreference').get()?.n, 0);
    assert.equal(old.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    old.close();
  }
});
test('Task conversion is atomic, retains the original text and safely retries one result', async () => {
  first = await capture('Original task capture');
  const input = {
    action: 'inbox.convert',
    id: first.id,
    revision: first.revision,
    requestId: randomUUID(),
    kind: 'task',
    task: { name: 'Reviewed task', notes: first.name },
  };
  const before = await db.task.count();
  await assert.rejects(act('owner', { ...input, task: { name: 'Invalid', subjectId: 'missing' } }));
  assert.equal(
    (await db.inboxItem.findUniqueOrThrow({ where: { id: first.id } })).state,
    'pending',
  );
  const one: any = await act('owner', input),
    retry: any = await act('owner', input);
  assert.equal(one.id, retry.id);
  assert.equal(await db.task.count(), before + 1);
  first = await db.inboxItem.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(first.name, 'Original task capture');
  assert.equal(first.state, 'processed');
  assert.equal(first.processedId, one.id);
  assert.equal(actionableInbox([first], Date.now()).length, 0);
  await assert.rejects(
    act('owner', { ...input, requestId: randomUUID(), revision: first.revision }),
    /already organised/,
  );
});
test('To-do conversion never creates a Task; archive, snooze and count preserve distinct states', async () => {
  const item = await capture('Buy notes'),
    tasks = await db.task.count();
  const input = {
    action: 'inbox.convert',
    id: item.id,
    revision: 0,
    requestId: randomUUID(),
    kind: 'todo',
    todo: { name: 'Buy notebook', dueDate: '2026-10-15' },
  };
  const results = await Promise.allSettled([act('owner', input), act('owner', input)]);
  assert.ok(results.some((x) => x.status === 'fulfilled'));
  const result: any = await act('owner', input);
  assert.ok(await db.todoItem.findUnique({ where: { id: result.id } }));
  assert.equal(await db.task.count(), tasks);
  const later = await capture('Review later');
  await act(
    'owner',
    { action: 'inbox.snooze', id: later.id, revision: 0, until: '2026-10-14T09:00' },
    at('2026-10-12T10:00'),
  );
  const snoozed = await db.inboxItem.findUniqueOrThrow({ where: { id: later.id } });
  assert.equal(actionableInbox([snoozed], at('2026-10-14T08:59')).length, 0);
  assert.equal(actionableInbox([snoozed], at('2026-10-14T09:00')).length, 1);
  await assert.rejects(
    act('owner', { action: 'inbox.archive', id: later.id, revision: 0 }),
    /changed on another device/,
  );
  await act('owner', { action: 'inbox.archive', id: later.id, revision: snoozed.revision });
  const archived = await db.inboxItem.findUniqueOrThrow({ where: { id: later.id } });
  assert.equal(actionableInbox([archived], 1e15).length, 0);
  await act('owner', { action: 'inbox.restore', id: later.id, revision: archived.revision });
  assert.equal(
    actionableInbox((await productivitySnapshot('owner')).inbox, at('2026-10-14T09:00')).length,
    1,
  );
  await act('owner', { action: 'inbox.delete', id: first.id, revision: first.revision });
  assert.ok(
    await db.task.findUnique({ where: { id: first.processedId } }),
    'capture deletion preserves created work',
  );
});
test('Inbox reminders are opt-in, quiet-hour aware, timezone-correct and deduplicated across days', async () => {
  await reconcileReminders('owner', at('2026-10-12T18:00'));
  const notifications = () =>
    db.notification.findMany({ where: { dedupeKey: { startsWith: 'owner:inbox-review:' } } });
  assert.equal((await notifications()).length, 0);
  await act('owner', {
    action: 'inbox.review-preferences',
    revision: 0,
    preference: { frequency: 'daily', time: '18:00', weekday: 1 },
  });
  await assert.rejects(
    act('owner', {
      action: 'inbox.review-preferences',
      revision: 0,
      preference: { frequency: 'off', time: '18:00', weekday: 1 },
    }),
    /another device/,
  );
  await reconcileReminders('owner', at('2026-10-12T23:30'));
  assert.equal((await notifications()).length, 0);
  await reconcileReminders('owner', at('2026-10-13T17:59'));
  assert.equal((await notifications()).length, 0);
  await reconcileReminders('owner', at('2026-10-13T18:00'));
  assert.equal((await notifications()).length, 1);
  await reconcileReminders('owner', at('2026-10-14T18:00'));
  assert.equal(
    (await notifications()).length,
    1,
    'same outstanding state is not repeated on another day',
  );
  await capture('Private original text never in notification');
  await reconcileReminders('owner', at('2026-10-14T18:00'));
  assert.equal((await notifications()).length, 2);
  assert.ok(!(await notifications()).some((x) => x.message.includes('Private original text')));
  await act('owner', {
    action: 'inbox.review-preferences',
    revision: 1,
    preference: { frequency: 'weekly', time: '18:00', weekday: 1 },
  });
  await capture('Weekly review');
  await reconcileReminders('owner', at('2026-10-15T18:00'));
  assert.equal((await notifications()).length, 2);
  await reconcileReminders('owner', at('2026-10-19T18:00'));
  assert.equal((await notifications()).length, 3);
});
test('New Inbox state round-trips and pre-V2.3.1 V3 captures restore without losing text or authentication', async () => {
  const backup = await exportBackup();
  const captures = backup.productivity.inboxItem;
  await restoreBackup(backup);
  assert.deepEqual(
    (await exportBackup()).productivity.inboxItem.map((x: any) => ({ ...x, revision: 0 })),
    captures.map((x: any) => ({ ...x, revision: 0 })),
  );
  assert.equal(
    (await db.inboxReviewPreference.findUniqueOrThrow({ where: { userId: 'owner' } })).frequency,
    'weekly',
  );
  const old = structuredClone(backup) as any;
  delete old.productivity.inboxReviewPreference;
  old.productivity.inboxItem = old.productivity.inboxItem.map(
    ({ id, userId, name, createdAt }: any) => ({ id, userId, name, createdAt }),
  );
  await restoreBackup(old);
  assert.equal(
    (await db.inboxItem.findMany()).every((x) => x.state === 'pending'),
    true,
  );
  assert.equal(await db.inboxReviewPreference.count(), 0);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: 'owner' } })).passwordHash,
    'fixture-hash',
  );
  assert.equal(await db.session.count(), 1);
});
