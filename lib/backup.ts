import { mkdirSync, writeFileSync } from 'node:fs';
import { db } from './db';
import { snapshot, cleanInput, validateRelations, AppError } from './service';
import { entities, type Entity } from './model';
import { schemaFor, settingSchema } from './validation';
export const exportOrder: Entity[] = [
  'semester',
  'subject',
  'assignment',
  'exam',
  'task',
  'milestone',
  'examTopic',
  'class',
  'studySession',
  'grade',
  'importantDate',
  'weeklyContent',
];
export async function exportBackup() {
  return db.$transaction(async (tx) => ({
    format: 'student-dashboard',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: await snapshot(tx),
  }));
}
export async function saveBackup() {
  const backup = await exportBackup();
  mkdirSync('backups', { recursive: true });
  const path = `backups/student-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2), { mode: 0o600 });
  return path;
}
export async function restoreBackup(input: any) {
  if (input?.format !== 'student-dashboard' || input.version !== 1 || !input.data)
    throw new AppError('This is not a supported Student Dashboard backup.');
  const data = input.data;
  const parsed: any = {};
  let count = 0;
  for (const e of entities) {
    if (!Array.isArray(data[e])) throw new AppError(`Backup is missing ${e} records.`);
    count += data[e].length;
    if (count > 20000) throw new AppError('Backup exceeds the 20,000 record limit.');
    const ids = new Set();
    parsed[e] = data[e].map((r: any) => {
      if (typeof r.id !== 'string' || !r.id || r.id.length > 100 || ids.has(r.id))
        throw new AppError(`Invalid or duplicate ${e} ID.`);
      ids.add(r.id);
      const row: any = schemaFor(e).parse(cleanInput(e, r));
      if (e === 'task') {
        const v = r.completedAt;
        if (v != null && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)))
          throw new AppError('Invalid task completion date.');
        row.completedAt = v ?? null;
      }
      return {
        id: r.id,
        ...row,
        demo: r.demo === true,
        revision: Number.isInteger(r.revision) && r.revision >= 0 ? r.revision + 1 : 1,
      };
    });
  }
  const setting = settingSchema.parse({
    name: data.setting.name,
    timezone: data.setting.timezone,
    dailyHours: data.setting.dailyHours,
    activeSemesterId: data.setting.activeSemesterId ?? null,
  });
  if (
    setting.activeSemesterId &&
    !parsed.semester.some((s: any) => s.id === setting.activeSemesterId)
  )
    throw new AppError('Active semester is missing from the backup.');
  await saveBackup();
  await db.$transaction(
    async (tx) => {
      const c = tx as any;
      const current = await snapshot(tx);
      for (const e of entities)
        for (const row of parsed[e]) {
          const previous = current[e].find((r) => r.id === row.id);
          if (previous) row.revision = Math.max(row.revision, previous.revision + 1);
        }
      for (const e of [...exportOrder].reverse()) await c[e].deleteMany();
      for (const e of exportOrder)
        for (const row of parsed[e]) {
          await validateRelations(c, e, row);
          await c[e].create({ data: row });
        }
      await tx.setting.upsert({
        where: { id: 'settings' },
        create: { id: 'settings', ...setting },
        update: setting,
      });
    },
    { timeout: 60000 },
  );
}
export function toCsv(data: any[]) {
  if (!data.length) return '';
  const keys = Object.keys(data[0]);
  const cell = (v: any) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    '\uFEFF' +
    [keys.map(cell).join(','), ...data.map((r) => keys.map((k) => cell(r[k])).join(','))].join(
      '\r\n',
    )
  );
}
