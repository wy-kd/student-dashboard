import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppContext } from '../components/context';
import { MiniTimer, StudyTimer } from '../components/StudyTimer';
import { FloatingTimer } from '../components/FloatingTimer';
import {
  defaultTimerCorner,
  floatingTimerVisible,
  readTimerCorner,
  saveTimerCorner,
  timerBounds,
  timerCornerPosition,
  nearestTimerCorner,
  clampTimerPosition,
  beginTimerDrag,
  moveTimerDrag,
  timerCorners,
  keyboardTimerCorner,
} from '../lib/floating-timer';

const noSafe = { left: 0, right: 0, top: 0, bottom: 0 };
test('corner preference defaults safely, restores each choice and remains browser-local', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(readTimerCorner(storage), 'bottom-right');
  for (const corner of timerCorners) {
    saveTimerCorner(storage, corner);
    assert.equal(readTimerCorner(storage), corner);
    assert.equal(
      readTimerCorner({ getItem: () => null }),
      defaultTimerCorner,
      'other browser retains default',
    );
  }
  storage.setItem('student-timer-corner', '{"x":-10000,"y":999999}');
  assert.equal(readTimerCorner(storage), defaultTimerCorner);
  const blocked = {
    getItem(): string {
      throw Error('storage blocked');
    },
    setItem() {
      throw Error('storage blocked');
    },
  };
  assert.equal(readTimerCorner(blocked), defaultTimerCorner);
  assert.doesNotThrow(() => saveTimerCorner(blocked, 'top-left'));
});
test('all corners fit phone, iPad portrait/landscape and rotated safe bounds above navigation', () => {
  for (const [width, height, safe, header, nav] of [
    [390, 844, { ...noSafe, top: 47, bottom: 34 }, 125, 734],
    [844, 390, { ...noSafe, left: 47, right: 47, bottom: 21 }, 78, undefined],
    [820, 1180, { ...noSafe, top: 24, bottom: 20 }, 102, undefined],
    [1180, 820, { ...noSafe, top: 24, bottom: 20 }, 102, undefined],
    [1366, 1024, { ...noSafe, top: 24, bottom: 20 }, 102, undefined],
  ] as const) {
    const bounds = timerBounds({ x: 0, y: 0, width, height }, safe, header, nav);
    const size = { width: width <= 800 ? 320 : 360, height: 190 };
    for (const corner of timerCorners) {
      const p = timerCornerPosition(corner, size, bounds);
      assert.ok(p.x >= bounds.left && p.x + size.width <= bounds.right);
      assert.ok(p.y >= bounds.top && p.y + size.height <= bounds.bottom);
      assert.ok(p.y >= header + 12);
      if (nav) assert.ok(p.y + size.height <= nav - 12);
      assert.equal(nearestTimerCorner(p, size, bounds, 'bottom-right'), corner);
    }
    const moved = clampTimerPosition({ x: -9999, y: 9999 }, size, bounds);
    assert.ok(moved.x >= bounds.left && moved.y + size.height <= bounds.bottom);
  }
});
test('keyboard/pan viewport moves the same corner temporarily without rewriting the preference', () => {
  const normal = timerBounds({ x: 0, y: 0, width: 390, height: 844 }, noSafe, 78, 768);
  const keyboard = timerBounds({ x: 0, y: 120, width: 390, height: 360 }, noSafe, 78, 768);
  const size = { width: 320, height: 190 };
  const corner = 'bottom-right';
  const before = timerCornerPosition(corner, size, normal);
  const during = timerCornerPosition(corner, size, keyboard);
  assert.ok(during.y < before.y);
  assert.ok(during.y >= 132 && during.y + size.height <= 468);
  assert.deepEqual(timerCornerPosition(corner, size, normal), before);
  const short = timerBounds({ x: 0, y: 0, width: 320, height: 180 }, noSafe, 130, 145);
  assert.ok(
    short.bottom <= 133 && short.bottom > short.top,
    'very short viewport still clears navigation',
  );
});
test('dedicated handle gesture requires threshold, ignores other fingers, clamps and snaps to every corner', () => {
  const bounds = timerBounds({ x: 0, y: 0, width: 820, height: 1180 }, noSafe);
  const size = { width: 360, height: 190 };
  const origin = timerCornerPosition('bottom-right', size, bounds);
  for (const corner of timerCorners) {
    const start = { x: origin.x + 100, y: origin.y + 15 };
    const initial = beginTimerDrag(1, start, origin);
    assert.equal(moveTimerDrag(initial, 2, { x: 0, y: 0 }, size, bounds), initial);
    assert.equal(
      moveTimerDrag(initial, 1, { x: start.x + 3, y: start.y + 4 }, size, bounds).moved,
      false,
    );
    const destination = timerCornerPosition(corner, size, bounds);
    // Overshoot each edge so even the starting corner exercises a real drag.
    const point = {
      x: start.x + destination.x - origin.x + (corner.endsWith('left') ? -100 : 100),
      y: start.y + destination.y - origin.y + (corner.startsWith('top') ? -100 : 100),
    };
    const drag = moveTimerDrag(initial, 1, point, size, bounds);
    assert.equal(drag.moved, true);
    assert.deepEqual(drag.position, destination);
    assert.equal(nearestTimerCorner(drag.position, size, bounds, 'bottom-right'), corner);
  }
  assert.equal(keyboardTimerCorner('bottom-right', 'ArrowLeft'), 'bottom-left');
  assert.equal(keyboardTimerCorner('bottom-left', 'ArrowUp'), 'top-left');
  assert.equal(keyboardTimerCorner('top-left', 'ArrowRight'), 'top-right');
  assert.equal(keyboardTimerCorner('top-right', 'ArrowDown'), 'bottom-right');
  assert.equal(keyboardTimerCorner('top-right', 'Tab'), null);
});
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
    assert.match(html, /data-corner="bottom-right"/);
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
  assert.match(review, /Session complete|Actual study minutes/);
  assert.match(review, /Save session/);
  assert.match(review, /Discard session/);
  assert.match(review, /Add a quick note/);
});
test('drag handle and Pause/End are separate buttons, with no card-wide drag surface', () => {
  const handle = React.createElement(
    'button',
    { type: 'button', className: 'timer-drag-handle', 'aria-label': 'Move floating timer' },
    'Move',
  );
  const html = render(React.createElement(MiniTimer, { dragHandle: handle }), 'running');
  assert.match(html, /<button type="button" class="timer-drag-handle"/);
  assert.match(html, /<button class="button secondary">Pause<\/button>/);
  assert.match(html, /<button class="button primary">End<\/button>/);
});
