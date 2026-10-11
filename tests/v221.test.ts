import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import React, { act } from 'react';
import { defaults, type Data, type RecordRow } from '../lib/model';
import {
  filterTaskRows,
  taskLists,
  taskViews,
  taskQuickDraft,
  taskQuickValues,
  cancelQuickEditKey,
  quickEditReducer,
} from '../lib/task-workspace';
import { breakdownDraftValid, type BreakdownDraft } from '../lib/assignment-breakdown';
import { assignmentProgress, workload } from '../lib/calculations';
import { AppContext } from '../components/context';
import { Tasks } from '../components/Records';
import { AssignmentCreated } from '../components/AssignmentCreated';
import { AssignmentBreakdown } from '../components/AssignmentBreakdown';
import { Editor } from '../components/Editor';

const directory = mkdtempSync(join(tmpdir(), 'Student V221 UI '));
process.env.DATABASE_URL = 'file:' + join(directory, 'student.db');
const sqlite = new DatabaseSync(join(directory, 'student.db'));
for (const path of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', path, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { saveRow, snapshot, deleteRow, cleanInput } = await import('../lib/service');
const { todoAction } = await import('../lib/todos');
const { convertTodoToTask, saveAssignmentBreakdown } = await import('../lib/task-workflows');
const { productivityAction, productivitySnapshot } = await import('../lib/productivity');
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLDialogElement',
  'sessionStorage',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name],
  });
}
// jsdom does not implement native modal top-layer layout; only model its open state here.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root')!);
let data: Data, subject: RecordRow, assignment: RecordRow;
let node: React.ReactNode,
  failTaskSave = false,
  failTodoSave = false,
  navigated = '',
  fullEditor: any = null;
let confirmAnswer = true,
  taskWrites = 0;
let operations = 0;
async function settle() {
  for (let i = 0; i < 1000; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if (!operations) return;
  }
  throw Error('UI mutation did not settle');
}
const oldFetch = globalThis.fetch,
  oldConfirm = (globalThis as any).confirm;
(globalThis as any).confirm = () => confirmAnswer;
function tree() {
  return React.createElement(
    AppContext.Provider,
    {
      value: {
        data,
        allData: data,
        now: '2026-10-11T09:00',
        open(e: any) {
          fullEditor = e;
        },
        go(url: string) {
          navigated = url;
        },
        notify() {},
        reload,
        save: async (entity: any, values: any, old?: RecordRow, requestId?: string) => {
          operations++;
          try {
            if (failTaskSave) throw Error('Simulated connection failure');
            const row = await saveRow(
              entity,
              cleanInput(entity, values),
              old?.id,
              old?.revision,
              requestId,
            );
            taskWrites++;
            await reload();
            return row;
          } finally {
            operations--;
          }
        },
        remove: async (entity: any, row: RecordRow) => {
          await deleteRow(entity, row.id, row.revision);
          await reload();
        },
      },
    },
    node,
  );
}
async function reload() {
  operations++;
  try {
    data = await snapshot();
    data.productivity = await productivitySnapshot('owner');
    root.render(tree());
  } finally {
    operations--;
  }
}
async function mount(element: React.ReactNode) {
  node = element;
  await act(async () => {
    await reload();
  });
}
function q<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  assert.ok(element, 'Missing ' + selector);
  return element;
}
function button(text: string, within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === text,
  );
  assert.ok(found, 'Missing button ' + text);
  return found;
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await settle();
  });
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
async function key(element: HTMLElement, key: string) {
  await act(async () => {
    element.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}
async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
    await settle();
  });
}
async function toggle(details: HTMLDetailsElement, open: boolean) {
  await act(async () => {
    details.open = open;
    details.dispatchEvent(new dom.window.Event('toggle'));
  });
}
async function fresh() {
  await act(async () => root.render(null));
  confirmAnswer = true;
  failTaskSave = false;
  failTodoSave = false;
  fullEditor = null;
  navigated = '';
  node = null;
  await db.task.deleteMany();
  await db.todoItem.deleteMany();
}
const task = (name: string, values: any = {}) =>
  saveRow('task', {
    ...defaults('task'),
    name,
    subjectId: subject.id,
    assignmentId: assignment.id,
    ...values,
  });
const todo = (name: string) =>
  todoAction('owner', {
    action: 'todo.create',
    requestId: randomUUID(),
    todo: { name, dueDate: null },
  });
globalThis.fetch = async (url: any, init: any) => {
  operations++;
  try {
    const b = JSON.parse(init.body);
    if (String(url) === '/api/productivity') {
      if (failTodoSave) throw Error('Simulated To-do failure');
      if (b.action.startsWith('todo.')) await todoAction('owner', b);
      else await productivityAction('owner', b);
    } else if (String(url) === '/api/task-workflows') {
      const { action, ...payload } = b;
      if (action === 'todo.convert') await convertTodoToTask('owner', payload);
      else await saveAssignmentBreakdown(payload);
    } else throw Error('Unexpected request');
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.status ?? 400,
      headers: { 'content-type': 'application/json' },
    });
  } finally {
    operations--;
  }
};
test.before(async () => {
  await db.user.create({ data: { id: 'owner', passwordHash: 'fixture-only' } });
  const semester = await saveRow('semester', {
    ...defaults('semester'),
    name: 'QUT Y1S2',
    startDate: '2026-07-20',
    teachingStart: '2026-07-20',
    endDate: '2026-11-20',
  });
  subject = await saveRow('subject', {
    ...defaults('subject'),
    name: 'Programming',
    code: 'IFB220',
    semesterId: semester.id,
  });
  assignment = await saveRow('assignment', {
    ...defaults('assignment'),
    name: 'Real assignment name',
    subjectId: subject.id,
    dueAt: '2026-10-16T17:00',
    estimatedHours: 10,
    progress: 60,
  });
});
test.after(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  globalThis.fetch = oldFetch;
  (globalThis as any).confirm = oldConfirm;
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as any)[name];
  }
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

test('Tasks-first workspace uses All, scoped data, six-row expansion, search, filters and collapsed completed/recurring sections', async () => {
  await fresh();
  for (let i = 0; i < 9; i++)
    await task('Academic ' + i, { dueAt: `2026-10-${String(11 + i).padStart(2, '0')}T17:00` });
  await task('Completed academic', { status: 'Completed' });
  for (let i = 0; i < 8; i++) await todo('Quick ' + i);
  await mount(React.createElement(Tasks));
  const panels = [...document.querySelectorAll('.workspace-panel')];
  assert.ok(panels[0].classList.contains('academic-tasks'));
  assert.ok(panels[1].classList.contains('quick-todos'));
  assert.equal(q<HTMLSelectElement>('[aria-label="Task view"]').value, 'All');
  assert.equal(document.querySelectorAll('.academic-tasks .workspace-task-row').length, 6);
  assert.equal(document.querySelectorAll('.quick-todos .todo-items>li').length, 6);
  assert.equal(q<HTMLDetailsElement>('.workspace-recurring').open, false);
  assert.equal(q<HTMLDetailsElement>('.academic-tasks .workspace-completed').open, false);
  assert.ok(document.querySelector('.recurring-section') === null, 'Expected closed editor/menu');
  await click(button('Show more tasks'));
  assert.equal(document.querySelectorAll('.academic-tasks .workspace-task-row').length, 9);
  await click(button('Show less tasks'));
  assert.equal(document.querySelectorAll('.academic-tasks .workspace-task-row').length, 6);
  await click(button('Show more to-dos'));
  assert.equal(document.querySelectorAll('.quick-todos .todo-items>li').length, 8);
  await click(button('Show less to-dos'));
  assert.equal(document.querySelectorAll('.quick-todos .todo-items>li').length, 6);
  await input(q('[aria-label="Filter tasks"]'), 'Academic 8');
  assert.equal(document.querySelectorAll('.academic-tasks .workspace-task-row').length, 1);
  assert.equal(q<HTMLSelectElement>('[aria-label="Task view"]').value, 'All');
  await input(q('[aria-label="Filter tasks"]'), '');
  await select(q('[aria-label="Task view"]'), 'Today');
  assert.equal(document.querySelectorAll('.academic-tasks .workspace-task-row').length, 1);
  await select(q('[aria-label="Task view"]'), 'Completed');
  assert.match(q('.academic-tasks').textContent!, /Completed academic/);
  assert.ok(
    document.querySelector('.academic-tasks .workspace-completed') === null,
    'Expected closed editor/menu',
  );
  await select(q('[aria-label="Task view"]'), 'All');
  await toggle(q('.academic-tasks .workspace-completed'), true);
  assert.match(q('.academic-tasks .workspace-completed').textContent!, /Completed academic/);
  await toggle(q('.workspace-recurring'), true);
  assert.match(
    q('.workspace-recurring').textContent!,
    /Your recurring series|No recurring tasks yet/,
  );
  await toggle(q('.workspace-recurring'), false);
  assert.equal(await db.task.count(), 10);
  assert.equal(await db.todoItem.count(), 8);
  // A selected semester supplies scoped Tasks to the same All predicate, never allData.task.
  await act(async () => {
    data = { ...data, task: data.task.filter((t) => t.name === 'Academic 8') };
    root.render(tree());
  });
  assert.equal(document.querySelectorAll('.academic-tasks .workspace-task-row').length, 1);
});

test('inline Task editor cancels/Escapes, saves existing fields, retains failed drafts and rejects stale revisions', async () => {
  await fresh();
  const original = await task('Edit academic', {
    estimatedHours: 2,
    notes: 'Keep notes',
    actualHours: 0.5,
    dueAt: '2026-10-11T13:30',
  });
  await task('Other academic');
  await todo('Edit checklist');
  await mount(React.createElement(Tasks));
  await click(q('[aria-label="Edit Edit academic"]'));
  const form = q<HTMLFormElement>('.task-quick-editor');
  assert.ok(form.closest('.workspace-task-row'));
  assert.equal(document.querySelectorAll('.quick-editor').length, 1);
  await input(form.querySelector('input')!, 'Cancelled title');
  await key(form, 'Escape');
  assert.ok(document.querySelector('.quick-editor') === null, 'Expected closed editor/menu');
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: original.id } })).name,
    'Edit academic',
  );
  assert.ok(
    document.activeElement === q('[aria-label="Edit Edit academic"]'),
    'Escape returns focus to Edit',
  );
  await click(q('[aria-label="Edit Edit academic"]'));
  await input(q<HTMLFormElement>('.task-quick-editor').querySelector('input')!, 'Unsaved title');
  confirmAnswer = false;
  await click(q('[aria-label="Edit Other academic"]'));
  assert.match(q('.task-quick-editor').getAttribute('aria-label')!, /Edit academic/);
  confirmAnswer = true;
  await click(q('[aria-label="Edit Other academic"]'));
  assert.equal(document.querySelectorAll('.quick-editor').length, 1);
  assert.match(q('.task-quick-editor').getAttribute('aria-label')!, /Other/);
  await click(q('[aria-label="Edit to-do Edit checklist"]'));
  assert.equal(document.querySelectorAll('.quick-editor').length, 1);
  assert.ok(document.querySelector('.task-quick-editor') === null, 'Expected closed editor/menu');
  await click(button('Cancel', q('.todo-edit')));
  await click(q('[aria-label="Edit Edit academic"]'));
  let editor = q<HTMLFormElement>('.task-quick-editor');
  await input(editor.querySelector('input')!, 'Updated academic');
  failTaskSave = true;
  await submit(editor);
  assert.equal(editor.querySelector<HTMLInputElement>('input')!.value, 'Updated academic');
  assert.match(editor.textContent!, /Simulated connection failure/);
  failTaskSave = false;
  const inputs = [...editor.querySelectorAll<HTMLInputElement>('input')];
  await input(inputs[1], '2026-10-14');
  await input(inputs[2], '14:45');
  await input(inputs[3], '3');
  await input(inputs[4], '30');
  await select(editor.querySelectorAll('select')[0], 'High');
  await submit(editor);
  assert.ok(document.querySelector('.quick-editor') === null, 'Expected closed editor/menu');
  let saved = await db.task.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(saved.name, 'Updated academic');
  assert.ok(
    document.activeElement === q('[aria-label="Edit Updated academic"]'),
    'Successful save returns focus',
  );
  assert.equal(saved.estimatedHours, 3.5);
  assert.equal(saved.dueAt, '2026-10-14T14:45');
  assert.equal(saved.priority, 'High');
  assert.equal(saved.notes, 'Keep notes');
  assert.equal(saved.actualHours, 0.5);
  assert.equal(saved.assignmentId, assignment.id);
  await click(q('[aria-label="Edit Updated academic"]'));
  editor = q('.task-quick-editor');
  await input(editor.querySelector('input')!, 'Keep stale draft');
  await saveRow(
    'task',
    { ...taskQuickValues(saved, taskQuickDraft(saved)), priority: 'Critical' },
    saved.id,
    saved.revision,
  );
  await submit(editor);
  assert.match(editor.textContent!, /changed on another device/);
  assert.equal(editor.querySelector<HTMLInputElement>('input')!.value, 'Keep stale draft');
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: saved.id } })).priority, 'Critical');
  await click(button('Cancel', editor));
});

test('quick Task completion/reopen unlocks controls, updates weighted progress without duplicate records and keeps advanced actions', async () => {
  await fresh();
  const a = await task('Weighted task', { estimatedHours: 2 }),
    b = await task('Remaining task', { estimatedHours: 8 });
  await mount(React.createElement(Tasks));
  const count = await db.task.count();
  failTaskSave = true;
  await click(q('[aria-label="Complete Weighted task"]'));
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: a.id } })).status, 'Not Started');
  assert.equal(q<HTMLInputElement>('[aria-label="Complete Weighted task"]').disabled, false);
  failTaskSave = false;
  await click(q('[aria-label="Complete Weighted task"]'));
  assert.equal(assignmentProgress(assignment, await snapshot()), 20);
  assert.equal(q<HTMLButtonElement>('[aria-label="Edit Remaining task"]').disabled, false);
  await toggle(q('.academic-tasks .workspace-completed'), true);
  await click(q('[aria-label="Reopen Weighted task"]'));
  assert.equal(assignmentProgress(assignment, await snapshot()), 0);
  assert.equal(await db.task.count(), count);
  await click(q('[aria-label="More actions for Weighted task"]'));
  assert.equal(q('[role="menu"]').querySelectorAll('button').length, 3);
  assert.ok(document.activeElement === button('Start Focus'), 'Menu keyboard focus: Start Focus');
  await key(q('[role="menu"]'), 'End');
  assert.ok(document.activeElement === button('Delete task'), 'Menu keyboard focus: Delete task');
  await key(q('[role="menu"]'), 'Home');
  assert.ok(document.activeElement === button('Start Focus'), 'Menu keyboard focus: Start Focus');
  await key(q('[role="menu"]'), 'Escape');
  assert.ok(document.querySelector('[role="menu"]') === null, 'Expected closed editor/menu');
  await click(q('[aria-label="More actions for Weighted task"]'));
  await click(button('More details'));
  assert.equal(fullEditor.entity, 'task');
  assert.equal(fullEditor.row.id, a.id);
  await click(q('[aria-label="More actions for Weighted task"]'));
  confirmAnswer = false;
  await click(button('Delete task'));
  assert.ok(await db.task.findUnique({ where: { id: a.id } }));
  confirmAnswer = true;
  await click(q('[aria-label="More actions for Weighted task"]'));
  await click(button('Start Focus'));
  assert.equal(navigated, '/focus');
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: a.id } })).status, 'Not Started');
  assert.equal(await db.studySession.count(), 0);
  await productivityAction('owner', {
    action: 'timer.finish',
    id: (await productivitySnapshot('owner')).timer!.id,
    revision: (await productivitySnapshot('owner')).timer!.revision,
  });
  await productivityAction('owner', {
    action: 'timer.cancel',
    id: (await productivitySnapshot('owner')).timer!.id,
    revision: (await productivitySnapshot('owner')).timer!.revision,
  });
});

test('quick To-do edits, errors, checkbox completion, show-more editing, menus, ordering and atomic conversion preserve records', async () => {
  await fresh();
  for (let i = 0; i < 8; i++) await todo('Checklist ' + i);
  await mount(React.createElement(Tasks));
  await click(button('Show more to-dos'));
  await click(q('[aria-label="Edit to-do Checklist 7"]'));
  let form = q<HTMLFormElement>('.todo-edit');
  await input(form.querySelector('input')!, 'Last edited');
  failTodoSave = true;
  await submit(form);
  assert.equal(form.querySelector<HTMLInputElement>('input')!.value, 'Last edited');
  assert.match(q('.quick-todos').textContent!, /Simulated To-do failure/);
  failTodoSave = false;
  await input(form.querySelectorAll('input')[1], '2026-10-15');
  await submit(form);
  assert.ok(document.querySelector('.todo-edit') === null, 'Expected closed editor/menu');
  assert.equal(
    (await db.todoItem.findFirstOrThrow({ where: { name: 'Last edited' } })).dueDate,
    '2026-10-15',
  );
  await click(q('[aria-label="Complete Last edited"]'));
  await toggle(q('.quick-todos .workspace-completed'), true);
  await click(q('[aria-label="Reopen Last edited"]'));
  assert.equal(
    (await db.todoItem.findFirstOrThrow({ where: { name: 'Last edited' } })).completed,
    false,
  );
  await click(q('[aria-label="More actions for Checklist 0"]'));
  assert.equal(button('Move up').disabled, true);
  await click(button('Move down'));
  assert.equal(
    (await db.todoItem.findFirstOrThrow({ where: { name: 'Checklist 0' } })).position,
    1,
  );
  await click(q('[aria-label="More actions for Last edited"]'));
  confirmAnswer = false;
  await click(button('Delete to-do'));
  assert.ok(await db.todoItem.findFirst({ where: { name: 'Last edited' } }));
  confirmAnswer = true;
  await click(q('[aria-label="More actions for Last edited"]'));
  await click(button('Convert to Task'));
  const modal = q<HTMLFormElement>('[aria-label="Convert to Task"] form');
  await select(modal.querySelectorAll('select')[1], assignment.id);
  await submit(modal);
  assert.equal(await db.todoItem.count({ where: { name: 'Last edited' } }), 0);
  assert.equal(
    await db.task.count({ where: { name: 'Last edited', assignmentId: assignment.id } }),
    1,
  );
  await click(q('[aria-label="Edit to-do Checklist 1"]'));
  form = q('.todo-edit');
  await input(form.querySelector('input')!, 'Discarded');
  await key(form, 'Escape');
  assert.ok(document.querySelector('.todo-edit') === null, 'Expected closed editor/menu');
  assert.ok(await db.todoItem.findFirst({ where: { name: 'Checklist 1' } }));
  const add = q<HTMLFormElement>('.todo-add');
  await input(add.querySelector('input')!, 'Keyboard quick add');
  await submit(add);
  assert.equal(await db.todoItem.count({ where: { name: 'Keyboard quick add' } }), 1);
});

test('assignment dialogs show actual name, preserve skip/cancel and save selected reordered template drafts once', async () => {
  await fresh();
  let skipped = false,
    requested = false;
  await mount(
    React.createElement(AssignmentCreated, {
      assignment,
      close() {
        skipped = true;
      },
      breakdown() {
        requested = true;
      },
    }),
  );
  assert.equal(q<HTMLDialogElement>('dialog').open, true);
  assert.match(q('.assignment-dialog-name').textContent!, /Assignment: Real assignment name/);
  await click(button('Maybe later'));
  assert.equal(skipped, true);
  await click(button('Break into tasks'));
  assert.equal(requested, true);
  assert.ok(await db.assignment.findUnique({ where: { id: assignment.id } }));
  let closed = false;
  await mount(
    React.createElement(AssignmentBreakdown, {
      assignment,
      close() {
        closed = true;
      },
    }),
  );
  assert.equal(q<HTMLButtonElement>('.assignment-dialog-footer .primary').disabled, true);
  await click(button('Add manual task'));
  let title = q<HTMLInputElement>('.breakdown-row input:not([type="checkbox"])');
  await input(title, '  ');
  assert.equal(q<HTMLButtonElement>('.assignment-dialog-footer .primary').disabled, true);
  await click(button('Load suggestions'));
  assert.equal(document.querySelectorAll('.breakdown-row').length, 5);
  await click(q('[aria-label="Move task 1 down"]'));
  await click(q<HTMLInputElement>('.breakdown-row input[type="checkbox"]'));
  await click(q('[aria-label="Remove unsaved task 5"]'));
  assert.equal(document.querySelectorAll('.breakdown-row').length, 4);
  assert.equal(q<HTMLButtonElement>('.assignment-dialog-footer .primary').disabled, false);
  assert.ok(q('.assignment-dialog-footer').parentElement === q('dialog form'));
  const count = await db.task.count();
  await submit(q('dialog form'));
  assert.equal(await db.task.count(), count + 3);
  assert.equal(closed, true);
  assert.equal(navigated, '/assignments/' + assignment.id);
  assert.ok(await db.assignment.findUnique({ where: { id: assignment.id } }));
  await act(async () => root.render(null));
  await mount(
    React.createElement(AssignmentBreakdown, {
      assignment,
      close() {
        closed = true;
      },
    }),
  );
  closed = false;
  await click(button('Cancel'));
  assert.equal(closed, true);
  assert.ok(await db.assignment.findUnique({ where: { id: assignment.id } }));
});

test('quick duration and shared validation reject invalid inputs while preserving untouched precision and relationship fields', () => {
  const row = {
    id: 'fixture',
    ...defaults('task'),
    name: 'Test',
    estimatedHours: 0.999999999999,
    notes: 'Keep',
  };
  const draft = taskQuickDraft(row);
  assert.equal(draft.minutes, '0');
  assert.equal(taskQuickValues(row, draft).estimatedHours, row.estimatedHours);
  for (const patch of [
    { name: ' ' },
    { dueDate: '2026-02-30' },
    { priority: 'Bogus' },
    { status: 'Bogus' },
    { durationChanged: true, hours: '-1' },
    { durationChanged: true, minutes: '60' },
    { durationChanged: true, hours: '10000', minutes: '1' },
  ])
    assert.throws(() => taskQuickValues(row, { ...draft, ...patch }));
  const values = taskQuickValues(row, {
    ...draft,
    hours: '2',
    minutes: '30',
    durationChanged: true,
  });
  assert.equal(values.estimatedHours, 2.5);
  assert.equal(values.notes, 'Keep');
  assert.equal(row.estimatedHours, 0.999999999999);
  const suggestion = {
    key: 'draft',
    selected: true,
    name: 'Step',
    notes: '',
    dueAt: '',
    estimatedHours: '',
    priority: 'Medium',
    status: 'Not Started',
  } satisfies BreakdownDraft;
  assert.equal(breakdownDraftValid([]), false);
  assert.equal(breakdownDraftValid([{ ...suggestion, name: ' ' }]), false);
  assert.equal(breakdownDraftValid([{ ...suggestion, dueAt: 'bad' }]), false);
  assert.equal(
    breakdownDraftValid([suggestion, { ...suggestion, selected: false, name: '', dueAt: 'bad' }]),
    true,
  );
});

test('existing date filters, search and non-destructive list partitions retain all semantics', () => {
  const rows = [
    { id: 'old', name: 'Research', dueAt: '2026-10-10T17:00', status: 'Not Started' },
    { id: 'today', name: 'Write', dueAt: '2026-10-11T17:00', status: 'Not Started' },
    { id: 'tomorrow', name: 'Review', dueAt: '2026-10-12T17:00', status: 'Not Started' },
    { id: 'done', name: 'Done', dueAt: null, status: 'Completed' },
    { id: 'undated', name: 'Undated', dueAt: null, status: 'Not Started' },
  ];
  assert.equal(filterTaskRows(rows, 'All', '', '2026-10-11T09:00').length, 5);
  assert.deepEqual(
    filterTaskRows(rows, 'Today', '', '2026-10-11T09:00').map((t) => t.id),
    ['today'],
  );
  assert.deepEqual(
    filterTaskRows(rows, 'Tomorrow', '', '2026-10-11T09:00').map((t) => t.id),
    ['tomorrow'],
  );
  assert.deepEqual(
    filterTaskRows(rows, 'Overdue', '', '2026-10-11T09:00').map((t) => t.id),
    ['old'],
  );
  assert.equal(filterTaskRows(rows, 'Upcoming', '', '2026-10-11T09:00').length, 2);
  assert.equal(filterTaskRows(rows, 'All', 'RESEARCH', '2026-10-11T09:00').length, 1);
  assert.equal(filterTaskRows(rows, 'This Week', '', '2026-10-11T09:00').length, 1);
  assert.deepEqual(
    taskLists(rows, 'All').completed.map((t) => t.id),
    ['done'],
  );
  assert.equal(taskLists(rows, 'All').primary.length, 4);
  assert.equal(taskLists([rows[3]], 'Completed').primary.length, 1);
  assert.equal(taskLists(rows, 'Today').completed.length, 0);
  assert.equal(rows.length, 5);
  assert.ok(taskViews.includes('By Subject'));
  assert.ok(taskViews.includes('By Assignment'));
  let state = quickEditReducer({ active: null, busy: false }, { type: 'begin', id: 'task:a' });
  state = quickEditReducer(state, { type: 'begin', id: 'todo:b' });
  assert.equal(state.active, 'todo:b');
  state = quickEditReducer(state, { type: 'busy', busy: true });
  assert.equal(quickEditReducer(state, { type: 'close' }).active, 'todo:b');
  let closed = false;
  cancelQuickEditKey({ key: 'Escape', preventDefault() {}, stopPropagation() {} }, false, () => {
    closed = true;
  });
  assert.equal(closed, true);
});

test('To-do quick edits retain a stale draft, validate without mutation and preserve their own checkbox revision', async () => {
  await fresh();
  const item = await todo('Original note');
  assert.ok(item);
  await mount(React.createElement(Tasks));
  await click(q('[aria-label="Edit to-do Original note"]'));
  let form = q<HTMLFormElement>('.todo-edit');
  await input(form.querySelector('input')!, 'Local draft');
  await todoAction('owner', {
    action: 'todo.save',
    id: item.id,
    revision: item.revision,
    todo: { name: 'Remote note', dueDate: null },
  });
  await submit(form);
  assert.equal(form.querySelector<HTMLInputElement>('input')!.value, 'Local draft');
  assert.match(q('.quick-todos').textContent!, /changed or was deleted/);
  assert.equal(
    (await db.todoItem.findUniqueOrThrow({ where: { id: item.id } })).name,
    'Remote note',
  );
  await click(button('Cancel', form));
  await click(q('[aria-label="Edit to-do Remote note"]'));
  form = q('.todo-edit');
  await input(form.querySelector('input')!, 'Saved with completion');
  await click(q('[aria-label="Complete Remote note"]'));
  form = q('.todo-edit');
  assert.equal(form.querySelector<HTMLInputElement>('input')!.value, 'Saved with completion');
  await submit(form);
  const saved = await db.todoItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(saved.name, 'Saved with completion');
  assert.equal(saved.completed, true);
  assert.equal(saved.position, item.position);
  await assert.rejects(
    todoAction('owner', {
      action: 'todo.save',
      id: saved.id,
      revision: saved.revision,
      todo: { name: 'Invalid date', dueDate: '2026-02-30' },
    }),
  );
  assert.equal(
    (await db.todoItem.findUniqueOrThrow({ where: { id: item.id } })).name,
    'Saved with completion',
  );
});

test('actual assignment creation transitions to the optional prompt only after save, and both choices keep the record', async () => {
  await fresh();
  let closed = false;
  const before = await db.assignment.count();
  const element = () =>
    React.createElement(Editor, {
      editor: {
        entity: 'assignment',
        prefill: { name: 'Created through form', subjectId: subject.id, dueAt: '2026-10-16T17:00' },
      },
      close() {
        closed = true;
      },
    });
  await mount(element());
  await submit(q('dialog form'));
  assert.equal(await db.assignment.count(), before + 1);
  assert.equal(await db.task.count(), 0);
  assert.match(q('.assignment-dialog-name').textContent!, /Assignment: Created through form/);
  await click(button('Maybe later'));
  assert.equal(closed, true);
  assert.ok(await db.assignment.findFirst({ where: { name: 'Created through form' } }));
  await act(async () => root.render(null));
  await mount(element());
  await submit(q('dialog form'));
  await click(button('Break into tasks'));
  assert.ok(q('.breakdown-editor'));
  assert.match(q('.breakdown-editor .assignment-dialog-name').textContent!, /Created through form/);
  await click(button('Cancel'));
  assert.equal(await db.assignment.count(), before + 2);
  assert.equal(await db.task.count(), 0);
});
