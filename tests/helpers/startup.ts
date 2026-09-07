import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';

export function launch(root: string, action: string) {
  const script = join(root, 'scripts', 'windows', 'dashboard');
  const windows = process.platform === 'win32';
  const child = spawn(
    windows ? 'powershell.exe' : process.execPath,
    windows
      ? [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script + '.ps1',
          '-Action',
          action,
          '-NodePath',
          process.execPath,
        ]
      : [script + '.mjs', action],
    {
      // Deliberately outside the repository, like an unconfigured scheduled task.
      cwd: resolve(root, '..'),
      windowsHide: true,
      env: { ...process.env, DATABASE_URL: 'file:' + join(root, 'data', 'student.db') },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const exited = once(child, 'exit').then(([code]) => code as number);
  return { child, exited, output: () => output };
}

export async function command(root: string, action: string) {
  const run = launch(root, action);
  const code = await run.exited;
  return { code, output: run.output() };
}

export async function waitReady(run: ReturnType<typeof launch>) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (run.output().includes('Ready: production')) return;
    if (run.child.exitCode !== null) throw new Error('Startup failed: ' + run.output());
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Startup did not become ready: ' + run.output());
}
