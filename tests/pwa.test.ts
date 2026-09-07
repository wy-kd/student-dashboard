import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('PWA keeps private API responses uncached and push clicks on the same-origin Notification Centre', async () => {
  const handlers: Record<string, Function> = {};
  let shown: any,
    navigated = '';
  const self = {
    location: { origin: 'https://fixture.tailnet.ts.net' },
    addEventListener: (name: string, handler: Function) => {
      handlers[name] = handler;
    },
    registration: {
      showNotification: async (title: string, options: any) => {
        shown = { title, ...options };
      },
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self,
    URL,
    caches: {
      open: async () => ({ addAll: async () => {} }),
      keys: async () => [],
      match: async () => null,
    },
    fetch: async () => ({ ok: true }),
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => {
        navigated = url;
      },
    },
  });
  let intercepted = false;
  handlers.fetch({
    request: { url: 'https://fixture.tailnet.ts.net/api/data', method: 'GET', mode: 'cors' },
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);
  let work: Promise<unknown> = Promise.resolve();
  handlers.push({
    data: {
      json: () => ({
        title: 'Student Dashboard',
        body: 'A university reminder needs your attention.',
        url: 'https://attacker.example/',
        tag: 'fixture',
      }),
    },
    waitUntil: (p: Promise<unknown>) => {
      work = p;
    },
  });
  await work;
  assert.equal(shown.data.url, '/notifications');
  assert.equal(shown.body, 'A university reminder needs your attention.');
  handlers.notificationclick({
    notification: { close: () => {}, data: { url: 'https://attacker.example/' } },
    waitUntil: (p: Promise<unknown>) => {
      work = p;
    },
  });
  await work;
  assert.equal(navigated, 'https://fixture.tailnet.ts.net/notifications');
});
