import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppContext } from '../components/context';
import { Dashboard } from '../components/Dashboard';
import { StudyTimer, MiniTimer, FocusMode } from '../components/StudyTimer';
import { SemesterWeek } from '../components/SemesterWeek';
import { defaultLayout } from '../lib/dashboard-layout';
import { entities, type Data } from '../lib/model';

function fixture(): Data {
  const layout = defaultLayout();
  layout.desktop = [{ id: 'semester', width: 6, height: 1, hidden: false }];
  return {
    ...Object.fromEntries(entities.map((key) => [key, []])),
    setting: {
      name: 'Student',
      timezone: 'Australia/Brisbane',
      dailyHours: 3,
      activeSemesterId: 's',
    },
    semester: [
      {
        id: 's',
        name: 'QUT Y1S2',
        startDate: '2026-07-20',
        teachingStart: '2026-07-20',
        endDate: '2026-11-20',
        teachingWeeks: 13,
      },
    ],
    importantDate: [
      {
        id: 'b',
        name: 'Break',
        kind: 'Break',
        semesterId: 's',
        dueAt: '2026-09-21T00:00',
        endDate: '2026-09-27',
      },
    ],
    productivity: { preference: { layout: JSON.stringify(layout) }, recurrences: [], timer: null },
  } as unknown as Data;
}
function render(node: React.ReactNode, data = fixture(), now = '2026-10-11T09:00') {
  return renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      {
        value: {
          data,
          allData: data,
          now,
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
test('all active timer surfaces expose Pause/Resume and End without cancellation', () => {
  for (const status of ['running', 'paused']) {
    const data = fixture();
    data.productivity.timer = {
      id: 'timer',
      name: 'Focused study',
      mode: 'countdown',
      status,
      phase: 'focus',
      startedAt: Date.now(),
      segmentAt: Date.now(),
      elapsedMs: 0,
      focusMs: 0,
      focusMinutes: 50,
      breakMinutes: 10,
      round: 1,
      rounds: 1,
      revision: 0,
    };
    for (const node of [
      React.createElement(StudyTimer),
      React.createElement(MiniTimer),
      React.createElement(FocusMode),
    ]) {
      const html = render(node, data);
      assert.match(html, status === 'paused' ? />Resume</ : />Pause</);
      assert.match(html, />End</);
      assert.doesNotMatch(html, /Cancel|cancel|Discard|Finish/);
    }
  }
});
test('ended timer exposes review with Save and Discard only in the main review form', () => {
  const data = fixture();
  data.productivity.timer = {
    id: 'timer',
    name: 'Focused study',
    mode: 'stopwatch',
    status: 'review',
    phase: 'review',
    focusMs: 60000,
    elapsedMs: 0,
    segmentAt: null,
    revision: 1,
  };
  const review = render(React.createElement(StudyTimer), data);
  assert.match(review, /Session complete/);
  assert.match(review, /Save session/);
  assert.match(review, /type="button"[^>]*>Discard session/);
  assert.doesNotMatch(review, /Cancel|Pause|Resume|>End</);
  const mini = render(React.createElement(MiniTimer), data);
  assert.equal(mini, '');
  assert.doesNotMatch(mini, /Cancel|Discard|Pause|Resume|>End</);
});
test('Dashboard restores a muted date/week heading and separate semester identity/state', () => {
  const html = render(React.createElement(Dashboard));
  assert.match(
    html,
    /^<div class="page-heading"><div><p class="dashboard-context muted">11\/10\/2026 · Week 11 of 13<\/p><h1>Dashboard<\/h1>/,
  );
  assert.match(html, /Semester progress/);
  assert.match(
    html,
    /<strong class="semester-summary">QUT Y1S2<\/strong><p class="semester-state">Week 11 of 13<\/p>/,
  );
  assert.equal((html.match(/11\/10\/2026/g) ?? []).length, 1);
  assert.equal((html.match(/Week 11 of 13/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Week 11\/13/);
});
test('shared semester calculation preserves before, break/resumption and complete states in both places', () => {
  const data = fixture();
  for (const [now, expected] of [
    ['2026-07-19', 'Semester starts in 1 day'],
    ['2026-09-21', 'Semester Break'],
    ['2026-11-20', 'Teaching complete'],
  ]) {
    const html = render(
      React.createElement(SemesterWeek, { semester: data.semester[0], now, data }),
    );
    assert.ok(html.includes(expected));
    assert.doesNotMatch(html, /Week \d+ of 13|\d{2}\/\d{2}\/2026 ·/);
    const heading = render(React.createElement(Dashboard), data, now);
    assert.ok(heading.includes(' · ' + expected + '</p><h1>Dashboard'));
    if (now === '2026-09-21') assert.match(html, /Teaching Week 10 resumes 28\/09\/2026/);
  }
});
