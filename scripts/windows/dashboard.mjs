// One process owns both the private control channel and the production server.
// No detached children, PID-based kills, custom HTTP routes or process manager.
import { createServer, createConnection } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  realpathSync,
  statSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const require = createRequire(join(root, 'package.json'));
const stateFile = join(root, 'data', 'startup-control.json');
const logFile = join(root, 'logs', 'startup.log');
// Fixed across repositories and Windows logon sessions: only one managed port-3000
// instance can migrate/start at a time. Windows releases a pipe when its owner exits.
// Non-Windows test runners use a loopback-only control socket with the same lifetime.
const controlPath =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\student-dashboard-production-3000'
    : { host: '127.0.0.1', port: 33000, exclusive: true };
const output = process.stdout.write.bind(process.stdout);
const say = (message) => output(message + '\n');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function log(message) {
  // Callers supply fixed diagnostic text/numbers only. Never record child output,
  // request bodies, environment values, control credentials or exception objects.
  const line = `${new Date().toISOString()} ${message}`;
  appendFileSync(logFile, line + '\n', { mode: 0o600 });
  say(line);
}

async function portIsFree() {
  const probe = createServer();
  return new Promise((done) => {
    probe.once('error', () => done(false));
    probe.listen({ port: 3000, host: '0.0.0.0', exclusive: true }, () =>
      probe.close(() => done(true)),
    );
  });
}

async function healthy() {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/auth', {
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    });
    if (!response.ok) return false;
    const body = await response.json();
    return typeof body.setup === 'boolean' && body.signedIn === false;
  } catch {
    return false;
  }
}

function control(action, state = readState()) {
  return new Promise((done, reject) => {
    if (!state?.token) return done(null);
    const socket = createConnection(controlPath);
    let buffer = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('Control timeout')));
    socket.once('connect', () =>
      socket.write(JSON.stringify({ action, token: state.token, root }) + '\n'),
    );
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 4096) socket.destroy(new Error('Invalid control response'));
    });
    socket.once('end', () => {
      try {
        done(JSON.parse(buffer));
      } catch {
        reject(new Error('Invalid control response'));
      }
    });
    socket.once('error', (error) => {
      if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) done(null);
      else reject(error);
    });
  });
}

async function start() {
  process.chdir(root);
  mkdirSync(join(root, 'logs'), { recursive: true });
  let phase = 'checking';
  let ownsControl = false;
  let stopping = false;
  const token = randomBytes(32).toString('hex');
  const channel = createServer((socket) => {
    let buffer = '';
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 4096) return socket.destroy();
      if (!buffer.includes('\n')) return;
      try {
        const request = JSON.parse(buffer);
        const supplied = Buffer.from(request.token ?? '');
        if (
          request.root !== root ||
          supplied.length !== token.length ||
          !timingSafeEqual(supplied, Buffer.from(token))
        )
          return socket.end('{"denied":true}\n');
        if (request.action === 'status')
          socket.end(JSON.stringify({ phase, pid: process.pid }) + '\n');
        else if (request.action === 'stop') {
          socket.end('{"accepted":true}\n');
          requestStop();
        } else socket.end('{"denied":true}\n');
      } catch {
        socket.destroy();
      }
    });
  });

  function requestStop() {
    if (stopping) return;
    stopping = true;
    log('Stop requested; waiting for startup/in-flight requests. No forced termination.');
    if (phase === 'ready') {
      phase = 'stopping';
      // Windows process.kill() is abrupt. Emit inside this process so Next.js's
      // own SIGTERM handler drains HTTP requests and closes the server normally.
      process.emit('SIGTERM', 'SIGTERM');
    }
  }

  process.on('exit', (code) => {
    if (!ownsControl) return;
    try {
      log(`Process exited during ${phase} (code ${code}).`);
      if (readState()?.token === token) rmSync(stateFile, { force: true });
    } catch {
      /* Never replace the original exit status with a logging failure. */
    }
  });

  try {
    await new Promise((done, reject) => {
      channel.once('error', reject);
      channel.listen(controlPath, done);
    });
    ownsControl = true;
    if (existsSync(logFile) && statSync(logFile).size > 1_000_000) {
      rmSync(logFile + '.1', { force: true });
      renameSync(logFile, logFile + '.1');
    }
    log('Production startup requested.');
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('node');
    if (!existsSync(join(root, '.next', 'BUILD_ID'))) throw new Error('build');
    if (!existsSync(join(root, '.env')) || !existsSync(join(root, 'data', 'student.db')))
      throw new Error('database');
    if (!(await portIsFree())) throw new Error('port');

    // Load the same production env files as Next and pass that selection to Prisma.
    process.env.NODE_ENV = 'production';
    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(root, false, { info() {}, error() {} });
    const url = process.env.DATABASE_URL ?? '';
    try {
      if (!url.startsWith('file:')) throw new Error();
      // Windows can spell one file with a short (8.3) path, a long path or
      // different letter casing. Compare filesystem identity, not path strings.
      const selected = statSync(resolve(root, 'prisma', url.slice(5)), { bigint: true });
      const expected = statSync(join(root, 'data', 'student.db'), { bigint: true });
      if (
        !selected.isFile() ||
        selected.dev !== expected.dev ||
        selected.ino !== expected.ino ||
        expected.size === 0n
      )
        throw new Error();
    } catch {
      throw new Error('database');
    }
    process.env.NEXT_TELEMETRY_DISABLED = '1';
    delete process.env.NEXT_MANUAL_SIG_HANDLE;
    writeFileSync(stateFile, JSON.stringify({ token }), { mode: 0o600 });

    phase = 'migrating';
    log('Applying existing checked-in migrations (migrate deploy only).');
    const setup = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'setup.mjs'), '--unattended'],
      {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
        windowsHide: true,
        // Capture only to extract Prisma's public error code; never write raw output.
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 2_000_000,
      },
    );
    if (setup.status !== 0) {
      const prismaCode = `${setup.stdout ?? ''}\n${setup.stderr ?? ''}`.match(/\bP\d{4}\b/)?.[0];
      log(
        `Migration failed (exit ${setup.status ?? 1}${prismaCode ? ', ' + prismaCode : ''}). See README troubleshooting.`,
      );
      process.exit(1);
    }
    if (stopping) process.exit(0);
    phase = 'starting';
    log('Starting the existing production build on 0.0.0.0:3000.');

    // Logs deliberately contain lifecycle events only. Framework/app stdout could
    // include request data or secrets in future versions, so do not persist it.
    const discard = (_chunk, encoding, callback) => {
      const done = typeof encoding === 'function' ? encoding : callback;
      if (done) queueMicrotask(done);
      return true;
    };
    process.stdout.write = discard;
    process.stderr.write = discard;
    const { nextStart } = require('next/dist/cli/next-start');
    // This is the entry point used by `next start`, not a custom Next HTTP server.
    await nextStart({ port: 3000, hostname: '0.0.0.0' }, root);
    if (!(await healthy())) throw new Error('health');
    phase = 'ready';
    log(`Ready: production HTTP and database check passed (PID ${process.pid}).`);
    if (stopping) {
      phase = 'stopping';
      process.emit('SIGTERM', 'SIGTERM');
    }
  } catch (error) {
    if (!ownsControl) {
      say(
        'Another managed startup is active, or the local control channel is unavailable. Run status; no migrations were run.',
      );
      process.exitCode = 1;
      return;
    }
    const diagnostics = {
      node: 'Node.js 24 or later is required.',
      build: 'Production build missing. Stop the app, then run npm run build.',
      database:
        'Existing local database/configuration missing or mismatched. Nothing was provisioned. Check .env and data/student.db.',
      port: 'Port 3000 is occupied or unavailable. Stop the existing server yourself; no process was killed and no migrations ran.',
      health:
        'Production HTTP/database check failed. Review installation and migration status before restarting.',
    };
    log(
      diagnostics[error.message] ??
        `Startup failed during ${phase}. Check installation, permissions and README troubleshooting.`,
    );
    // Before Next starts, no application requests exist. After startup, use its
    // own drain handler rather than forcing an exit during a database operation.
    if (process.listenerCount('SIGTERM') > 0) {
      phase = 'stopping';
      process.emit('SIGTERM', 'SIGTERM');
    } else process.exit(1);
  }
}

async function main() {
  const action = process.argv[2] ?? 'status';
  if (action === 'start') return start();
  if (action === 'logs') {
    if (!existsSync(logFile))
      return say('No startup log yet. Task launch failures appear in Task Scheduler History.');
    say(readFileSync(logFile, 'utf8').trim().split('\n').slice(-80).join('\n'));
    return;
  }
  if (!['status', 'stop'].includes(action)) throw new Error('Unknown command');
  const state = readState();
  const status = await control('status', state);
  if (!status || status.denied) {
    const free = await portIsFree();
    say(
      free
        ? 'Stopped: no managed dashboard and port 3000 is free.'
        : 'No matching managed dashboard. Port 3000 is occupied/unavailable; nothing will be stopped. Check the original terminal/process.',
    );
    process.exitCode = action === 'stop' && free ? 0 : 1;
    return;
  }
  if (action === 'status') {
    const ok = status.phase === 'ready' && (await healthy());
    say(
      `Managed dashboard: ${status.phase}, PID ${status.pid}. HTTP/database check: ${ok ? 'OK' : 'not ready'}.`,
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (!(await control('stop', state))?.accepted) throw new Error('Stop not accepted');
  say('Graceful stop requested. Waiting up to 60 seconds; no forced kill will be used.');
  for (let i = 0; i < 60; i++) {
    await pause(1000);
    if (!(await control('status', state))) {
      const free = await portIsFree();
      say(
        free
          ? 'Stopped. Port 3000 is free; maintenance can proceed.'
          : 'Managed process exited, but port 3000 is occupied. Do not begin maintenance yet.',
      );
      process.exitCode = free ? 0 : 1;
      return;
    }
  }
  say(
    'Still draining/starting. Do not update or copy SQLite yet. Wait, check status and retry stop.',
  );
  process.exitCode = 1;
}

main().catch(() => {
  say(
    'Dashboard control failed. Check Node.js, repository permissions and Task Scheduler History. A timeout does not mean the app stopped.',
  );
  process.exitCode = 1;
});
