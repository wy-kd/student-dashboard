import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTimerSync } from '../lib/timer-client';
import { readSidebarPreference, saveSidebarPreference } from '../lib/navigation-preference';
import {
  watchTimer,
  announceTimerChange,
  drainTimerWaits,
  timerServerDraining,
} from '../lib/timer-events';
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

test('sidebar choice survives reload and keeps independent browser preferences', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(readSidebarPreference(storage), false);
  assert.equal(readSidebarPreference(storage, true), true);
  saveSidebarPreference(storage, true);
  assert.equal(readSidebarPreference(storage), true);
  saveSidebarPreference(storage, false);
  assert.equal(readSidebarPreference(storage, true), false);
  const unavailable = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.equal(readSidebarPreference(unavailable, true), true);
  assert.doesNotThrow(() => saveSidebarPreference(unavailable, true));
});
test('timer client holds idle requests, resumes on visibility, discards stale replies and stops on logout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests: any[] = [],
    updates: any[] = [];
  let visible = true,
    signedOut = false;
  const client = createTimerSync({
    fetch: ((url: string, options: any) =>
      new Promise((resolve) => requests.push({ url, options, resolve }))) as any,
    visible: () => visible,
    update: (s) => updates.push(s),
    error() {},
    signedOut() {
      signedOut = true;
    },
  });
  const reply = (i: number, body: any, status = 200) =>
    requests[i].resolve({ ok: status === 200, status, json: async () => body });
  client.refresh();
  reply(0, { timer: null, cursor: 'none' });
  await flush();
  t.mock.timers.tick(0);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /cursor=none/);
  t.mock.timers.tick(24000);
  await flush();
  assert.equal(requests.length, 2, 'no aggressive polling with no active timer');
  visible = false;
  client.refresh();
  assert.equal(requests[1].options.signal.aborted, true);
  visible = true;
  client.refresh();
  reply(2, { timer: { id: 'timer', revision: 2, status: 'paused' }, cursor: 'timer:2' });
  await flush();
  reply(1, { timer: { id: 'timer', revision: 1, status: 'running' }, cursor: 'timer:1' });
  await flush();
  assert.equal(
    updates.at(-1).timer.status,
    'paused',
    'late response cannot overwrite current state',
  );
  t.mock.timers.tick(0);
  reply(3, {}, 401);
  await flush();
  t.mock.timers.tick(60000);
  assert.equal(signedOut, true);
  assert.equal(requests.length, 4);
  client.stop();
});
test('timer connection retries with backoff and aborts hung requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests: any[] = [],
    errors: string[] = [];
  const client = createTimerSync({
    fetch: ((_url: string, options: any) =>
      new Promise((_resolve, reject) => {
        requests.push({ options, reject });
        options.signal.addEventListener('abort', () => reject(Error('aborted')));
      })) as any,
    visible: () => true,
    update() {},
    error: (e) => errors.push(e),
    signedOut() {},
  });
  client.refresh();
  requests[0].reject(Error('offline'));
  await flush();
  t.mock.timers.tick(999);
  assert.equal(requests.length, 1);
  t.mock.timers.tick(1);
  assert.equal(requests.length, 2);
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(requests[1].options.signal.aborted, true);
  t.mock.timers.tick(1999);
  assert.equal(requests.length, 2);
  t.mock.timers.tick(1);
  assert.equal(requests.length, 3);
  assert.ok(errors.every((e) => !e.includes('SECRET')));
  client.stop();
  await flush();
});
test('timer event waits are bounded, abortable and isolated by owner', async () => {
  const controller = new AbortController();
  const watch = watchTimer('a', controller.signal, 20);
  let resolved = false;
  watch.changed.then(() => {
    resolved = true;
  });
  announceTimerChange('b');
  await flush();
  assert.equal(resolved, false);
  await watch.changed;
  watch.close();
  assert.equal(resolved, true);
  const aborted = watchTimer('a', controller.signal);
  controller.abort();
  await aborted.changed;
  aborted.close();
});
test('Today and Weekly Review retain useful sections without automatic planning controls', () => {
  const source = readFileSync(new URL('../components/DailyPlanning.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /DayPlanner|Plan My Day|Plan Next Week|suggestDay|plan.save/);
  assert.match(source, /export function Today/);
  assert.match(source, /Classes & study/);
  assert.match(source, /Recommended work/);
  assert.match(source, /export function WeeklyReview/);
});

test('shutdown releases waiting timer reads immediately without terminating the process', async () => {
  const controller = new AbortController();
  const first = watchTimer('one', controller.signal),
    second = watchTimer('two', controller.signal);
  drainTimerWaits();
  await Promise.all([first.changed, second.changed]);
  first.close();
  second.close();
  assert.equal(timerServerDraining(), true);
  const later = watchTimer('one', controller.signal);
  await later.changed;
  later.close();
});
