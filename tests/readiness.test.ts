import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHealth, waitForReadiness } from '../scripts/windows/readiness.mjs';

test('Health diagnostics distinguish transport, HTTP and application failures without private data', async (t) => {
  const mockFetch = t.mock.method(globalThis, 'fetch');
  mockFetch.mock.mockImplementation(async () => {
    throw Object.assign(new Error('fixture-network-SECRET'), { cause: { code: 'ECONNREFUSED' } });
  });
  assert.deepEqual(await checkHealth(), { ok: false, reason: 'connection refused' });
  mockFetch.mock.mockImplementation(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      }),
  );
  // Keep the test alive while AbortSignal's unref'ed timeout is pending.
  const keepAlive = setTimeout(() => {}, 1000);
  assert.deepEqual(await checkHealth(20), { ok: false, reason: 'HTTP timeout' });
  clearTimeout(keepAlive);
  mockFetch.mock.mockImplementation(
    async () => new Response('fixture-http-body-SECRET', { status: 503 }),
  );
  assert.deepEqual(await checkHealth(), { ok: false, reason: 'non-success HTTP status (503)' });
  for (const body of [
    'fixture-body-SECRET',
    '{"password":"fixture-password-SECRET"}',
    'null',
    '{"setup":false,"signedIn":true}',
  ]) {
    mockFetch.mock.mockImplementation(async () => new Response(body));
    assert.deepEqual(await checkHealth(), {
      ok: false,
      reason: 'database/application health failure (invalid health response)',
    });
  }
  mockFetch.mock.mockImplementation(async () => new Response('{"setup":false,"signedIn":false}'));
  assert.equal((await checkHealth()).ok, true);
});

// A successful response arriving at the deadline must not become a false ready.
test('A health response after the overall deadline remains a timeout', async (t) => {
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed);
  t.mock.method(globalThis, 'fetch', async () => {
    elapsed = 60_001;
    return new Response('{"setup":false,"signedIn":false}');
  });
  const lines: string[] = [];
  const result = await waitForReadiness(
    async () => {},
    (line: string) => lines.push(line),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'HTTP timeout');
  assert.match(lines.join('\n'), /deadline reached/);
});
