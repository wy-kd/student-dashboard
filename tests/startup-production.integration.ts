// Run after npm run build. Never starts the app against the developer's database.
import test from 'node:test';
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
    seed.close();
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
        const stop = await command(root, 'stop');
        assert.equal(stop.code, 0, stop.output);
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
      assert.equal(saved.prepare('SELECT id FROM Session').get()!.id, 'fixture-session-SECRET');
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
