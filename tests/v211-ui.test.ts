import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppContext } from '../components/context';
import { AppSidebar } from '../components/AppNavigation';
import { MiniTimer, FocusMode } from '../components/StudyTimer';
import { RecurringTasks } from '../components/RecurringTasks';
const render = (component: React.ReactNode, timer: any = null, recurrences: any[] = []) => {
  const data: any = {
    setting: { name: 'Student' },
    task: [],
    subject: [],
    assignment: [],
    productivity: { timer, recurrences, serverNow: Date.now() },
  };
  return renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      {
        value: {
          data,
          allData: data,
          now: '2026-09-07T09:00',
          go() {},
          notify() {},
          reload: async () => {},
        } as any,
      },
      component,
    ),
  );
};
test('navigation exposes the actual toggle, current page and accessible icon names in either state', () => {
  for (const collapsed of [false, true]) {
    const html = render(
      React.createElement(AppSidebar, {
        route: 'tasks',
        menu: false,
        collapsed,
        toggleSidebar() {},
        onSignOut() {},
      }),
    );
    assert.match(html, new RegExp(`aria-label="${collapsed ? 'Expand' : 'Collapse'} navigation"`));
    assert.match(html, new RegExp(`aria-expanded="${!collapsed}"`));
    assert.match(html, /title="Tasks" aria-label="Tasks"[^>]*aria-current="page"/);
  }
});
test('app fullscreen is removed while Focus Mode and PWA standalone remain', () => {
  for (const file of ['components/Workspace.tsx', 'tests/visual-fixture.tsx', 'app/globals.css'])
    assert.doesNotMatch(readFileSync(file, 'utf8'), /fullscreen|Fullscreen|distraction-free/);
  assert.equal(existsSync('components/useAppFullscreen.ts'), false);
  assert.equal(typeof FocusMode, 'function');
  assert.match(readFileSync('app/globals.css', 'utf8'), /display-mode: standalone/);
});
test('dock renders distinct activity, status and clock for countdown/stopwatch running/paused/review', () => {
  for (const mode of ['countdown', 'stopwatch'])
    for (const status of ['running', 'paused', 'review']) {
      const html = render(React.createElement(MiniTimer), {
        id: 'fixture',
        name: 'Focused study',
        mode,
        status,
        phase: 'focus',
        startedAt: Date.now(),
        segmentAt: Date.now(),
        elapsedMs: 120000,
        focusMs: 120000,
        focusMinutes: 50,
        breakMinutes: 10,
        round: 1,
        rounds: 4,
        revision: 0,
      });
      assert.match(html, /<strong>Focused study<\/strong><span class="mini-timer-status">/);
      assert.match(html, /class="mini-timer-clock"/);
      assert.match(html, /class="mini-timer-time" role="timer"/);
      assert.match(
        html,
        new RegExp(
          status === 'review' ? 'Review &amp; save' : status === 'paused' ? 'Resume' : 'Pause',
        ),
      );
      assert.match(html, new RegExp(mode === 'stopwatch' ? 'Elapsed' : 'Remaining'));
    }
  assert.equal(render(React.createElement(MiniTimer)), '');
});
test('recurring tasks expose intentional empty state and separate readable series metadata/actions', () => {
  const empty = render(React.createElement(RecurringTasks));
  assert.match(empty, /<h2 id="recurring-heading">Recurring tasks<\/h2>/);
  assert.match(empty, /Your recurring series/);
  assert.match(empty, /No recurring tasks yet/);
  assert.match(empty, /Add recurring task/);
  const card = render(React.createElement(RecurringTasks), null, [
    {
      id: 'series',
      name: 'Review notes',
      anchor: '2026-09-07',
      nextDate: '2026-09-14',
      intervalDays: 7,
      time: '17:00',
      enabled: true,
    },
  ]);
  assert.match(card, /<h3>Review notes<\/h3>/);
  assert.match(card, /class="recurring-next"/);
  assert.match(card, /Edit series Review notes/);
  assert.match(card, /Delete series Review notes/);
});
