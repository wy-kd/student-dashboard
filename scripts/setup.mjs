import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
mkdirSync('data', { recursive: true });
if (!existsSync('.env'))
  writeFileSync('.env', 'DATABASE_URL="file:../data/student.db"\n', { mode: 0o600 });
function prisma(args) {
  const r = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    stdio: 'inherit',
    env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (process.argv.includes('--install')) prisma(['generate']);
prisma(['migrate', 'deploy']);
if (!existsSync('data/setup-token'))
  writeFileSync('data/setup-token', randomBytes(18).toString('hex'), { mode: 0o600 });
if (!process.argv.includes('--install') && !process.argv.includes('--unattended'))
  console.log(
    '\nOpen http://localhost:3000\nFirst-time setup token (only used before a password is set): ' +
      readFileSync('data/setup-token', 'utf8') +
      '\nKeep the laptop awake for access from other devices.\n',
  );
