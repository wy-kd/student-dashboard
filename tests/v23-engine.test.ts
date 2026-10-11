import test from 'node:test';
import assert from 'node:assert/strict';
import { entities, type Data } from '../lib/model';
import { defaultPlanningPreferences } from '../lib/planning-model';
import { generateSchedule, workItems } from '../lib/planning-engine';
import { instant, minute, civilAt, overlaps } from '../lib/planning-time';
const zone = 'Australia/Brisbane',
  now = instant('2026-10-12T08:00', zone);
function fixture(): Data {
  return {
    ...Object.fromEntries(entities.map((e) => [e, []])),
    setting: { name: 'Fixture', timezone: zone, dailyHours: 2, activeSemesterId: null },
    planning: {
      preference: {
        revision: 0,
        ...defaultPlanningPreferences,
        preferredMinutes: 60,
        minimumMinutes: 20,
        restMinutes: 10,
        maxDailyMinutes: 180,
      },
      windows: Array.from({ length: 7 }, (_, day) => ({
        day,
        startTime: '09:00',
        endTime: '17:00',
      })),
      exceptions: [],
      commitments: [],
      estimates: [],
      blocks: [],
      batches: [],
    },
  } as unknown as Data;
}
function task(id: string, hours: number, extra: any = {}) {
  return {
    id,
    name: id,
    estimatedHours: hours,
    actualHours: 0,
    priority: 'Medium',
    status: 'Not Started',
    ...extra,
  };
}
test('Seven-day plans are deterministic, split tasks, distribute workload and reserve rest without duplicating work', () => {
  const d = fixture();
  d.task = [task('Report', 5, { dueAt: '2026-10-16T11:00' })];
  const a = generateSchedule(d, now),
    b = generateSchedule(d, now);
  assert.deepEqual(a, b);
  assert.equal(
    a.suggestions.reduce((n, s) => n + (s.endAt - s.startAt) / minute, 0),
    300,
  );
  assert.ok(new Set(a.suggestions.map((s) => civilAt(s.startAt, zone).slice(0, 10))).size >= 3);
  assert.ok(
    a.suggestions.every(
      (s) => s.workKey === 'task:Report' && s.endAt <= instant('2026-10-16T11:00', zone),
    ),
  );
  for (let i = 1; i < a.suggestions.length; i++)
    assert.ok(a.suggestions[i].startAt >= a.suggestions[i - 1].endAt + 10 * minute);
  assert.equal(d.task.length, 1);
  assert.equal(d.studySession.length, 0);
  assert.equal(d.planning!.blocks.length, 0, 'preview writes no confirmed block');
});
test('Exact parent deadlines and fixed commitments constrain placement; priorities break equal-deadline ties', () => {
  const d = fixture();
  d.assignment = [
    {
      id: 'parent',
      name: 'Report',
      dueAt: '2026-10-12T11:00',
      estimatedHours: 2,
      status: 'Not Started',
    },
  ];
  d.task = [
    task('later task deadline', 2, {
      assignmentId: 'parent',
      dueAt: '2026-10-15T23:59',
      priority: 'High',
    }),
    task('completed', 1, { status: 'Completed' }),
  ];
  d.planning!.commitments = [
    {
      id: 'appointment',
      name: 'Appointment',
      startAt: instant('2026-10-12T09:00', zone),
      endAt: instant('2026-10-12T10:30', zone),
      fixed: true,
    },
  ];
  const result = generateSchedule(d, now);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].deadline, instant('2026-10-12T11:00', zone));
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].startAt, instant('2026-10-12T10:30', zone));
  assert.equal(result.unscheduled[0].minutes, 90);
  assert.equal(result.status, 'Needs adjustment');
  const tied = fixture();
  tied.task = [
    task('low', 1, { priority: 'Low', dueAt: '2026-10-13T12:00' }),
    task('critical', 1, { priority: 'Critical', dueAt: '2026-10-13T12:00' }),
  ];
  assert.equal(generateSchedule(tied, now).suggestions[0].workKey, 'task:critical');
});
test('Missing availability and estimates produce honest incomplete guidance, without one-hour guesses', () => {
  const d = fixture();
  d.planning!.windows = [];
  d.task = [task('unknown', 0), task('known', 2)];
  const p = generateSchedule(d, now);
  assert.equal(p.status, 'Insufficient information');
  assert.equal(p.capacityMinutes, 0);
  assert.equal(p.suggestions.length, 0);
  assert.equal(p.items.find((x) => x.id === 'unknown')!.minutes, null);
  assert.equal(p.requiredMinutes, 120);
});
test('Recorded work needs an explicit remaining estimate; planned time is credited separately and never treated as completion', () => {
  const d = fixture();
  d.task = [task('unfinished', 3, { actualHours: 1, status: 'In Progress' })];
  d.planning!.taskRecordedMinutes = { unfinished: 60 };
  assert.equal(workItems(d, now).items[0].minutes, null);
  d.planning!.estimates = [{ workKey: 'task:unfinished', minutes: 90 }];
  d.planning!.blocks = [
    {
      id: 'existing',
      workKey: 'task:unfinished',
      name: 'Confirmed work',
      startAt: instant('2026-10-12T09:00', zone),
      endAt: instant('2026-10-12T10:00', zone),
      state: 'planned',
    },
  ];
  const p = generateSchedule(d, now);
  assert.equal(p.items[0].recordedMinutes, 120);
  assert.equal(p.items[0].minutes, 90);
  assert.equal(p.requiredMinutes, 30);
  assert.equal(
    p.suggestions.reduce((n, s) => n + (s.endAt - s.startAt) / minute, 0),
    30,
  );
  assert.equal(d.task[0].status, 'In Progress');
  assert.ok(p.suggestions.every((s) => s.startAt >= instant('2026-10-12T10:10', zone)));
});
test('Linked task estimates replace parent work; unlinked assignments/exams still plan, and completed parents are excluded', () => {
  const d = fixture();
  d.assignment = [
    {
      id: 'parent',
      name: 'Parent',
      estimatedHours: 10,
      status: 'Not Started',
      dueAt: '2026-10-18T12:00',
    },
    {
      id: 'unlinked',
      name: 'Unlinked',
      estimatedHours: 1,
      status: 'Not Started',
      dueAt: '2026-10-18T12:00',
    },
  ];
  d.exam = [
    {
      id: 'exam',
      name: 'Revision',
      estimatedHours: 1,
      dueAt: '2026-10-18T10:00',
      duration: 120,
      completed: false,
    },
  ];
  d.task = [task('child', 2, { assignmentId: 'parent' })];
  const p = generateSchedule(d, now);
  assert.equal(p.requiredMinutes, 240);
  assert.equal(
    p.items.some((x) => x.key === 'assignment:parent'),
    false,
  );
  assert.match(p.warnings.join(' '), /only linked Tasks/);
  d.assignment[0].status = 'Submitted';
  assert.equal(
    workItems(d, now).items.some((x) => x.id === 'child'),
    false,
  );
});
test('Today/tomorrow/custom ranges avoid the past; shortfall depends on deadline distribution, not weekly totals', () => {
  const d = fixture();
  d.task = [task('tomorrow', 2, { dueAt: '2026-10-13T10:00' })];
  d.planning!.exceptions = [
    { date: '2026-10-12', windows: [] },
    { date: '2026-10-13', windows: [] },
  ];
  const p = generateSchedule(d, now);
  assert.ok(p.capacityMinutes > 120);
  assert.equal(p.suggestions.length, 0);
  assert.equal(p.unscheduled[0].minutes, 120);
  assert.equal(generateSchedule(d, now, '2026-10-13', '2026-10-13').suggestions.length, 0);
  assert.throws(() => generateSchedule(d, now, '2026-10-11', '2026-10-12'));
  assert.throws(() => generateSchedule(d, now, '2026-10-12', '2026-11-12'));
  const today = fixture();
  today.task = [task('today', 1)];
  const afternoon = instant('2026-10-12T15:30', zone);
  assert.ok(
    generateSchedule(today, afternoon, '2026-10-12', '2026-10-12').suggestions.every(
      (x) => x.startAt >= afternoon,
    ),
  );
});
test('Maximum workloads, selected exclusions, minimum-session fragments and overlapping commitments are transparent', () => {
  const d = fixture();
  d.planning!.preference.maxDailyMinutes = 60;
  d.task = [task('large', 3), task('excluded', 1)];
  const p = generateSchedule(d, now, '2026-10-12', '2026-10-12', ['task:excluded']);
  assert.equal(
    p.suggestions.reduce((n, s) => n + (s.endAt - s.startAt) / minute, 0),
    60,
  );
  assert.equal(p.unscheduled[0].minutes, 120);
  const small = fixture();
  small.task = [task('fragment', 0.1)];
  const fragment = generateSchedule(small, now);
  assert.equal(fragment.suggestions.length, 0);
  assert.equal(fragment.unscheduled[0].minutes, 6);
  d.planning!.commitments = [
    { id: 'a', name: 'A', startAt: now + 60 * minute, endAt: now + 180 * minute, fixed: true },
    { id: 'b', name: 'B', startAt: now + 120 * minute, endAt: now + 180 * minute, fixed: true },
  ];
  assert.ok(generateSchedule(d, now).conflicts.length);
  assert.ok(
    generateSchedule(d, now).suggestions.every(
      (s) =>
        !d.planning!.commitments.some((c) =>
          overlaps({ start: s.startAt, end: s.endAt }, { start: c.startAt, end: c.endAt }),
        ),
    ),
  );
});

test('Explicitly saved unavailable days mean no capacity rather than missing setup', () => {
  const d = fixture();
  d.planning!.windows = [];
  d.planning!.preference.revision = 1;
  d.task = [task('Known work', 1)];
  const result = generateSchedule(d, now);
  assert.equal(result.capacityMinutes, 0);
  assert.equal(result.status, 'Needs adjustment');
  assert.equal(result.unscheduled[0].minutes, 60);
});
