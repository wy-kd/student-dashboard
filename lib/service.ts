import { db } from './db';
import { entities, fields, type Entity, type Data, defaults } from './model';
import { schemaFor, settingSchema } from './validation';
import { civilNow } from './calculations';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function snapshot(client: any = db): Promise<Data> {
  const rows = await Promise.all(
    entities.map((e) => client[e].findMany({ orderBy: { id: 'asc' } })),
  );
  const setting = (await client.setting.findUnique({ where: { id: 'settings' } })) ?? {
    name: 'Darrel',
    timezone: 'Australia/Brisbane',
    dailyHours: 3,
    activeSemesterId: null,
  };
  return { ...Object.fromEntries(entities.map((e, i) => [e, rows[i]])), setting } as Data;
}
export async function validateRelations(client: any, entity: Entity, row: any, id?: string) {
  for (const f of fields[entity])
    if (
      f.relation &&
      row[f.key] &&
      !(await client[f.relation].findUnique({ where: { id: row[f.key] } }))
    )
      throw new AppError(`${f.label} no longer exists. Refresh and choose another.`);
  if (row.assignmentId || row.examId) {
    const parent = row.assignmentId
      ? await client.assignment.findUnique({ where: { id: row.assignmentId } })
      : await client.exam.findUnique({ where: { id: row.examId } });
    if ('subjectId' in row) {
      if (row.subjectId && parent.subjectId !== row.subjectId)
        throw new AppError('The subject must match the selected assessment.');
      row.subjectId = parent.subjectId;
    }
  }
  if ((entity === 'assignment' || entity === 'exam') && row.subjectId) {
    const a = await client.assignment.findMany({ where: { subjectId: row.subjectId } }),
      e = await client.exam.findMany({ where: { subjectId: row.subjectId } });
    if (
      [...a, ...e].filter((x) => x.id !== id).reduce((s, x) => s + x.weighting, 0) + row.weighting >
      100.00001
    )
      throw new AppError('Total assignment and exam weightings for a subject cannot exceed 100%.');
    if (id) {
      const children = await client.task.findMany({ where: { [entity + 'Id']: id } });
      const sessions = await client.studySession.findMany({ where: { [entity + 'Id']: id } });
      if ([...children, ...sessions].some((x) => x.subjectId && x.subjectId !== row.subjectId))
        throw new AppError(
          'Unlink related tasks and study sessions before changing this assessment’s subject.',
        );
    }
  }
  if (entity === 'subject' && id) {
    const old = await client.subject.findUnique({ where: { id } });
    if (
      old.semesterId !== row.semesterId &&
      (await client.class.count({ where: { subjectId: id } })) > 0
    )
      throw new AppError('Remove recurring classes before moving a subject to another semester.');
  }
}
export async function saveRow(entity: Entity, input: any, id?: string, revision?: number) {
  const row: any = schemaFor(entity).parse(input);
  return db.$transaction(async (tx) => {
    const client = tx as any;
    if (id) {
      const old = await client[entity].findUnique({ where: { id } });
      if (!old) throw new AppError('This record was deleted on another device.', 404);
      if (old.revision !== revision)
        throw new AppError(
          'This record changed on another device. Refresh before editing again.',
          409,
        );
    }
    await validateRelations(client, entity, row, id);
    if (entity === 'task') {
      const setting = await tx.setting.findUnique({ where: { id: 'settings' } });
      const old = id ? await tx.task.findUnique({ where: { id } }) : null;
      row.completedAt =
        row.status === 'Completed' ? (old?.completedAt ?? civilNow(setting?.timezone)) : null;
    }
    return id
      ? client[entity].update({
          where: { id },
          data: { ...row, demo: false, revision: { increment: 1 } },
        })
      : client[entity].create({ data: row });
  });
}
export async function deleteRow(entity: Entity, id: string, revision: number) {
  return db.$transaction(async (tx) => {
    const client = tx as any;
    const row = await client[entity].findUnique({ where: { id } });
    if (!row) throw new AppError('Record not found.', 404);
    if (row.revision !== revision)
      throw new AppError('This record changed. Refresh before deleting.', 409);
    try {
      await client[entity].delete({ where: { id } });
    } catch (e: any) {
      if (e.code === 'P2003')
        throw new AppError(
          'This record has linked records. Delete or unlink its tasks, milestones, grades, classes and sessions first.',
        );
      throw e;
    }
    if (entity === 'semester')
      await tx.setting.updateMany({
        where: { activeSemesterId: id },
        data: { activeSemesterId: null },
      });
  });
}
export async function saveSettings(input: any) {
  const row = settingSchema.parse(input);
  if (
    row.activeSemesterId &&
    !(await db.semester.findUnique({ where: { id: row.activeSemesterId } }))
  )
    throw new AppError('Choose an existing semester.');
  return db.setting.upsert({
    where: { id: 'settings' },
    create: { id: 'settings', ...row },
    update: row,
  });
}
export function cleanInput(entity: Entity, row: any) {
  return Object.fromEntries(
    fields[entity].map((f) => [f.key, row[f.key] ?? defaults(entity)[f.key]]),
  );
}
