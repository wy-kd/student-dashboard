import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { command, launch, waitReady } from './helpers/startup';

test(
  'Production lifecycle: preflight, singleton, secret-free logs and graceful stop (paths with spaces)',
  { timeout: 90_000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'Student Dashboard fixture '));
    const put = (path: string, content: string) => {
      const full = join(root, path);
      mkdirSync(resolve(full, '..'), { recursive: true });
      writeFileSync(full, content);
    };
    for (const file of ['dashboard.ps1', 'dashboard.mjs']) {
      mkdirSync(join(root, 'scripts/windows'), { recursive: true });
      copyFileSync(resolve('scripts/windows', file), join(root, 'scripts/windows', file));
    }
    put('package.json', '{"type":"module"}');
    let active: ReturnType<typeof launch> | undefined;
    const occupied = createServer();
    try {
      assert.match((await command(root, 'start')).output, /build missing/);
      put('.next/BUILD_ID', 'fixture-build');
      assert.match((await command(root, 'start')).output, /database\/configuration missing/);
      assert.equal(
        existsSync(join(root, 'data/student.db')),
        false,
        'startup never provisions a missing DB',
      );
      put('data/student.db', 'existing fixture database bytes');
      put('.env', 'DATABASE_URL="file:../data/student.db"');
      put('backups/keep.json', 'existing backup');
      put('node_modules/@next/env/index.js', 'exports.loadEnvConfig = () => {};');
      // This records whether preflight allowed migration, without invoking real Prisma.
      put(
        'scripts/setup.mjs',
        `import {appendFileSync} from 'node:fs';
      appendFileSync('migration-calls.txt', process.argv.slice(2).join(' ')+'\\n');
      console.log('fixture-setup-token-SECRET');`,
      );
      put(
        'node_modules/next/dist/cli/next-start.js',
        `
      const http = require('node:http');
      const fs = require('node:fs');
      exports.nextStart = async (options) => {
        if (options.port !== 3000 || options.hostname !== '0.0.0.0') throw Error('wrong options');
        console.log('fixture-auth-session-SECRET');
        const server = http.createServer((req, res) => {
          if (req.url === '/slow') {
            fs.writeFileSync('request-started.txt', 'yes');
            setTimeout(() => {
              fs.writeFileSync('request-finished.txt', 'yes');
              res.end('finished');
            }, 2000);
          } else {res.setHeader('Content-Type','application/json'); res.end('{"setup":false,"signedIn":false}');}
        });
        process.on('SIGTERM', () => server.close(() => process.exit(143)));
        await new Promise((done) => server.listen(options.port, options.hostname, done));
      };`,
      );

      await new Promise<void>((done, reject) => {
        occupied.once('error', reject);
        occupied.listen(3000, '0.0.0.0', done);
      });
      assert.match((await command(root, 'start')).output, /Port 3000 is occupied/);
      assert.equal(existsSync(join(root, 'migration-calls.txt')), false);
      assert.match((await command(root, 'stop')).output, /nothing will be stopped/);
      assert.equal(occupied.listening, true, 'unrelated listener is never killed');
      await new Promise<void>((done) => occupied.close(() => done()));

      active = launch(root, 'start');
      await waitReady(active);
      assert.equal((await command(root, 'status')).code, 0);
      const duplicate = await command(root, 'start');
      assert.equal(duplicate.code, 1);
      assert.match(duplicate.output, /Another managed startup/);
      assert.equal(readFileSync(join(root, 'migration-calls.txt'), 'utf8'), '--unattended\n');
      const slow = fetch('http://127.0.0.1:3000/slow').then((r) => r.text());
      while (!existsSync(join(root, 'request-started.txt')))
        await new Promise((done) => setTimeout(done, 25));
      const stopped = await command(root, 'stop');
      assert.equal(stopped.code, 0, stopped.output);
      assert.equal(await slow, 'finished', 'graceful stop drains an in-flight request');
      assert.equal(existsSync(join(root, 'request-finished.txt')), true);
      assert.equal(await active.exited, 143);
      assert.equal((await command(root, 'status')).code, 1);
      assert.equal(
        readFileSync(join(root, 'data/student.db'), 'utf8'),
        'existing fixture database bytes',
      );
      assert.equal(readFileSync(join(root, 'backups/keep.json'), 'utf8'), 'existing backup');
      assert.equal(
        readFileSync(join(root, '.env'), 'utf8'),
        'DATABASE_URL="file:../data/student.db"',
      );
      assert.equal(existsSync(join(root, 'data/startup-control.json')), false);
      const logs = await command(root, 'logs');
      assert.match(logs.output, /Stop requested/);
      assert.doesNotMatch(logs.output + active.output(), /SECRET/);

      // An old state file must not prevent a new start after a crash/reboot.
      put('data/startup-control.json', '{"token":"stale-control-secret"}');
      active = launch(root, 'start');
      await waitReady(active);
      assert.equal((await command(root, 'stop')).code, 0);
      await active.exited;

      // A migration error stops startup and exposes only a safe public Prisma code.
      put('scripts/setup.mjs', "console.error('P3009 fixture-password-SECRET'); process.exit(1);");
      const failed = await command(root, 'start');
      assert.equal(failed.code, 1);
      assert.match(failed.output, /Migration failed.*P3009/);
      assert.doesNotMatch((await command(root, 'logs')).output, /SECRET/);
      assert.equal((await command(root, 'status')).code, 1);
    } finally {
      if (occupied.listening) occupied.close();
      if (active && active.child.exitCode === null) await command(root, 'stop');
      rmSync(root, { recursive: true, force: true });
    }
  },
);
