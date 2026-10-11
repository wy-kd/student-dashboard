import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaults, type Data, type RecordRow } from '../lib/model';
import { assignmentProgress, remaining, workload } from '../lib/calculations';
import {
  breakdownTemplates,
  moveBreakdownTask,
  selectedBreakdownTasks,
  readBreakdownDraft,
  assignmentTaskSummary,
  type BreakdownDraft,
} from '../lib/assignment-breakdown';
import { AppContext } from '../components/context';
import { Editor } from '../components/Editor';
import { AssignmentBreakdown, ManualProgressNotice } from '../components/AssignmentBreakdown';
import { TodoConversion } from '../components/TodoConversion';
import { TodoList } from '../components/TodoList';
import { Detail, Tasks } from '../components/Records';
import { Today } from '../components/DailyPlanning';
import { TaskRow } from '../components/ui';
import { NextRequest } from 'next/server';

const directory = mkdtempSync(join(tmpdir(), 'Student V22 fixture '));
process.env.DATABASE_URL = 'file:' + join(directory, 'student.db');
const sqlite = new DatabaseSync(join(directory, 'student.db'));
for (const path of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', path, 'migration.sql'), 'utf8'));
sqlite.close();
const previousDirectory = process.cwd();
process.chdir(directory);
const { db } = await import('../lib/db');
const { saveRow, cleanInput, snapshot, deleteRow } = await import('../lib/service');
const { saveAssignmentBreakdown, convertTodoToTask } = await import('../lib/task-workflows');
const { todoAction } = await import('../lib/todos');
const { exportBackup, restoreBackup, toCsv } = await import('../lib/backup');
const { hashToken } = await import('../lib/auth');
const api = await import('../app/api/task-workflows/route');
const dataApi = await import('../app/api/data/route');
let subject: RecordRow;
const token = 'v22-test-session';
test.before(async () => {
  await db.user.create({ data: { id: 'owner', passwordHash: 'fixture-password-hash' } });
  await db.session.create({
    data: { id: hashToken(token), userId: 'owner', expiresAt: Date.now() + 3600000 },
  });
  const semester = await saveRow('semester', {
    ...defaults('semester'),
    name: 'QUT Y1S2',
    startDate: '2026-07-20',
    teachingStart: '2026-07-20',
    endDate: '2026-11-20',
  });
  subject = await saveRow('subject', {
    ...defaults('subject'),
    name: 'Cybersecurity',
    code: 'IFB240',
    semesterId: semester.id,
  });
});
test.after(async () => {
  await db.$disconnect();
  process.chdir(previousDirectory);
  rmSync(directory, { recursive: true, force: true });
});
const createAssignment = (values: any = {}) =>
  saveRow('assignment', {
    ...defaults('assignment'),
    name: 'Risk report',
    subjectId: subject.id,
    dueAt: '2026-10-16T17:00',
    estimatedHours: 10,
    progress: 60,
    ...values,
  });
function row(name: string, hours = 0, dueAt: string | null = null) {
  return {
    name,
    estimatedHours: hours,
    dueAt,
    notes: '',
    status: 'Not Started',
    priority: 'Medium',
  };
}
function request(body: any, origin = 'http://localhost:3000', authenticated = true) {
  return new NextRequest('http://localhost:3000/api/task-workflows', {
    method: 'POST',
    headers: {
      origin,
      host: 'localhost:3000',
      'content-type': 'application/json',
      ...(authenticated ? { cookie: 'student_session=' + token } : {}),
    },
    body: JSON.stringify(body),
  });
}
function render(node: React.ReactNode, data: Data) {
  return renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      {
        value: {
          data,
          allData: data,
          now: '2026-10-11T09:00',
          open() {},
          go() {},
          notify() {},
          save: async () => {},
          reload: async () => {},
        } as any,
      },
      node,
    ),
  );
}

test('assignment creation validates required fields, remains optional and retries without duplicate records', async () => {
  const count = await db.assignment.count();
  await assert.rejects(createAssignment({ name: '' }));
  await assert.rejects(createAssignment({ subjectId: 'missing' }));
  await assert.rejects(createAssignment({ dueAt: 'not-a-date' }));
  assert.equal(await db.assignment.count(), count);
  const requestId = randomUUID();
  const values = {
    ...defaults('assignment'),
    name: 'Simple assignment',
    subjectId: subject.id,
    dueAt: '2026-10-16T17:00',
    estimatedHours: 0,
  };
  const response = await dataApi.POST(request({ entity: 'assignment', data: values, requestId }));
  assert.equal(response.status, 200);
  const a = (await response.json()).row;
  assert.ok(a.id);
  assert.equal(
    await db.task.count({ where: { assignmentId: a.id } }),
    0,
    'skipping breakdown leaves the saved assignment alone',
  );
  const retried = await saveRow('assignment', values, undefined, undefined, requestId);
  assert.equal(retried.id, a.id);
  assert.equal(await db.assignment.count(), count + 1);
  const edited = await saveRow(
    'assignment',
    { ...cleanInput('assignment', a), description: 'Edited description' },
    a.id,
    a.revision,
  );
  assert.equal(edited.description, 'Edited description');
  const html = render(
    React.createElement(Editor, { editor: { entity: 'assignment' }, close() {} }),
    await snapshot(),
  );
  assert.match(html, /Assignment &amp; deadline|Workload &amp; weighting/);
  assert.match(html, /Estimated total hours \(optional\)/);
  assert.match(html, /Fields marked \* are required/);
});
test('manual breakdown and selected edited template steps create normal assignment/subject-linked Tasks in draft order', async () => {
  const a = await createAssignment();
  const drafts: BreakdownDraft[] = breakdownTemplates['General assignment'].map((name, index) => ({
    key: String(index),
    selected: index < 3,
    name,
    dueAt: '',
    estimatedHours: '',
    notes: '',
    priority: 'Medium',
    status: 'Not Started',
  }));
  drafts[1] = {
    ...drafts[1],
    name: 'Research references',
    estimatedHours: '2',
    dueAt: '2026-10-11T17:00',
    notes: 'Use library sources',
  };
  const moved = moveBreakdownTask(drafts, 1, -1);
  assert.equal(drafts[0].name, 'Review instructions', 'reordering does not mutate the draft input');
  assert.equal(moved[0].name, 'Research references');
  const removed = moved.filter((_, index) => index !== 2);
  const tasks = selectedBreakdownTasks(removed);
  assert.equal(tasks.length, 2, 'deselected and removed suggestions are excluded');
  const input = { assignmentId: a.id, requestId: randomUUID(), tasks };
  const ids = await saveAssignmentBreakdown(input);
  const rows = await db.task.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
  assert.deepEqual(
    rows.map((t) => t.name),
    ['Research references', 'Review instructions'],
  );
  for (const t of rows) {
    assert.equal(t.assignmentId, a.id);
    assert.equal(t.subjectId, subject.id);
    assert.equal(t.examId, null);
    assert.equal(t.actualHours, 0);
  }
  assert.equal(rows[0].notes, 'Use library sources');
  assert.equal(rows[0].estimatedHours, 2);
  assert.equal(await db.assignment.count({ where: { id: a.id } }), 1);
});
test('breakdown is all-or-nothing, failed saves retry safely, and lost-response retries do not overwrite completed tasks', async () => {
  const a = await createAssignment();
  const requestId = randomUUID();
  const count = await db.task.count();
  await assert.rejects(
    saveAssignmentBreakdown({
      assignmentId: a.id,
      requestId,
      tasks: [row('Research', 2), row('Draft', 8, 'invalid')],
    }),
  );
  assert.equal(await db.task.count(), count, 'first insert rolls back when a later row fails');
  assert.equal((await db.assignment.findUniqueOrThrow({ where: { id: a.id } })).progress, 60);
  const payload = { assignmentId: a.id, requestId, tasks: [row('Research', 2), row('Draft', 8)] };
  const ids = await saveAssignmentBreakdown(payload);
  const t = await db.task.findUniqueOrThrow({ where: { id: ids[0] } });
  await saveRow('task', { ...cleanInput('task', t), status: 'Completed' }, t.id, t.revision);
  assert.deepEqual(await saveAssignmentBreakdown(payload), ids);
  assert.equal(await db.task.count(), count + 2);
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: ids[0] } })).status, 'Completed');
  await assert.rejects(
    saveAssignmentBreakdown({ ...payload, tasks: [...payload.tasks, row('Extra')] }),
    /changed/,
  );
  const last = await db.task.findUniqueOrThrow({ where: { id: ids[1] } });
  await deleteRow('task', last.id, last.revision);
  await assert.rejects(saveAssignmentBreakdown(payload), /changed/);
  assert.equal(
    await db.task.count(),
    count + 1,
    'retry does not recreate deliberately removed tasks',
  );
});
test('refresh restores a pending batch ID, corrupt/unavailable storage is safe and suggestions stay optional', () => {
  const rows: BreakdownDraft[] = [
    {
      key: 'one',
      selected: true,
      name: 'Manual step',
      notes: '',
      dueAt: '',
      estimatedHours: '',
      priority: 'High',
      status: 'Not Started',
    },
  ];
  const draft = { requestId: randomUUID(), rows, attempted: true };
  const restored = readBreakdownDraft({ getItem: () => JSON.stringify(draft) }, 'assignment');
  assert.deepEqual(restored, draft);
  assert.equal(readBreakdownDraft({ getItem: () => '{bad JSON' }, 'assignment'), null);
  assert.equal(
    readBreakdownDraft(
      {
        getItem() {
          throw Error('blocked');
        },
      },
      'assignment',
    ),
    null,
  );
  assert.equal(
    readBreakdownDraft({ getItem: () => JSON.stringify({ ...draft, rows: [null] }) }, 'assignment'),
    null,
  );
  assert.deepEqual(Object.keys(breakdownTemplates), [
    'Research report',
    'Programming assignment',
    'Presentation',
    'General assignment',
  ]);
  assert.equal(selectedBreakdownTasks([{ ...rows[0], selected: false }]).length, 0);
});
test('weighted progress, reopen/estimate edits, manual transition and workload retain existing calculation rules', async () => {
  const a = await createAssignment();
  const before = await snapshot();
  assert.equal(assignmentProgress(a, before), 60);
  assert.match(
    render(React.createElement(ManualProgressNotice, { assignment: a }), before),
    /Manual progress is currently 60%/,
  );
  const ids = await saveAssignmentBreakdown({
    assignmentId: a.id,
    requestId: randomUUID(),
    tasks: [row('Research', 2), row('Write', 8)],
  });
  let data = await snapshot();
  assert.equal(assignmentProgress(a, data), 0);
  assert.equal(
    (await db.assignment.findUniqueOrThrow({ where: { id: a.id } })).progress,
    60,
    'manual value is retained',
  );
  let t = await db.task.findUniqueOrThrow({ where: { id: ids[0] } });
  t = await saveRow('task', { ...cleanInput('task', t), status: 'Completed' }, t.id, t.revision);
  data = await snapshot();
  assert.equal(assignmentProgress(a, data), 20);
  const scoped = {
    ...data,
    assignment: [a],
    exam: [],
    task: data.task.filter((t) => t.assignmentId === a.id),
  };
  assert.equal(remaining(a, scoped), 8);
  assert.equal(
    workload(scoped, '2026-10-11T09:00').total,
    8,
    'forecast counts assessment workload once',
  );
  t = await saveRow('task', { ...cleanInput('task', t), estimatedHours: 8 }, t.id, t.revision);
  assert.equal(assignmentProgress(a, await snapshot()), 50);
  await saveRow('task', { ...cleanInput('task', t), status: 'Not Started' }, t.id, t.revision);
  assert.equal(assignmentProgress(a, await snapshot()), 0);
  const summary = assignmentTaskSummary(a, await snapshot());
  assert.equal(summary.estimated, 16);
  assert.equal(summary.remainingEstimate, 16);
  assert.ok(summary.next);
});
test('zero-estimate fallback and submitted assignments remain correct', async () => {
  const a = await createAssignment();
  const ids = await saveAssignmentBreakdown({
    assignmentId: a.id,
    requestId: randomUUID(),
    tasks: [row('Review'), row('Submit')],
  });
  const t = await db.task.findUniqueOrThrow({ where: { id: ids[0] } });
  await saveRow('task', { ...cleanInput('task', t), status: 'Completed' }, t.id, t.revision);
  assert.equal(assignmentProgress(a, await snapshot()), 50);
  const submitted = await saveRow(
    'assignment',
    { ...cleanInput('assignment', a), status: 'Submitted' },
    a.id,
    a.revision,
  );
  assert.equal(assignmentProgress(submitted, await snapshot()), 100);
});
test('linked due/overdue/upcoming/undated tasks render in Today, Details and Tasks; completion shares one record', async () => {
  const a = await createAssignment({ name: 'Daily report' });
  const ids = await saveAssignmentBreakdown({
    assignmentId: a.id,
    requestId: randomUUID(),
    tasks: [
      row('Overdue research', 2, '2026-10-10T17:00'),
      row('Today draft', 3, '2026-10-11T17:00'),
      row('Upcoming review', 1, '2026-10-13T17:00'),
      row('Undated next step', 0),
    ],
  });
  let data = await snapshot();
  const scoped = {
    ...data,
    assignment: [a],
    task: data.task.filter((t) => t.assignmentId === a.id),
    studySession: [],
    class: [],
  };
  const today = render(React.createElement(Today), scoped);
  for (const name of ['Overdue research', 'Today draft', 'Upcoming review', 'Undated next step'])
    assert.ok(today.includes(name));
  assert.match(today, /Open assignment Daily report/);
  assert.match(today, />Focus</);
  assert.doesNotMatch(today, /Plan My Day|Plan Next Week/);
  assert.match(
    render(React.createElement(Detail, { entity: 'assignment', id: a.id }), scoped),
    /Assignment tasks · 0 of 4 completed|Break into tasks|Add another task/,
  );
  assert.match(render(React.createElement(Tasks), scoped), /Today draft/);
  const t = await db.task.findUniqueOrThrow({ where: { id: ids[1] } });
  await saveRow('task', { ...cleanInput('task', t), status: 'Completed' }, t.id, t.revision);
  data = await snapshot();
  assert.doesNotMatch(
    render(React.createElement(Today), {
      ...scoped,
      task: data.task.filter((t) => t.assignmentId === a.id),
    }),
    /Today draft/,
  );
  assert.match(
    render(React.createElement(TaskRow, { row: data.task.find((t) => t.id === ids[1])! }), data),
    /checked=""/,
  );
});
test('To-do conversion is atomic, inherits links, preserves completion default and has one retry-safe destination', async () => {
  const a = await createAssignment();
  const todo = await todoAction('owner', {
    action: 'todo.create',
    requestId: randomUUID(),
    todo: { name: 'Quick research', dueDate: '2026-10-11' },
  });
  assert.ok(todo);
  const task = {
    ...row('Quick research', 2, '2026-10-11T17:00'),
    assignmentId: a.id,
    subjectId: null,
  };
  const payload = { todoId: todo.id, revision: todo.revision, task };
  const count = await db.task.count();
  await assert.rejects(
    convertTodoToTask('owner', { ...payload, task: { ...task, assignmentId: 'missing' } }),
  );
  assert.ok(await db.todoItem.findUnique({ where: { id: todo.id } }));
  assert.equal(await db.task.count(), count);
  await assert.rejects(convertTodoToTask('different-owner', payload), /changed|deleted/);
  const id = await convertTodoToTask('owner', payload);
  assert.equal(await convertTodoToTask('owner', payload), id);
  assert.equal(await db.task.count(), count + 1);
  assert.equal(await db.todoItem.findUnique({ where: { id: todo.id } }), null);
  const saved = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(saved.assignmentId, a.id);
  assert.equal(saved.subjectId, subject.id);
  assert.equal(saved.dueAt, task.dueAt);
  const complete = await todoAction('owner', {
    action: 'todo.create',
    requestId: randomUUID(),
    todo: { name: 'Done checklist', dueDate: null },
  });
  assert.ok(complete);
  const completed = await todoAction('owner', {
    action: 'todo.complete',
    id: complete.id,
    revision: complete.revision,
    completed: true,
  });
  assert.ok(completed);
  const data = {
    ...(await snapshot()),
    productivity: { todos: [completed], timer: null, recurrences: [] },
  };
  const html = render(React.createElement(TodoConversion, { todo: completed, close() {} }), data);
  assert.match(html, /<option selected="">Completed<\/option>/);
  assert.match(render(React.createElement(TodoList), data), /Completed \(1\)/);
  const converted = await convertTodoToTask('owner', {
    todoId: completed.id,
    revision: completed.revision,
    task: { ...row('Done checklist'), status: 'Completed', assignmentId: null, subjectId: null },
  });
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: converted } })).status, 'Completed');
});
test('stale To-do conversion fails without loss, and new endpoint preserves authentication and same-origin protection', async () => {
  const todo = await todoAction('owner', {
    action: 'todo.create',
    requestId: randomUUID(),
    todo: { name: 'Keep me', dueDate: null },
  });
  assert.ok(todo);
  const payload = {
    todoId: todo.id,
    revision: todo.revision + 1,
    task: { ...row('Keep me'), assignmentId: null, subjectId: null },
  };
  await assert.rejects(convertTodoToTask('owner', payload), /changed/);
  assert.ok(await db.todoItem.findUnique({ where: { id: todo.id } }));
  const a = await createAssignment();
  const body = {
    action: 'assignment.breakdown',
    assignmentId: a.id,
    requestId: randomUUID(),
    tasks: [row('Secure step')],
  };
  assert.equal((await api.POST(request(body, 'https://evil.example'))).status, 403);
  assert.equal((await api.POST(request(body, 'http://localhost:3000', false))).status, 401);
  assert.equal(await db.task.count({ where: { assignmentId: a.id } }), 0);
  assert.equal((await api.POST(request(body))).status, 200);
  assert.equal((await api.POST(request(body))).status, 200);
  assert.equal(await db.task.count({ where: { assignmentId: a.id } }), 1);
});
test('normal Task IDs, academic history and credentials survive unchanged backup/restore and CSV export', async () => {
  const a = await createAssignment();
  const payload = {
    assignmentId: a.id,
    requestId: randomUUID(),
    tasks: [row('Backup research', 2)],
  };
  const ids = await saveAssignmentBreakdown(payload);
  const session = await saveRow('studySession', {
    ...defaults('studySession'),
    name: 'Historical study',
    subjectId: subject.id,
    assignmentId: a.id,
    dueAt: '2026-10-10T09:00',
    actualHours: 1.25,
    completed: true,
  });
  const backup = await exportBackup();
  assert.equal(backup.version, 2);
  assert.match(toCsv(backup.data.task), /Backup research/);
  await restoreBackup(backup);
  assert.deepEqual(await saveAssignmentBreakdown(payload), ids);
  assert.equal(
    (await db.studySession.findUniqueOrThrow({ where: { id: session.id } })).actualHours,
    1.25,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: 'owner' } })).passwordHash,
    'fixture-password-hash',
  );
  assert.equal(await db.session.count(), 1);
});
