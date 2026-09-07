import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest } from 'next/server';
import { defaults } from '../lib/model';

const dir = mkdtempSync(join(tmpdir(), 'student-proxy-test-'));
process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
const sqlite = new DatabaseSync(join(dir, 'test.db'));
for (const dir of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', dir, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { hashPassword } = await import('../lib/auth');
const auth = await import('../app/api/auth/route');
const data = await import('../app/api/data/route');
const backup = await import('../app/api/backup/route');
const demo = await import('../app/api/demo/route');
const previousCwd = process.cwd();
// Restore safety backups belong to this disposable fixture, too.
process.chdir(dir);
test.after(async () => {
  await db.$disconnect();
  process.chdir(previousCwd);
  rmSync(dir, { recursive: true, force: true });
});

test('Localhost, LAN and Serve-style HTTPS requests share data and retain authentication and CSRF checks', async (t) => {
  const password = 'fixture-password-only';
  await db.user.create({ data: { id: 'owner', passwordHash: hashPassword(password) } });
  // Fictional hostnames are fixtures, never an application allowlist.
  for (const origin of [
    'http://localhost:3000',
    'http://192.168.1.42:3000',
    'https://laptop.example-tailnet.ts.net',
    'https://another-host.different-tailnet.ts.net',
  ]) {
    await t.test(origin, async () => {
      const host = new URL(origin).host;
      const secure = origin.startsWith('https:');
      let token = '';
      const request = (
        path: string,
        method = 'GET',
        body?: unknown,
        overrides: Record<string, string | null | undefined> = {},
      ) => {
        const headers = new Headers({
          host,
          origin,
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          ...(secure ? { 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } : {}),
          ...(token ? { cookie: `student_session=${token}` } : {}),
        });
        for (const [key, value] of Object.entries(overrides)) {
          if (value == null) headers.delete(key);
          else headers.set(key, value);
        }
        // Serve terminates TLS; the backend URL stays HTTP even for HTTPS clients.
        return new NextRequest('http://127.0.0.1:3000' + path, {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      };

      assert.equal((await data.GET(request('/api/data'))).status, 401);
      assert.equal((await backup.GET(request('/api/backup'))).status, 401);
      assert.equal(
        (
          await data.GET(
            request('/api/data', 'GET', undefined, {
              'tailscale-user-login': 'fixture@example.com',
              'tailscale-user-name': 'Fixture Owner',
            }),
          )
        ).status,
        401,
        'Tailscale identity does not replace the app password',
      );
      assert.equal(
        (await auth.POST(request('/api/auth', 'POST', { password: 'incorrect-password' }))).status,
        401,
      );
      const login = await auth.POST(request('/api/auth', 'POST', { password }));
      assert.equal(login.status, 200);
      assert.equal(login.headers.get('location'), null);
      const cookie = login.cookies.get('student_session')!;
      token = cookie.value;
      assert.equal(cookie.secure ?? false, secure);
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.sameSite, 'strict');
      assert.equal(cookie.path, '/');
      assert.equal(cookie.domain, undefined, 'session cookie is host-only');
      assert.deepEqual(await (await auth.GET(request('/api/auth'))).json(), {
        setup: false,
        signedIn: true,
      });

      // None of the mutation routes may use forwarded headers to rescue a bad Origin/Host.
      const writes = [auth.POST, auth.DELETE, data.POST, data.DELETE, backup.POST, demo.POST];
      for (const handler of writes) {
        for (const overrides of [
          { origin: null },
          { origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example' },
          { host: '127.0.0.1:3000', 'x-forwarded-host': host, 'x-forwarded-proto': 'https' },
          { 'sec-fetch-site': 'cross-site' },
        ]) {
          assert.equal((await handler(request('/api/test', 'POST', {}, overrides))).status, 403);
        }
        assert.equal(
          (await handler(request('/api/test', 'POST', {}, { 'content-type': 'text/plain' })))
            .status,
          415,
        );
      }

      assert.equal(
        (
          await data.POST(
            request('/api/data', 'POST', {
              entity: 'task',
              data: { ...defaults('task'), name: origin },
            }),
          )
        ).status,
        200,
      );
      const snapshot = await (await data.GET(request('/api/data'))).json();
      assert.ok(
        snapshot.task.some((row: { name: string }) => row.name === 'http://localhost:3000'),
        'every hostname reads the same database',
      );
      const row = snapshot.task.find((item: { name: string }) => item.name === origin);
      const exported = await backup.GET(request('/api/backup'));
      assert.equal(exported.status, 200);
      assert.equal(exported.headers.get('cache-control'), 'no-store');
      const payload = await exported.json();
      assert.equal(payload.format, 'student-dashboard');
      assert.equal(JSON.stringify(payload).includes('passwordHash'), false);
      assert.equal(JSON.stringify(payload).includes(token), false);
      assert.ok(
        (await (await backup.GET(request('/api/backup?csv=task'))).text()).includes(origin),
      );
      assert.equal(
        (
          await data.DELETE(
            request('/api/data', 'DELETE', {
              entity: 'task',
              id: row.id,
              revision: row.revision,
            }),
          )
        ).status,
        200,
      );
      assert.equal((await backup.POST(request('/api/backup', 'POST', payload))).status, 200);
      const restored = await (await data.GET(request('/api/data'))).json();
      assert.ok(restored.task.some((item: { id: string }) => item.id === row.id));

      const logout = await auth.DELETE(request('/api/auth', 'DELETE', {}));
      assert.equal(logout.status, 200);
      assert.equal(logout.headers.get('location'), null);
      assert.equal(logout.cookies.get('student_session')!.value, '');
      assert.equal(new Date(logout.cookies.get('student_session')!.expires!).getTime(), 0);
      assert.equal(
        (await data.GET(request('/api/data'))).status,
        401,
        'logout invalidates the server session',
      );
      // Scheme detection does not blindly trust a client-supplied forwarded protocol.
      const relogin = await auth.POST(
        request(
          '/api/auth',
          'POST',
          { password },
          {
            'x-forwarded-proto': secure ? 'http' : 'https',
            'x-forwarded-host': 'attacker.example',
          },
        ),
      );
      assert.equal(relogin.status, 200);
      assert.equal(relogin.cookies.get('student_session')!.secure ?? false, secure);
      token = relogin.cookies.get('student_session')!.value;
      assert.equal((await auth.DELETE(request('/api/auth', 'DELETE', {}))).status, 200);
    });
  }
});
