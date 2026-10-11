import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaults } from '../lib/model';
const directory = mkdtempSync(join(tmpdir(), 'student-v23-data-'));
process.env.DATABASE_URL = 'file:' + join(directory, 'test.db');
const sqlite = new DatabaseSync(join(directory, 'test.db'));
for (const name of readdirSync(resolve('prisma/migrations'))
  .filter((x) => /^\d/.test(x))
  .sort())
  sqlite.exec(readFileSync(resolve('prisma/migrations', name, 'migration.sql'), 'utf8'));
sqlite.close();
const { db } = await import('../lib/db');
const { saveRow, deleteRow, snapshot } = await import('../lib/service');
test('Missing record diagnosis: stale deletion rejects without affecting a different current task', async () => {
  const deleted = await saveRow('task', { ...defaults('task'), name: 'Removed elsewhere' });
  const other = await saveRow('task', { ...defaults('task'), name: 'Current record' });
  await deleteRow('task', deleted.id, deleted.revision);
  await assert.rejects(
    deleteRow('task', deleted.id, deleted.revision),
    (e) => (e as any).status === 404 && /Record not found/.test((e as Error).message),
  );
  assert.equal((await snapshot()).task.find((t) => t.id === other.id)?.name, 'Current record');
});
test.after(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});
