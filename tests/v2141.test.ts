import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppContext } from '../components/context';
import { MiniTimer, StudyTimer } from '../components/StudyTimer';
import { FloatingTimer } from '../components/FloatingTimer';
import { floatingTimerVisible } from '../lib/floating-timer';
function render(node: React.ReactNode, status: string | null) {
  const timer = status
    ? {
        id: 'timer',
        name: 'Focused study',
        status,
        mode: 'stopwatch',
        phase: status === 'review' ? 'review' : 'focus',
        startedAt: Date.now(),
        segmentAt: status === 'running' ? Date.now() : null,
        elapsedMs: 60000,
        focusMs: 60000,
        revision: 1,
      }
    : null;
  const data: any = { task: [], subject: [], productivity: { timer, serverNow: Date.now() } };
  return renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      { value: { data, allData: data, go() {}, notify() {}, reload: async () => {} } as any },
      node,
    ),
  );
}
test('running/paused floating surface renders; review/saved/discarded unmount it entirely', () => {
  for (const status of ['running', 'paused']) {
    const html = render(React.createElement(FloatingTimer), status);
    assert.match(html, /class="timer-float"/);
    assert.doesNotMatch(html, /data-corner|data-movable|drag|Move floating timer/);
    assert.match(html, /Active study timer/);
    assert.match(html, status === 'running' ? />Pause</ : />Resume</);
    assert.match(html, />End</);
    assert.doesNotMatch(html, /Ready to save|Review &amp; save|Cancel/);
  }
  for (const status of ['review', 'saved', 'cancelled', null]) {
    assert.equal(floatingTimerVisible(status ? { status } : null), false);
    assert.equal(render(React.createElement(FloatingTimer), status), '');
    assert.equal(render(React.createElement(MiniTimer), status), '');
  }
  const review = render(React.createElement(StudyTimer), 'review');
  assert.match(review, /Session complete|Actual study time/);
  assert.match(review, /Save session/);
  assert.match(review, /Discard session/);
  assert.match(review, /Add a quick note/);
});
