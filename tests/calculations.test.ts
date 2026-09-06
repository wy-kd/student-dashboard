import test from 'node:test';
import assert from 'node:assert/strict';
import { entities, type Data } from '../lib/model';
import {
  civilNow,
  countdown,
  assignmentProgress,
  examProgress,
  gradeSummary,
  priorities,
  health,
  workload,
  calendarEvents,
  semesterProgress,
} from '../lib/calculations';
import { schemaFor } from '../lib/validation';
const blank = () =>
  ({
    ...Object.fromEntries(entities.map((e) => [e, []])),
    setting: {
      name: 'Test',
      timezone: 'Australia/Brisbane',
      dailyHours: 2,
      activeSemesterId: null,
    },
  }) as Data;
test('Countdown uses calendar days, handles exact due time and Brisbane midnight', () => {
  assert.equal(
    civilNow('Australia/Brisbane', new Date('2026-09-06T14:00:00Z')),
    '2026-09-07T00:00',
  );
  assert.equal(countdown('2026-09-08T09:00', '2026-09-07T23:59'), 'Due tomorrow');
  assert.equal(countdown('2026-09-07T10:00', '2026-09-07T12:00'), 'Overdue today');
  assert.equal(countdown('2026-09-25T09:00', '2026-09-07T12:00', true), '18 days until exam');
  assert.equal(countdown('2026-09-07T12:00', '2026-09-07T12:00'), 'Due today');
});
test('Task estimates control progress, submitted assignments are complete', () => {
  const d = blank(),
    a = { id: 'a', status: 'In Progress', progress: 15 };
  d.task = [
    { id: '1', assignmentId: 'a', status: 'Completed', estimatedHours: 1 },
    { id: '2', assignmentId: 'a', status: 'Not Started', estimatedHours: 3 },
  ];
  assert.equal(assignmentProgress(a, d), 25);
  assert.equal(assignmentProgress({ ...a, status: 'Submitted' }, d), 100);
});
test('Exam topic stages calculate revision progress', () => {
  const d = blank();
  d.examTopic = [
    { id: 't1', examId: 'e', status: 'Confident' },
    { id: 't2', examId: 'e', status: 'Learning' },
  ];
  assert.equal(examProgress({ id: 'e', progress: 0 }, d), 66.5);
});
test('Weighted grades and target calculation use earned contribution, not rounded averages', () => {
  const d = blank();
  d.assignment = [{ id: 'a', name: 'Coursework', subjectId: 's', weighting: 60 }];
  d.exam = [{ id: 'e', subjectId: 's', weighting: 40 }];
  d.grade = [{ id: 'g', assignmentId: 'a', score: 74, maximum: 100 }];
  const g = gradeSummary('s', d, 75);
  assert.equal(g.weighted, 44.4);
  assert.equal(g.current, 74);
  assert.equal(g.required, 76.5);
  assert.equal(g.remaining, 40);
  d.grade.push({ id: 'g2', examId: 'e', score: 80, maximum: 100 });
  assert.equal(gradeSummary('s', d, 75).required, null);
  assert.equal(gradeSummary('s', d, 75).weighted, 76.4);
});
test('Urgent difficult assessment ranks above distant work and completed work is excluded', () => {
  const d = blank();
  d.assignment = [
    {
      id: 'a',
      name: 'Urgent',
      dueAt: '2026-09-08T12:00',
      subjectId: 's',
      weighting: 50,
      estimatedHours: 20,
      progress: 0,
      difficulty: 5,
      status: 'In Progress',
    },
    {
      id: 'b',
      name: 'Later',
      dueAt: '2026-10-08T12:00',
      weighting: 10,
      estimatedHours: 2,
      progress: 50,
      difficulty: 1,
      status: 'In Progress',
    },
    { id: 'c', status: 'Submitted' },
  ];
  const ranks = priorities(d, '2026-09-07T12:00');
  assert.equal(ranks[0].id, 'a');
  assert.equal(ranks.length, 2);
  assert.equal(ranks[0].level, 'Critical');
});
test('Missed milestones mark work behind, low capacity marks at risk', () => {
  const d = blank();
  const a = {
    id: 'a',
    dueAt: '2026-09-10T12:00',
    estimatedHours: 40,
    progress: 0,
    releaseDate: '2026-09-01',
    status: 'Planning',
  };
  assert.equal(health(a, d, '2026-09-07T12:00'), 'At Risk');
  d.milestone = [{ id: 'm', assignmentId: 'a', done: false, dueAt: '2026-09-06T12:00' }];
  assert.equal(health(a, d, '2026-09-07T12:00'), 'Behind');
});
test('Forecast avoids double counting assignment tasks and flags collisions', () => {
  const d = blank();
  d.assignment = [0, 1, 2].map((i) => ({
    id: 'a' + i,
    name: 'Work',
    dueAt: '2026-09-10T12:00',
    estimatedHours: 8,
    progress: 0,
    weighting: 20,
    difficulty: 3,
    status: 'Planning',
  }));
  d.task = [
    { id: 't', assignmentId: 'a0', status: 'Not Started', estimatedHours: 8, actualHours: 0 },
  ];
  const w = workload(d, '2026-09-07T12:00', 7);
  assert.equal(w.total, 24);
  assert.equal(w.collisions[0].count, 3);
  assert.equal(w.collisions[0].weight, 60);
});
test('Recurring classes respect weekday, date bounds and university breaks', () => {
  const d = blank();
  d.subject = [{ id: 's', semesterId: 'sem' }];
  d.class = [
    {
      id: 'c',
      subjectId: 's',
      name: 'Lab',
      day: 1,
      startTime: '10:00',
      endTime: '12:00',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      kind: 'Lab',
    },
  ];
  assert.equal(calendarEvents(d, '2026-09-07', '2026-09-13').length, 1);
  d.importantDate = [
    {
      id: 'b',
      name: 'Break',
      semesterId: 'sem',
      kind: 'Break',
      dueAt: '2026-09-07T00:00',
      endDate: '2026-09-13',
    },
  ];
  assert.equal(
    calendarEvents(d, '2026-09-07', '2026-09-13').filter((e) => e.entity === 'class').length,
    0,
  );
});
test('Teaching weeks skip full breaks and progress is bounded', () => {
  const d = blank(),
    s = {
      id: 'sem',
      startDate: '2026-09-01',
      endDate: '2026-12-01',
      teachingStart: '2026-09-07',
      teachingWeeks: 12,
    };
  d.importantDate = [
    { id: 'b', semesterId: 'sem', kind: 'Break', dueAt: '2026-09-14T00:00', endDate: '2026-09-20' },
  ];
  assert.equal(semesterProgress(s, '2026-09-21T12:00', d).week, 2);
  assert.equal(semesterProgress(s, '2026-08-01T12:00', d).percent, 0);
});
test('Validation rejects impossible dates, negative estimates and unsafe links', () => {
  assert.equal(
    schemaFor('milestone').safeParse({
      name: 'm',
      assignmentId: 'a',
      dueAt: '2026-02-30T12:00',
      done: false,
    }).success,
    false,
  );
  assert.equal(
    schemaFor('milestone').safeParse({
      name: 'm',
      assignmentId: 'a',
      dueAt: '2026-02-28T12:00',
      done: false,
    }).success,
    true,
  );
});

test('Invalid estimates, grades and link protocols are rejected', async () => {
  const { defaults } = await import('../lib/model');
  assert.equal(
    schemaFor('task').safeParse({ ...defaults('task'), name: 'Task', estimatedHours: -1 }).success,
    false,
  );
  assert.equal(
    schemaFor('grade').safeParse({
      ...defaults('grade'),
      assignmentId: 'a',
      score: 101,
      maximum: 100,
    }).success,
    false,
  );
  assert.equal(
    schemaFor('subject').safeParse({
      ...defaults('subject'),
      name: 'Test',
      code: 'T',
      semesterId: 's',
      links: 'javascript:alert(1)',
    }).success,
    false,
  );
});
