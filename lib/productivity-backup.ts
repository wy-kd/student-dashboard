import { Prisma } from '@prisma/client';
import { inboxReviewSchema } from './inbox-actions';
import { todoSchema } from './todos';
import { z } from 'zod';
import { AppError } from './service';
import { layoutSchema } from './dashboard-layout';
import { preferenceSchema, recurrenceSchema } from './productivity';
// Ordered by foreign-key dependency. Device endpoints/keys and delivery leases are deliberately
// excluded from portable backups; a stopped copy of data/ preserves those installation secrets.
export const productivityTables = [
  'preference',
  'inboxItem',
  'inboxReviewPreference',
  'todoItem',
  'recurrence',
  'taskOccurrence',
  'studyTimer',
  'reminderRule',
  'reminder',
  'notification',
] as const;
export async function exportProductivity(client: any) {
  return Object.fromEntries(
    await Promise.all(
      productivityTables.map(async (name) => [name, await client[name].findMany()]),
    ),
  );
}
export function parseProductivity(input: any) {
  if (!input) throw new AppError('Missing V2 productivity records in backup.');
  const parsed: any = {};
  let count = 0;
  for (const name of productivityTables) {
    const records =
      ['todoItem', 'inboxReviewPreference'].includes(name) && input[name] === undefined
        ? []
        : input[name];
    if (!Array.isArray(records)) throw new AppError('Missing V2 backup table: ' + name);
    count += records.length;
    if (count > 20000) throw new AppError('V2 backup exceeds 20,000 records.');
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name.toLowerCase() === name.toLowerCase(),
    )!;
    const fields: any = {};
    for (const field of model.fields.filter((f) => f.kind !== 'object')) {
      let type: any =
        field.type === 'Boolean'
          ? z.boolean()
          : field.type === 'Int'
            ? z.number().int()
            : field.type === 'Float'
              ? z.number().finite()
              : z.string().max(field.name === 'layout' ? 20000 : 2000);
      if (!field.isRequired) type = type.nullable();
      fields[field.name] = type;
    }
    const schema = z.object(fields).strict(),
      ids = new Set();
    parsed[name] = records.map((raw: any) => {
      const compatible =
        name === 'inboxItem'
          ? {
              revision: 0,
              state: 'pending',
              snoozedUntil: null,
              processedType: null,
              processedId: null,
              processedRequestId: null,
              ...raw,
            }
          : raw;
      const row: any = schema.parse(compatible),
        id = row.id ?? row.userId;
      if (ids.has(id)) throw new AppError('Duplicate V2 backup ID.');
      ids.add(id);
      if (row.userId && row.userId !== 'owner')
        throw new AppError('V2 backup must belong to this single-owner workspace.');
      if (name === 'inboxItem') {
        if (
          !['pending', 'snoozed', 'archived', 'processed'].includes(row.state) ||
          row.revision < 0 ||
          !row.name.trim() ||
          row.name.length > 500 ||
          row.createdAt < 0 ||
          (row.snoozedUntil !== null && row.snoozedUntil < 0)
        )
          throw new AppError('Invalid Inbox capture in backup.');
        if (row.state === 'snoozed' && row.snoozedUntil === null)
          throw new AppError('Snoozed capture is missing a review time.');
        if (
          row.state === 'processed' &&
          (!['task', 'todo'].includes(row.processedType) || !row.processedId)
        )
          throw new AppError('Converted capture is missing provenance.');
        row.revision++;
      }
      if (name === 'inboxReviewPreference') {
        inboxReviewSchema.parse({ frequency: row.frequency, time: row.time, weekday: row.weekday });
        if (row.revision < 0) throw new AppError('Invalid Inbox review revision.');
        row.revision++;
      }
      if (name === 'todoItem') {
        todoSchema.parse({ name: row.name, dueDate: row.dueDate });
        if (row.position < 0 || row.revision < 0)
          throw new AppError('Invalid to-do order or revision.');
        row.revision++;
      }
      if (name === 'reminderRule') {
        if (
          !['assignment', 'exam', 'task', 'studySession'].includes(row.kind) ||
          row.leadMinutes < 0 ||
          row.leadMinutes > 525600
        )
          throw new AppError('Invalid reminder rule in backup.');
      }
      if (name === 'reminder') {
        if (
          !['assignment', 'exam', 'task', 'studySession'].includes(row.kind) ||
          !['pending', 'delivered', 'superseded'].includes(row.state) ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.dueAt)
        )
          throw new AppError('Invalid reminder in backup.');
        const links = ['assignmentId', 'examId', 'taskId', 'studySessionId'].filter((k) => row[k]);
        if (links.length !== 1 || links[0] !== row.kind + 'Id')
          throw new AppError('Invalid reminder relationship in backup.');
      }
      if (
        name === 'notification' &&
        !['Deadline', 'Exam', 'Task', 'Study', 'Workload', 'System'].includes(row.category)
      )
        throw new AppError('Invalid notification category in backup.');
      if (name === 'taskOccurrence' && !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
        throw new AppError('Invalid recurrence date in backup.');
      if (name === 'preference') {
        const { userId, revision, layout, ...p } = row;
        preferenceSchema.parse(p);
        layoutSchema.parse(JSON.parse(layout));
        row.revision++;
      }
      if (name === 'recurrence') {
        const { id, userId, revision, nextDate, ...r } = row;
        recurrenceSchema.parse(r);
        row.revision++;
      }
      if (name === 'studyTimer') {
        if (
          !['countdown', 'stopwatch'].includes(row.mode) ||
          !['running', 'paused', 'review', 'saved', 'cancelled'].includes(row.status) ||
          !['focus', 'break', 'review'].includes(row.phase) ||
          row.focusMinutes < 1 ||
          row.focusMinutes > 240 ||
          row.breakMinutes < 0 ||
          row.breakMinutes > 120 ||
          row.round < 1 ||
          row.round > row.rounds ||
          row.rounds > 12 ||
          row.elapsedMs < 0 ||
          row.focusMs < 0 ||
          (!['saved', 'cancelled'].includes(row.status) && row.activeKey !== 'owner')
        )
          throw new AppError('Invalid timer in backup.');
        if (['saved', 'cancelled'].includes(row.status) && row.activeKey !== null)
          throw new AppError('Finished timer cannot remain active.');
        row.revision++;
      }
      return row;
    });
  }
  return parsed;
}
export async function clearProductivity(client: any) {
  for (const name of [...productivityTables].reverse()) await client[name].deleteMany();
}
export async function restoreProductivity(client: any, parsed: any) {
  if (!parsed) return;
  for (const name of productivityTables)
    for (const row of parsed[name]) await client[name].create({ data: row });
}
