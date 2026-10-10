import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { studyDurationParts, studyDurationMinutes } from '../lib/study-duration';
import { AppContext } from '../components/context';
import { StudyTimer } from '../components/StudyTimer';

test('actual focus milliseconds become whole Hours/Minutes without changing timer accounting', () => {
  for (const [minutes, hours, remainder] of [
    [30, 0, 30],
    [60, 1, 0],
    [75, 1, 15],
    [130, 2, 10],
    [1440, 24, 0],
  ]) {
    const parts = studyDurationParts(minutes * 60000);
    assert.deepEqual(parts, { hours: String(hours), minutes: String(remainder) });
    assert.equal(studyDurationMinutes(parts.hours, parts.minutes), minutes);
  }
  for (const [ms, expected] of [
    [0, 0],
    [1000, 0],
    [29999, 0],
    [30000, 1],
    [59000, 1],
    [60000, 1],
    [89999, 1],
    [90000, 2],
    [3599999, 60],
  ]) {
    const parts = studyDurationParts(ms);
    assert.equal(studyDurationMinutes(parts.hours, parts.minutes), expected);
  }
});
test('review rejects decimals, missing fields, negatives and totals outside existing limits', () => {
  for (const [hours, minutes] of [
    ['-1', '0'],
    ['0', '-1'],
    ['1.5', '0'],
    ['0', '0.02'],
    ['0', '60'],
    ['', '0'],
    ['0', ''],
    ['text', '0'],
    ['1e1', '0'],
    ['25', '0'],
    ['24', '1'],
    ['9999999999999999999999', '0'],
  ])
    assert.throws(() => studyDurationMinutes(hours, minutes));
  assert.equal(studyDurationMinutes('0', '0'), 0, 'existing zero-duration allowance is preserved');
  assert.equal(studyDurationMinutes('1', '25'), 85);
  assert.equal(studyDurationMinutes('23', '59'), 1439);
});
test('review renders labelled integer fields from actual elapsed time rather than countdown target', () => {
  for (const [mode, focusMs, hours, minutes] of [
    ['countdown', 35 * 60000, '0', '35'],
    ['stopwatch', 83 * 60000, '1', '23'],
    ['stopwatch', 1000, '0', '0'],
  ] as const) {
    const timer = {
      id: 'timer',
      name: 'Focused study',
      mode,
      status: 'review',
      phase: 'review',
      focusMs,
      focusMinutes: 50,
      elapsedMs: 0,
      segmentAt: null,
      revision: 1,
    };
    const data: any = { task: [], subject: [], productivity: { timer, serverNow: Date.now() } };
    const html = renderToStaticMarkup(
      React.createElement(
        AppContext.Provider,
        { value: { data, allData: data, go() {}, notify() {}, reload: async () => {} } as any },
        React.createElement(StudyTimer),
      ),
    );
    assert.match(html, /<legend>Actual study time<\/legend>/);
    assert.ok(
      html.includes(
        `Hours<input autoComplete="off" type="number" inputMode="numeric" min="0" max="24" step="1" required="" value="${hours}"`,
      ),
    );
    assert.ok(
      html.includes(
        `Minutes<input autoComplete="off" type="number" inputMode="numeric" min="0" max="59" step="1" required="" value="${minutes}"`,
      ),
    );
    assert.match(html, /Save session/);
    assert.match(html, /Discard session/);
    assert.match(html, /Add a quick note/);
    assert.doesNotMatch(
      html,
      /Actual study minutes|step="any"|Cancel|Ready to save|Review &amp; save/,
    );
  }
});
test('floating UI has no drag/corner/storage implementation and retains fixed safe CSS', () => {
  const component = readFileSync('components/FloatingTimer.tsx', 'utf8');
  const mini = readFileSync('components/StudyTimer.tsx', 'utf8');
  const helper = readFileSync('lib/floating-timer.ts', 'utf8');
  assert.doesNotMatch(
    component + mini + helper,
    /onPointer|onTouch|dragHandle|GripHorizontal|student-timer-corner|localStorage|nearestTimerCorner|timerDragThreshold/,
  );
  const css = readFileSync('app/globals.css', 'utf8');
  assert.match(css, /--timer-sidebar-width: 236px/);
  assert.match(css, /--timer-sidebar-width: 210px/);
  assert.match(css, /sidebar-collapsed\s*\{\s*--timer-sidebar-width: 76px/);
  assert.match(css, /--timer-bottom: calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.timer-float\s*\{\s*position: fixed/);
  assert.match(css, /timer-visible-height, 100dvh/);
  assert.doesNotMatch(css, /timer-drag|data-movable|data-dragging|timer-safe-area/);
});
