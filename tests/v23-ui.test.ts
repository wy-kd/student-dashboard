import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { AppContext } from '../components/context';
import { SchedulePlanning } from '../components/SchedulePlanning';
import { generateSchedule } from '../lib/planning-engine';
import { instant } from '../lib/planning-time';
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
let approvalWrites = 0,
  interruptApproval = false;
const approvalRequests: any[] = [];
const approved = new Map<string, any>();
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
  if (action === 'schedule.generate')
    return new Response(
      JSON.stringify({
        result: {
          fingerprint: 'a'.repeat(64),
          ...generateSchedule(
            data,
            instant('2026-10-12T08:00', 'Australia/Brisbane'),
            payload.startDate,
            payload.endDate,
            payload.excluded,
          ),
        },
      }),
    );
  if (action === 'schedule.approve') {
    approvalRequests.push(structuredClone(payload));
    let receipt = approved.get(payload.requestId);
    if (!receipt) {
      approvalWrites++;
      receipt = { batchId: payload.requestId, state: 'approved' };
      approved.set(payload.requestId, receipt);
      data.planning!.blocks.push(
        ...payload.changes.map((change: any) => ({
          ...change,
          id: payload.requestId + ':' + change.id,
          state: 'planned',
          revision: 0,
        })),
      );
    }
    if (interruptApproval) {
      interruptApproval = false;
      throw Error('Interrupted response');
    }
    return new Response(JSON.stringify({ result: receipt }));
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

test('Scheduling preview edits and selective approval retain uncertain requests, while Cancel makes no changes', async () => {
  data.task = [
    {
      id: 'work',
      name: 'Primary task',
      estimatedHours: 2,
      actualHours: 0,
      status: 'Not Started',
      priority: 'Medium',
      dueAt: '2026-10-20T11:00',
    },
    {
      id: 'alternative',
      name: 'Alternative task',
      estimatedHours: 1,
      actualHours: 0,
      status: 'Not Started',
      priority: 'Low',
      dueAt: '2026-10-20T11:00',
    },
  ];
  await render(React.createElement(SchedulePlanning));
  await click(button('Plan my week'));
  assert.ok(document.querySelector('[aria-label="Schedule preview"]'));
  assert.equal(approvalWrites, 0);
  await click(button('Cancel proposal'));
  assert.equal(approvalWrites, 0);
  assert.equal(data.planning!.blocks.length, 0);
  await click(button('Plan my week'));
  const cards = Array.from(document.querySelectorAll('.planning-suggestion'));
  assert.ok(cards.length > 1);
  for (const card of cards.slice(1))
    await click(card.querySelector('input[type=checkbox]') as HTMLElement);
  const first = cards[0];
  await select(first.querySelector('select')!, 'task:alternative');
  const times = first.querySelectorAll('input[type=datetime-local]');
  await input(times[0] as HTMLInputElement, '2026-10-12T14:00');
  await input(times[1] as HTMLInputElement, '2026-10-12T15:00');
  await click(first.querySelectorAll('input[type=checkbox]')[1] as HTMLElement);
  interruptApproval = true;
  await click(button('Accept selected changes'));
  assert.equal(approvalWrites, 1);
  assert.match(document.body.textContent!, /approval response was interrupted/);
  assert.ok(button('Retry same approval'));
  assert.ok((first.querySelector('select') as HTMLSelectElement).matches(':disabled'));
  await click(button('Retry same approval'));
  assert.equal(approvalWrites, 1);
  assert.equal(approvalRequests.length, 2);
  assert.deepEqual(approvalRequests[0], approvalRequests[1]);
  assert.equal(approvalRequests[0].changes.length, 1);
  assert.equal(approvalRequests[0].changes[0].workKey, 'task:alternative');
  assert.equal(approvalRequests[0].changes[0].override, true);
  assert.equal(
    approvalRequests[0].changes[0].startAt,
    instant('2026-10-12T14:00', 'Australia/Brisbane'),
  );
  assert.ok(!document.querySelector('[aria-label="Schedule preview"]'));
  assert.match(document.body.textContent!, /No study time or Task completion was recorded/);
  assert.equal(data.studySession.length, 0);
  assert.equal(data.task[0].status, 'Not Started');
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
