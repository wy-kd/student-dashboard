import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { todoRequestId } from '../lib/todo-request-id';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppContext } from '../components/context';
import { DateTimeInput } from '../components/DateTimeInput';
import { Calendar } from '../components/Planning';
import { SemesterWeek } from '../components/SemesterWeek';
import { TodoList } from '../components/TodoList';
import { Tasks } from '../components/Records';
import { MiniTimer, requestTimerCancellation } from '../components/StudyTimer';
import { entities, type Data, type RecordRow } from '../lib/model';
import { defaultLayout, readLayout, layoutSchema } from '../lib/dashboard-layout';

const semester = {
  id: 's',
  name: 'QUT Y1S2',
  startDate: '2026-09-01',
  teachingStart: '2026-09-07',
  endDate: '2026-10-31',
  teachingWeeks: 2,
} as RecordRow;
function data(): Data {
  return {
    ...(Object.fromEntries(entities.map((key) => [key, [] as RecordRow[]])) as Pick<
      Data,
      (typeof entities)[number]
    >),
    semester: [semester],
    setting: {
      name: 'Student',
      timezone: 'Australia/Brisbane',
      dailyHours: 3,
      activeSemesterId: 's',
    },
    importantDate: [
      {
        id: 'break',
        name: 'Break',
        kind: 'Break',
        semesterId: 's',
        dueAt: '2026-09-14T00:00',
        endDate: '2026-09-20',
      },
    ],
    productivity: { todos: [], recurrences: [], timer: null },
  };
}
function render(node: React.ReactNode, d = data()) {
  return renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      {
        value: {
          data: d,
          allData: d,
          now: '2026-09-08T09:00',
          go() {},
          open() {},
          notify() {},
          reload: async () => {},
        } as any,
      },
      node,
    ),
  );
}
test('native date/time controls contain one input without a second visible date in forms', () => {
  for (const [type, value] of [
    ['date', '2026-09-08'],
    ['datetime-local', '2026-09-08T17:00'],
    ['time', '17:00'],
  ]) {
    const html = render(React.createElement(DateTimeInput, { type, value, readOnly: true }));
    assert.equal((html.match(/<input /g) ?? []).length, 1);
    assert.match(html, /lang="en-AU"/);
    assert.doesNotMatch(html, /<small|<span|08\/09\/2026/);
  }
});
test('timetable renders one full date per weekday header and retains today and navigation controls', () => {
  const html = render(React.createElement(Calendar, { timetable: true }));
  const dates = [...html.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(dates, [
    '07/09/2026',
    '08/09/2026',
    '09/09/2026',
    '10/09/2026',
    '11/09/2026',
    '12/09/2026',
    '13/09/2026',
  ]);
  assert.equal((html.match(/class="calendar-day is-today/g) ?? []).length, 1);
  assert.match(html, /aria-label="Previous period"/);
  assert.match(html, /aria-label="Next period"/);
  assert.match(html, /aria-label="Go to date" type="date"/);
  assert.doesNotMatch(html, /date-input|<small[^>]*>08\/09\/2026/);
});
test('semester identity and teaching state share a bold summary in every state', () => {
  for (const [now, expected] of [
    ['2026-09-02', 'Semester starts in 5 days'],
    ['2026-09-08', 'Week 1 of 2'],
    ['2026-09-15', 'Semester Break'],
    ['2026-10-01', 'Teaching complete'],
  ]) {
    const html = render(React.createElement(SemesterWeek, { semester, now, data: data() }));
    assert.ok(
      html.includes(
        '<strong class="semester-summary"><span>QUT Y1S2</span><span aria-hidden="true">|</span><span>' +
          expected +
          '</span></strong>',
      ),
    );
    if (expected === 'Semester Break') assert.match(html, /Teaching Week 2 resumes 21\/09\/2026/);
  }
});
test('to-do preview shows five pending checkboxes, quick add and view all; Tasks retains full academic controls', () => {
  const d = data();
  d.productivity.todos = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    name: 'Reminder ' + i,
    completed: i === 0,
    dueDate: i === 1 ? '2026-09-09' : null,
    position: i,
    revision: 0,
  }));
  const html = render(React.createElement(TodoList, { compact: true }), d);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /Reminder 0|Reminder 6|Edit to-do/);
  assert.match(html, /Due 09\/09\/2026/);
  assert.match(html, /aria-label="New to-do"/);
  assert.match(html, /View all to-dos/);
  const page = render(React.createElement(Tasks), d);
  assert.match(page, /id="todo-list"/);
  assert.match(page, /Edit to-do Reminder 0/);
  assert.match(page, /aria-label="Task view"/);
  assert.match(page, /Your recurring series/);
});
test('saved dashboard layouts gain only missing hidden widgets and keep existing customisations', () => {
  const old = defaultLayout();
  for (const bp of ['desktop', 'tablet', 'mobile'] as const)
    old[bp] = old[bp].filter((w) => w.id !== 'todo');
  old.desktop[0] = { ...old.desktop[0], width: 9, height: 3, hidden: false };
  old.desktop.reverse();
  const extended = readLayout(JSON.stringify(old));
  assert.deepEqual(extended.desktop.slice(0, -1), old.desktop);
  assert.equal(extended.desktop.at(-1)?.id, 'todo');
  assert.equal(extended.desktop.at(-1)?.hidden, true);
  assert.deepEqual(readLayout(JSON.stringify(extended)), extended);
  assert.doesNotThrow(() => layoutSchema.parse(extended));
});
test('floating Cancel requires confirmation while End retains review', async () => {
  let calls = 0,
    message = '';
  const discard = async () => {
    calls++;
  };
  await requestTimerCancellation(discard, (text) => {
    message = text;
    return false;
  });
  assert.equal(calls, 0);
  assert.match(message, /Elapsed time will not be saved/);
  await requestTimerCancellation(discard, () => true);
  assert.equal(calls, 1);
  const d = data();
  d.productivity.timer = {
    id: 't',
    revision: 0,
    name: 'Reading',
    mode: 'stopwatch',
    status: 'running',
    phase: 'focus',
    startedAt: Date.now(),
    segmentAt: Date.now(),
    elapsedMs: 0,
    focusMs: 0,
    focusMinutes: 50,
    breakMinutes: 10,
    rounds: 1,
    round: 1,
  };
  const html = render(React.createElement(MiniTimer), d);
  assert.match(html, />Pause</);
  assert.match(html, />End</);
  assert.match(html, />Cancel timer</);
});
test('additive to-do migration preserves the existing database rows and credentials', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const paths = readdirSync('prisma/migrations')
      .filter((p) => /^\d/.test(p))
      .sort();
    for (const path of paths.slice(0, -1))
      db.exec(readFileSync('prisma/migrations/' + path + '/migration.sql', 'utf8'));
    db.exec(
      "INSERT INTO User (id,passwordHash) VALUES ('owner','fixture-hash'); INSERT INTO Session (id,userId,expiresAt) VALUES ('session','owner',9999999999999); INSERT INTO Task (id,name) VALUES ('task','Existing real-style academic task');",
    );
    const before = ['User', 'Session', 'Task'].map((table) =>
      db.prepare('SELECT * FROM ' + table).all(),
    );
    db.exec(readFileSync('prisma/migrations/' + paths.at(-1) + '/migration.sql', 'utf8'));
    assert.deepEqual(
      ['User', 'Session', 'Task'].map((table) => db.prepare('SELECT * FROM ' + table).all()),
      before,
    );
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM TodoItem').get() as any).n, 0);
  } finally {
    db.close();
  }
});

test('quick-add request IDs work without the secure-context randomUUID API', () => {
  const source = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const id = todoRequestId(source);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(todoRequestId(source), id);
});
