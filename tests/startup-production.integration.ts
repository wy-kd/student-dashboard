// Run after npm run build. Never starts the app against the developer's database.
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { command, launch, waitReady } from './helpers/startup';

test(
  'Built Next.js server starts, restarts and preserves SQLite through the Windows launcher',
  { timeout: 120_000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'Student Dashboard production '));
    for (const path of [
      'scripts',
      'prisma',
      'public',
      'package.json',
      'next.config.ts',
      'tsconfig.json',
    ]) {
      cpSync(resolve(path), join(root, path), { recursive: true });
    }
    // Junctions work on Windows without developer-mode symlink privileges.
    symlinkSync(
      resolve('node_modules'),
      join(root, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    cpSync(resolve('.next'), join(root, '.next'), {
      recursive: true,
      filter: (path) => !path.startsWith(resolve('.next/cache')),
    });
    mkdirSync(join(root, 'data'));
    mkdirSync(join(root, 'backups'));
    const databaseUrl = 'file:' + join(root, 'data/student.db');
    writeFileSync(join(root, '.env'), `DATABASE_URL=${JSON.stringify(databaseUrl)}\n`);
    writeFileSync(join(root, 'data/setup-token'), 'fixture-setup-token-SECRET');
    writeFileSync(join(root, 'backups/keep.json'), 'existing backup');
    // Provision only this disposable fixture, using the unchanged installation path.
    const provision = spawnSync(process.execPath, ['scripts/setup.mjs', '--unattended'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    });
    assert.equal(provision.status, 0, 'fixture migration succeeds');
    const seed = new DatabaseSync(join(root, 'data/student.db'));
    seed.exec(`INSERT INTO User (id,passwordHash) VALUES ('owner','fixture-password-hash-SECRET');
    INSERT INTO Session (id,expiresAt,userId) VALUES ('fixture-session-SECRET',9999999999999,'owner');
    INSERT INTO Task (id,name) VALUES ('preserve-task','Existing academic record');`);
    const token = 'fixture-production-token-SECRET';
    seed
      .prepare('INSERT INTO Session (id,expiresAt,userId) VALUES (?,9999999999999,?)')
      .run(createHash('sha256').update(token).digest('hex'), 'owner');
    seed.prepare('UPDATE Task SET dueAt=? WHERE id=?').run('2026-01-01T10:00', 'preserve-task');
    seed.close();
    const headers = {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
      cookie: 'student_session=' + token,
    };
    const timerId = randomUUID();
    const todoId = randomUUID();
    let active: ReturnType<typeof launch> | undefined;
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        active = launch(root, 'start');
        await waitReady(active);
        const status = await command(root, 'status');
        assert.equal(status.code, 0, status.output);
        assert.equal((await fetch('http://127.0.0.1:3000')).status, 200);
        assert.deepEqual(await (await fetch('http://127.0.0.1:3000/api/auth')).json(), {
          setup: false,
          signedIn: false,
        });
        assert.equal((await fetch('http://127.0.0.1:3000/api/data')).status, 401);
        assert.equal((await command(root, 'start')).code, 1, 'duplicate start refused');
        // Real production API and startup instrumentation, not a fake server.
        let productivity: any;
        for (let attempt = 0; attempt < 30; attempt++) {
          const response = await fetch('http://127.0.0.1:3000/api/productivity', { headers });
          assert.equal(response.status, 200);
          productivity = await response.json();
          if (productivity.notifications.length) break;
          await new Promise((done) => setTimeout(done, 100));
        }
        assert.ok(
          productivity.notifications.length,
          'server scheduler creates persisted reminders without a browser',
        );
        if (cycle === 0) {
          const todoResponse = await fetch('http://127.0.0.1:3000/api/productivity', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'todo.create',
              requestId: todoId,
              todo: { name: 'Preserved checklist item', dueDate: '2026-09-20' },
            }),
          });
          assert.equal(todoResponse.status, 200);
        } else {
          assert.equal(
            productivity.todos.find((row: any) => row.id === todoId)?.name,
            'Preserved checklist item',
            'to-do survives a production restart',
          );
        }
        if (cycle === 0) {
          let idleReplied = false;
          const idleObserver = fetch('http://127.0.0.1:3000/api/timer?cursor=none', {
            headers,
          }).then((r) => {
            idleReplied = true;
            return r;
          });
          await new Promise((done) => setTimeout(done, 100));
          assert.equal(idleReplied, false, 'idle production request waits for a transition');
          let response = await fetch('http://127.0.0.1:3000/api/productivity', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'timer.start',
              timer: {
                requestId: timerId,
                name: 'Production fixture study',
                mode: 'stopwatch',
                focusMinutes: 50,
                breakMinutes: 10,
                rounds: 1,
              },
            }),
          });
          assert.equal(response.status, 200);
          const started = await (await idleObserver).json();
          assert.equal(started.timer.status, 'running', 'idle second client sees a remote start');
          const observePause = fetch(
            'http://127.0.0.1:3000/api/timer?cursor=' + encodeURIComponent(started.cursor),
            { headers },
          );
          await new Promise((done) => setTimeout(done, 100));
          const changedAt = Date.now();
          response = await fetch('http://127.0.0.1:3000/api/productivity', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'timer.pause', id: timerId, revision: 0 }),
          });
          assert.equal(response.status, 200);
          const paused = await (await observePause).json();
          assert.equal(paused.timer.status, 'paused');
          assert.ok(
            Date.now() - changedAt < 2000,
            'production cross-client pause arrives within two seconds',
          );
        } else {
          assert.equal(productivity.timer.id, timerId);
          assert.equal(productivity.timer.status, 'paused');
        }

        // A connected visible client must not prevent safe maintenance shutdown.
        const watching = fetch(
          'http://127.0.0.1:3000/api/timer?cursor=' + encodeURIComponent(timerId + ':1'),
          { headers },
        )
          .then(async (r) => {
            await r.arrayBuffer();
            return r.status;
          })
          .catch(() => null);
        await new Promise((done) => setTimeout(done, 100));
        const stop = await command(root, 'stop');
        const waitingStatus = await watching;
        assert.ok(
          waitingStatus === 503 || waitingStatus === null,
          'waiting timer connection closes during shutdown',
        );
        assert.equal(stop.code, 0, stop.output + '\n' + active.output());
        assert.equal(await active.exited, 143, 'Next production shutdown completes');
      }
      const saved = new DatabaseSync(join(root, 'data/student.db'));
      assert.equal(
        saved.prepare('SELECT name FROM Task WHERE id=?').get('preserve-task')!.name,
        'Existing academic record',
      );
      assert.equal(
        saved.prepare('SELECT passwordHash FROM User').get()!.passwordHash,
        'fixture-password-hash-SECRET',
      );
      assert.equal(
        saved.prepare("SELECT id FROM Session WHERE id='fixture-session-SECRET'").get()!.id,
        'fixture-session-SECRET',
      );
      assert.equal(saved.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
      assert.equal(saved.prepare('SELECT count(*) AS n FROM Task').get()!.n, 1, 'no demo seeding');
      saved.close();
      assert.equal(readFileSync(join(root, 'backups/keep.json'), 'utf8'), 'existing backup');
      assert.equal(
        readFileSync(join(root, 'data/setup-token'), 'utf8'),
        'fixture-setup-token-SECRET',
      );
      assert.equal(
        readFileSync(join(root, '.env'), 'utf8'),
        `DATABASE_URL=${JSON.stringify(databaseUrl)}\n`,
      );
      assert.doesNotMatch((await command(root, 'logs')).output + active!.output(), /SECRET/);
    } finally {
      if (active && active.child.exitCode === null) await command(root, 'stop');
      rmSync(root, { recursive: true, force: true });
    }
  },
);
