import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from './service';
import {
  planningTables,
  preferencesSchema,
  windowSchema,
  availabilitySchema,
  defaultPlanningPreferences,
} from './planning-model';
import { validDate } from './validation';
export function parsePlanning(input: any) {
  if (!input) throw new AppError('Missing V2.3 scheduling data.');
  const parsed: any = {};
  let count = 0;
  for (const name of planningTables) {
    if (!Array.isArray(input[name])) throw new AppError('Missing V2.3 backup table: ' + name);
    count += input[name].length;
    if (count > 20000) throw new AppError('Scheduling backup exceeds 20,000 records.');
    const model = Prisma.dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === name.toLowerCase(),
      )!,
      shape: any = {};
    for (const f of model.fields.filter((f) => f.kind !== 'object')) {
      let rule: any =
        f.type === 'Boolean'
          ? z.boolean()
          : f.type === 'Int'
            ? z.number().int().nonnegative()
            : f.type === 'Float'
              ? z.number().finite().nonnegative()
              : z.string().max(f.name === 'payload' ? 500000 : f.name === 'windows' ? 5000 : 500);
      if (!f.isRequired) rule = rule.nullable();
      shape[f.name] = rule;
    }
    const schema = z.object(shape).strict(),
      ids = new Set();
    parsed[name] = input[name].map((raw: any) => {
      const row: any = schema.parse(raw),
        id = row.id ?? row.userId;
      if (!id || ids.has(id)) throw new AppError('Duplicate/invalid scheduling ID.');
      ids.add(id);
      if (row.userId !== 'owner')
        throw new AppError('Scheduling backup must belong to the single owner.');
      if (name === 'schedulingPreference') {
        const { userId, revision, ...value } = row;
        preferencesSchema.parse(value);
      }
      if (name === 'availabilityWindow') {
        if (row.day > 6) throw new AppError('Invalid availability day.');
        windowSchema.parse({ startTime: row.startTime, endTime: row.endTime });
      }
      if (name === 'availabilityException') {
        if (row.date.length !== 10 || !validDate(row.date))
          throw new AppError('Invalid exception date.');
        z.array(windowSchema).max(20).parse(JSON.parse(row.windows));
      }
      if (
        name === 'workEstimate' &&
        (!/^(task|assignment|exam):[^:]+$/.test(row.workKey) || row.minutes > 600000)
      )
        throw new AppError('Invalid remaining estimate.');
      if (name === 'commitment' || name === 'plannedWorkBlock') {
        if (!row.name.trim() || row.endAt <= row.startAt || row.endAt > 253402300799999)
          throw new AppError('Invalid planning interval.');
      }
      if (name === 'plannedWorkBlock') {
        if (
          !['planned', 'reviewed', 'dismissed'].includes(row.state) ||
          !['manual', 'suggested'].includes(row.origin)
        )
          throw new AppError('Invalid planned block state.');
        if (row.assignmentId && row.examId)
          throw new AppError('A planned block cannot link both assessment types.');
      }
      if (name === 'scheduleBatch') {
        if (
          !['approved', 'undone', 'restored'].includes(row.state) ||
          !/^[a-f0-9]{64}$/.test(row.requestHash)
        )
          throw new AppError('Invalid scheduling batch.');
        const payload = JSON.parse(row.payload);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
          throw new AppError('Invalid scheduling batch payload.');
        // Restore invalidates old undo baselines; current records may have new revisions.
        row.state = 'restored';
      }
      if ('revision' in row) row.revision++;
      return row;
    });
  }
  const pref = parsed.schedulingPreference[0];
  availabilitySchema.parse({
    revision: pref?.revision ?? 0,
    preferences: pref
      ? {
          preferredMinutes: pref.preferredMinutes,
          minimumMinutes: pref.minimumMinutes,
          restMinutes: pref.restMinutes,
          maxDailyMinutes: pref.maxDailyMinutes,
        }
      : defaultPlanningPreferences,
    windows: parsed.availabilityWindow.map(({ day, startTime, endTime }: any) => ({
      day,
      startTime,
      endTime,
    })),
    exceptions: parsed.availabilityException.map((row: any) => ({
      date: row.date,
      windows: JSON.parse(row.windows),
    })),
  });
  return parsed;
}
export async function restorePlanning(client: any, parsed: any, previous: any) {
  if (!parsed) return;
  for (const name of planningTables)
    for (const row of parsed[name]) {
      const old = previous[name]?.find((x: any) => (x.id ?? x.userId) === (row.id ?? row.userId));
      if (old && 'revision' in row) row.revision = Math.max(row.revision, old.revision + 1);
      if (name === 'workEstimate') {
        const [entity, id] = row.workKey.split(':');
        if (!(await client[entity].findUnique({ where: { id } })))
          throw new AppError('Remaining estimate references missing work.');
      }
      if (name === 'plannedWorkBlock' && row.taskId) {
        const task = await client.task.findUnique({ where: { id: row.taskId } });
        if (
          !task ||
          (row.assignmentId && row.assignmentId !== task.assignmentId) ||
          (row.examId && row.examId !== task.examId)
        )
          throw new AppError('Invalid planning task relationship.');
      }
      await client[name].create({ data: row });
    }
}
