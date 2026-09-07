import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { defaults, type Entity } from '../lib/model';
import {
  assignmentProgress,
  gradeSummary,
  countdown,
  calendarEvents,
  priorities,
} from '../lib/calculations';
const dir = mkdtempSync(join(tmpdir(), 'student-test-'));
process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
const sqlite = new DatabaseSync(join(dir, 'test.db'));
for (const dir of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', dir, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { saveRow, deleteRow, snapshot, cleanInput } = await import('../lib/service');
const { exportBackup, restoreBackup, toCsv } = await import('../lib/backup');
const { hashPassword, checkPassword, sameOrigin, authenticate, requireAuth } = await import(
  '../lib/auth'
);
const { NextRequest } = await import('next/server');
const create = (e: Entity, v: any) => saveRow(e, { ...defaults(e), ...v });
test('Complete relational workflow: CRUD, task progress, exams, timetable, study, grades, backups and restart', async () => {
  const s = await create('semester', {
    name: 'Test semester',
    startDate: '2026-07-20',
    endDate: '2026-11-20',
    teachingStart: '2026-07-20',
  });
  const subject = await create('subject', {
    name: 'Cyber Security',
    code: 'IFB240',
    semesterId: s.id,
  });
  const a = await create('assignment', {
    name: 'Risk report',
    subjectId: subject.id,
    dueAt: '2026-09-20T23:59',
    weighting: 60,
    estimatedHours: 10,
  });
  const t1 = await create('task', { name: 'Research', assignmentId: a.id, estimatedHours: 2 }),
    t2 = await create('task', { name: 'Write', assignmentId: a.id, estimatedHours: 8 });
  assert.equal(t1.subjectId, subject.id);
  await saveRow('task', { ...cleanInput('task', t1), status: 'Completed' }, t1.id, t1.revision);
  assert.equal(assignmentProgress(a, await snapshot()), 20);
  await saveRow('task', { ...cleanInput('task', t2), status: 'Completed' }, t2.id, t2.revision);
  assert.equal(assignmentProgress(a, await snapshot()), 100);
  await assert.rejects(
    saveRow('task', { ...cleanInput('task', t1), name: 'Stale edit' }, t1.id, t1.revision),
    /changed on another device/,
  );
  const m = await create('milestone', {
    name: 'Draft',
    assignmentId: a.id,
    dueAt: '2026-09-18T18:00',
  });
  const e = await create('exam', {
    name: 'Final exam',
    subjectId: subject.id,
    dueAt: '2026-10-08T09:00',
    weighting: 40,
  });
  assert.equal(countdown(e.dueAt, '2026-09-20T10:00', true), '18 days until exam');
  await assert.rejects(
    create('assignment', {
      name: 'Extra',
      subjectId: subject.id,
      dueAt: '2026-09-20T12:00',
      weighting: 1,
    }),
    /cannot exceed 100/,
  );
  await create('examTopic', {
    name: 'Mock paper',
    examId: e.id,
    kind: 'Mock exam',
    status: 'Revising',
  });
  const c = await create('class', {
    name: 'Security lecture',
    subjectId: subject.id,
    day: 1,
    startTime: '10:00',
    endTime: '12:00',
    startDate: '2026-07-20',
    endDate: '2026-11-01',
  });
  assert.ok(
    calendarEvents(await snapshot(), '2026-09-07', '2026-09-13').some((x) => x.id === c.id),
  );
  await assert.rejects(
    create('class', {
      name: 'Invalid',
      subjectId: subject.id,
      day: 1,
      startTime: '14:00',
      endTime: '12:00',
      startDate: '2026-07-20',
      endDate: '2026-11-01',
    }),
  );
  await create('studySession', {
    name: 'Revision',
    examId: e.id,
    dueAt: '2026-09-25T14:00',
    actualHours: 2,
    completed: true,
  });
  await create('grade', { assignmentId: a.id, score: 74, maximum: 100 });
  let data = await snapshot();
  assert.equal(gradeSummary(subject.id, data, 75).required, 76.5);
  assert.equal(priorities(data, '2026-09-20T12:00')[0].id, a.id);
  await assert.rejects(create('grade', { assignmentId: a.id, score: 50, maximum: 100 }));
  await assert.rejects(deleteRow('assignment', a.id, a.revision), /linked records/);
  const exported = await exportBackup();
  await deleteRow('milestone', m.id, m.revision);
  assert.equal((await snapshot()).milestone.length, 0);
  await restoreBackup(exported);
  assert.equal((await snapshot()).milestone.length, 1);
  const corrupt = structuredClone(exported);
  corrupt.data.task[0].assignmentId = 'missing';
  await assert.rejects(restoreBackup(corrupt));
  assert.equal((await snapshot()).assignment.length, 1, 'failed restore rolls back');
  const second = new PrismaClient();
  assert.equal(await second.assignment.count(), 1, 'fresh database connection sees saved work');
  await second.$disconnect();
  await db.$disconnect();
  assert.equal((await snapshot()).grade.length, 1, 'data persists after client restart');
});
test('Authentication blocks wrong password, requires origin, stores only hashed session tokens and rate limits attempts', async () => {
  const hash = hashPassword('correct-password');
  assert.equal(checkPassword('correct-password', hash), true);
  assert.equal(checkPassword('incorrect-pass', hash), false);
  await db.user.create({ data: { id: 'owner', passwordHash: hash } });
  const req = (password: string) =>
    new NextRequest('http://localhost:3000/api/auth', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
  assert.throws(
    () =>
      sameOrigin(
        new NextRequest('http://localhost:3000/api/data', {
          headers: {
            host: 'localhost:3000',
            origin: 'http://evil.example',
            'content-type': 'application/json',
          },
        }),
      ),
    /blocked/,
  );
  await assert.rejects(authenticate(req('incorrect-pass')), /Incorrect/);
  const response = await authenticate(req('correct-password'));
  const token = response.cookies.get('student_session')!.value;
  assert.equal((await db.session.findMany())[0].id.includes(token), false);
  await requireAuth(
    new NextRequest('http://localhost:3000/api/data', {
      headers: { cookie: 'student_session=' + token },
    }),
  );
  for (let i = 0; i < 5; i++) await assert.rejects(authenticate(req('incorrect-pass')));
  await assert.rejects(authenticate(req('correct-password')), /Too many/);
});
test('CSV export escapes formula cells', () => {
  const csv = toCsv([{ name: '=1+1', notes: 'a,"b"' }]);
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes('"a,""b"""'));
});
test.after(async () => {
  await db.$disconnect();
});

test('API handlers enforce authentication and transport validation and return working JSON/CSV exports', async () => {
  const dataApi = await import('../app/api/data/route');
  const backupApi = await import('../app/api/backup/route');
  await db.user.update({ where: { id: 'owner' }, data: { lockedUntil: 0, failedAttempts: 0 } });
  const loginReq = new NextRequest('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ password: 'correct-password' }),
  });
  const login = await authenticate(loginReq),
    token = login.cookies.get('student_session')!.value;
  const request = (path: string, method = 'GET', body?: any, origin = 'http://localhost:3000') =>
    new NextRequest('http://localhost:3000' + path, {
      method,
      headers: {
        host: 'localhost:3000',
        origin,
        'content-type': 'application/json',
        cookie: 'student_session=' + token,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await dataApi.GET(new NextRequest('http://localhost:3000/api/data'))).status, 401);
  assert.equal((await dataApi.GET(request('/api/data'))).status, 200);
  assert.equal(
    (
      await dataApi.POST(
        request(
          '/api/data',
          'POST',
          { entity: 'task', data: { ...defaults('task'), name: 'From API' } },
          'http://other.example',
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await dataApi.POST(
        request('/api/data', 'POST', {
          entity: 'task',
          data: { ...defaults('task'), name: 'From API' },
        }),
      )
    ).status,
    200,
  );
  const row = (await snapshot()).task.find((t) => t.name === 'From API')!;
  assert.ok(row);
  const json = await backupApi.GET(request('/api/backup'));
  assert.equal((await json.json()).format, 'student-dashboard');
  const csv = await backupApi.GET(request('/api/backup?csv=task'));
  assert.ok((await csv.text()).includes('From API'));
  assert.equal(
    (
      await dataApi.DELETE(
        request('/api/data', 'DELETE', { entity: 'task', id: row.id, revision: row.revision }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await snapshot()).task.some((t) => t.id === row.id),
    false,
  );
});

test('Demo cleanup preserves edited records and parents needed by personal records', async () => {
  const { seedDemo, clearDemo } = await import('../lib/seed');
  await seedDemo();
  const demo = (await snapshot()).task.find((t) => t.id === 'demo-research')!;
  await saveRow(
    'task',
    { ...cleanInput('task', demo), name: 'My edited research' },
    demo.id,
    demo.revision,
  );
  const result = await clearDemo();
  assert.ok(result.removed > 0);
  assert.ok(result.retained > 0);
  const d = await snapshot();
  assert.ok(d.task.some((t) => t.name === 'My edited research'));
  assert.ok(d.assignment.some((a) => a.id === 'demo-report'));
});
