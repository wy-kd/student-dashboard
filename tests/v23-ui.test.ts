import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { AppContext } from '../components/context';
import { Availability } from '../components/Availability';
import { entities, type Data } from '../lib/model';
import { availabilitySchema, defaultPlanningPreferences } from '../lib/planning-model';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLDialogElement',
  'IS_REACT_ACT_ENVIRONMENT',
]) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name],
  });
}
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root')!);
const data = {
  ...Object.fromEntries(entities.map((e) => [e, []])),
  setting: {
    name: 'Fixture',
    timezone: 'Australia/Brisbane',
    dailyHours: 3,
    activeSemesterId: null,
  },
  planning: {
    preference: { revision: 0, ...defaultPlanningPreferences },
    windows: [],
    exceptions: [],
    commitments: [],
    estimates: [],
    blocks: [],
    batches: [],
  },
} as unknown as Data;
let node: React.ReactNode,
  writes = 0,
  fail = false,
  lastPayload: any;
const oldFetch = globalThis.fetch;
function tree() {
  return React.createElement(
    AppContext.Provider,
    {
      value: {
        data,
        allData: data,
        now: '2026-10-12T09:00',
        reload: async () => {
          await render();
        },
        open() {},
        save: async () => {},
        remove: async () => {},
        notify() {},
        go() {},
      },
    },
    node,
  );
}
async function render(value?: React.ReactNode) {
  if (value !== undefined) node = value;
  await act(async () => root.render(tree()));
}
const button = (text: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
async function click(element: HTMLElement) {
  assert.ok(element);
  await act(async () => {
    element.click();
    await new Promise((r) => setTimeout(r, 10));
  });
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 10));
  });
}
globalThis.fetch = async (_url: any, init: any) => {
  const { action, data: payload } = JSON.parse(init.body);
  lastPayload = payload;
  if (fail)
    return new Response(JSON.stringify({ error: 'Simulated stale availability' }), { status: 409 });
  if (action === 'availability.save') {
    const value = availabilitySchema.parse(payload);
    writes++;
    data.planning!.preference = { ...value.preferences, revision: value.revision + 1 };
    data.planning!.windows = value.windows;
    data.planning!.exceptions = value.exceptions;
    return new Response(JSON.stringify({ result: data.planning!.preference }));
  }
  throw Error('Unexpected UI request');
};
test('Availability editor copies days, edits multiple periods/exceptions, preserves failed drafts and resets without saving', async () => {
  await render(React.createElement(Availability));
  assert.match(document.body.textContent!, /Daily target: 3h/);
  const monday = document.querySelector('.availability-day')!;
  await click(button('Add period', monday));
  await input(monday.querySelectorAll('input')[0], '10:00');
  await input(monday.querySelectorAll('input')[1], '13:00');
  await select(monday.querySelector('select')!, '2');
  await submit(document.querySelector('form')!);
  assert.equal(writes, 1);
  assert.deepEqual(
    lastPayload.windows.map((w: any) => w.day),
    [1, 2],
  );
  await click(button('Mark unavailable', monday));
  assert.equal(monday.querySelectorAll('input').length, 0);
  await click(button('Cancel / reset unsaved changes'));
  assert.equal(monday.querySelectorAll('input').length, 2);
  assert.equal(writes, 1);
  const exception = document.querySelector('input[type=date]') as HTMLInputElement;
  await input(exception, '2026-10-14');
  await click(button('Add exception'));
  assert.match(document.body.textContent!, /Unavailable on this date/);
  await click(button('Add replacement period'));
  fail = true;
  await submit(document.querySelector('form')!);
  assert.match(document.body.textContent!, /Simulated stale availability/);
  assert.ok(button('Remove exception'));
  assert.equal(writes, 1, 'failed save retains draft without mutation');
  fail = false;
  await submit(document.querySelector('form')!);
  assert.equal(writes, 2);
  assert.deepEqual(lastPayload.exceptions, [
    { date: '2026-10-14', windows: [{ startTime: '19:00', endTime: '21:00' }] },
  ]);
  await click(button('Remove exception'));
  await submit(document.querySelector('form')!);
  assert.deepEqual(lastPayload.exceptions, []);
});
test.after(async () => {
  await act(async () => root.unmount());
  globalThis.fetch = oldFetch;
  dom.window.close();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as any)[name];
  }
});
