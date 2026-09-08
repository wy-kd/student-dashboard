import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatTimestamp,
  formatReminderMessage,
} from '../lib/format';
import { teachingWeekInfo, teachingResumeLabel } from '../lib/teaching-weeks';
import { calendarEvents, semesterProgress } from '../lib/calculations';
import { defaultLayout, moveWidget, layoutSchema } from '../lib/dashboard-layout';
import { DateTimeInput } from '../components/DateTimeInput';
import { SemesterBreaks } from '../components/SemesterBreaks';
import { AppContext } from '../components/context';
import { entities, type Data, type RecordRow } from '../lib/model';
const semester = {
  id: 's',
  name: 'Semester',
  startDate: '2026-09-01',
  teachingStart: '2026-09-07',
  endDate: '2026-11-01',
  teachingWeeks: 4,
} as RecordRow;
const breaks = [
  {
    id: 'b1',
    semesterId: 's',
    kind: 'Break',
    name: 'Mid-semester',
    dueAt: '2026-09-14T00:00',
    endDate: '2026-09-20',
  },
  {
    id: 'b2',
    semesterId: 's',
    kind: 'Break',
    name: 'Second break',
    dueAt: '2026-09-28T00:00',
    endDate: '2026-10-04',
  },
];
function data(): Data {
  return {
    ...(Object.fromEntries(entities.map((e) => [e, [] as RecordRow[]])) as Pick<
      Data,
      (typeof entities)[number]
    >),
    setting: {
      name: 'Student',
      timezone: 'Australia/Brisbane',
      dailyHours: 3,
      activeSemesterId: 's',
    },
    semester: [semester],
    importantDate: breaks,
  };
}
test('Australian display is unambiguous, padded and handles midnight/noon without shifting civil dates', () => {
  assert.equal(formatDate('2026-09-08'), '08/09/2026');
  assert.equal(formatDate('2026-07-09T23:45'), '09/07/2026');
  assert.equal(formatDate('09/07/2026'), '—', 'never parse ambiguous display dates');
  assert.equal(formatDate('2026-02-30'), '—');
  for (const [input, output] of [
    ['00:00', '12:00 AM'],
    ['12:00', '12:00 PM'],
    ['09:00', '9:00 AM'],
    ['17:00', '5:00 PM'],
    ['23:45', '11:45 PM'],
  ])
    assert.equal(formatTime(input), output);
  assert.equal(formatDateTime('2026-09-08T17:00'), '08/09/2026 · 5:00 PM');
  assert.equal(
    formatTimestamp(Date.parse('2026-09-07T14:00:00Z'), 'Australia/Brisbane'),
    '08/09/2026 · 12:00 AM',
  );
  assert.equal(formatReminderMessage('Due 2026-09-08 · 17:00'), 'Due 08/09/2026 · 5:00 PM');
  assert.equal(formatReminderMessage('My notes include 2026-09-08'), 'My notes include 2026-09-08');
});
test('teaching weeks skip multiple inclusive breaks and handle before/after boundaries', () => {
  const d = data(),
    info = (day: string) => teachingWeekInfo(semester, day, d);
  assert.equal(info('2026-09-02').label, 'Semester starts in 5 days');
  assert.equal(info('2026-09-06').label, 'Semester starts in 1 day');
  assert.equal(info('2026-09-07').label, 'Week 1 of 4');
  assert.equal(info('2026-09-13').week, 1);
  for (const day of ['2026-09-14', '2026-09-20']) {
    assert.equal(info(day).state, 'break');
    assert.equal(info(day).week, 1);
    assert.equal(teachingResumeLabel(info(day)), 'Teaching Week 2 resumes 21/09/2026');
  }
  assert.equal(info('2026-09-21').label, 'Week 2 of 4');
  assert.equal(info('2026-09-28').resumeWeek, 3);
  assert.equal(info('2026-10-04').resumeDate, '2026-10-05');
  assert.equal(info('2026-10-05').week, 3);
  assert.equal(info('2026-10-18').week, 4);
  assert.equal(info('2026-10-19').label, 'Teaching complete');
  assert.equal(info('2026-12-01').week, 4);
  assert.equal(semesterProgress(semester, '2026-10-05', d).week, 3);
});
test('overlapping breaks skip a week once and partial breaks retain their teaching block', () => {
  const d = data();
  d.importantDate = [
    { ...breaks[0], endDate: '2026-09-17' },
    { ...breaks[0], id: 'overlap', dueAt: '2026-09-17T00:00' },
  ];
  assert.equal(teachingWeekInfo(semester, '2026-09-21', d).week, 2);
  d.importantDate = [{ ...breaks[0], dueAt: '2026-09-15T00:00', endDate: '2026-09-16' }];
  assert.equal(teachingWeekInfo(semester, '2026-09-15', d).resumeWeek, 2);
  assert.equal(teachingWeekInfo(semester, '2026-09-17', d).week, 2);
});
test('calendar suppresses classes at break boundaries, resumes without duplicates and retains manual records', () => {
  const d = data();
  d.subject = [{ id: 'subject', semesterId: 's' } as RecordRow];
  d.class = [1, 0].map(
    (day) =>
      ({
        id: 'class' + day,
        subjectId: 'subject',
        day,
        name: 'Lecture',
        kind: 'Lecture',
        startDate: '2026-09-01',
        endDate: '2026-11-01',
        startTime: '09:00',
        endTime: '10:00',
      }) as RecordRow,
  );
  for (const entity of ['studySession', 'assignment', 'exam', 'task'] as const)
    d[entity] = [{ id: entity, name: entity, dueAt: '2026-09-14T12:00' } as RecordRow];
  const before = JSON.stringify(d);
  const during = calendarEvents(d, '2026-09-14', '2026-09-20');
  assert.equal(during.filter((e) => e.entity === 'class').length, 0);
  for (const entity of ['studySession', 'assignment', 'exam', 'task'])
    assert.ok(during.some((e) => e.entity === entity));
  assert.equal(during.find((e) => e.id === 'b1')?.kind, 'Break');
  assert.equal(
    calendarEvents(d, '2026-09-13', '2026-09-13').filter((e) => e.entity === 'class').length,
    1,
  );
  assert.equal(
    calendarEvents(d, '2026-09-21', '2026-09-21').filter((e) => e.entity === 'class').length,
    1,
  );
  assert.equal(JSON.stringify(d), before, 'display must not mutate records or class series');
});
test('native entry keeps ISO values and exposes an Australian formatted accessible hint', () => {
  const html = renderToStaticMarkup(
    React.createElement(DateTimeInput, {
      type: 'datetime-local',
      value: '2026-09-08T17:00',
      readOnly: true,
    }),
  );
  assert.match(html, /type="datetime-local"/);
  assert.match(html, /value="2026-09-08T17:00"/);
  assert.match(html, /lang="en-AU"/);
  assert.match(html, /aria-describedby=/);
  assert.match(html, /08\/09\/2026 · 5:00 PM/);
});
test('semester manager reuses break records with formatted dates and separate edit/delete actions', () => {
  const d = data();
  const html = renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      { value: { allData: d } as any },
      React.createElement(SemesterBreaks, { semester }),
    ),
  );
  assert.match(html, /Semester breaks/);
  assert.match(html, /14\/09\/2026 – 20\/09\/2026/);
  assert.match(html, /Edit break Mid-semester/);
  assert.match(html, /Delete break Mid-semester/);
  assert.match(html, /Add semester break/);
});
test('dashboard layout still resizes, reorders, hides and retains independent device layouts', () => {
  const l = defaultLayout(),
    id = l.desktop[0].id;
  const changed = moveWidget(l, 'desktop', id, 1);
  changed.desktop[1] = { ...changed.desktop[1], width: 6, height: 3, hidden: true };
  const parsed = layoutSchema.parse(changed);
  assert.equal(parsed.desktop[1].id, id);
  assert.equal(parsed.desktop[1].width, 6);
  assert.equal(parsed.desktop[1].height, 3);
  assert.equal(parsed.desktop[1].hidden, true);
  assert.deepEqual(parsed.mobile, l.mobile);
});
test('ordinary input history is disabled without breaking password managers; End reuses the finish action', () => {
  const workspace = readFileSync('components/Workspace.tsx', 'utf8');
  assert.match(workspace, /autoComplete=\{auth.setup \? 'new-password' : 'current-password'\}/);
  for (const file of ['Editor', 'RecurringTasks', 'Inbox', 'Records'])
    assert.match(readFileSync('components/' + file + '.tsx', 'utf8'), /autoComplete="off"/);
  const mini = readFileSync('components/StudyTimer.tsx', 'utf8').split(
    'export function MiniTimer',
  )[1];
  assert.match(mini, /run\('timer.finish'\)/);
  assert.match(mini, />\s*End\s*<\/button>/);
  assert.match(mini, /action === 'timer.finish'\) go\('\/study'\)/);
});
