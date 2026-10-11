import { db } from './db';
import { defaultPlanningPreferences, planningTables, type PlanningState } from './planning-model';
export async function planningSnapshot(client: any = db, userId = 'owner'): Promise<PlanningState> {
  const rows = await Promise.all(
    planningTables.map((name) =>
      client[name].findMany({
        where: { userId },
        orderBy: name === 'schedulingPreference' ? { userId: 'asc' } : { id: 'asc' },
      }),
    ),
  );
  const recorded = await client.studyTimer.findMany({
    where: { userId, taskId: { not: null }, sessionId: { not: null } },
    select: { taskId: true, sessionId: true, session: { select: { actualHours: true } } },
  });
  const manual = await client.plannedWorkBlock.findMany({
    where: { userId, taskId: { not: null }, sessionId: { not: null } },
    select: { taskId: true, sessionId: true, session: { select: { actualHours: true } } },
  });
  const taskRecordedMinutes: Record<string, number> = {};
  const counted = new Set<string>();
  for (const timer of [...recorded, ...manual])
    if (timer.taskId && timer.session && !counted.has(timer.sessionId!)) {
      taskRecordedMinutes[timer.taskId] =
        (taskRecordedMinutes[timer.taskId] ?? 0) + timer.session.actualHours * 60;
      counted.add(timer.sessionId!);
    }
  return {
    taskRecordedMinutes,
    preference: rows[0][0] ?? { userId, revision: 0, ...defaultPlanningPreferences },
    windows: rows[1],
    exceptions: rows[2].map((e: any) => ({ ...e, windows: JSON.parse(e.windows) })),
    commitments: rows[3],
    estimates: rows[4],
    batches: rows[5].map(({ payload, ...row }: any) => row),
    blocks: rows[6],
  };
}
export async function exportPlanning(client: any) {
  return Object.fromEntries(
    await Promise.all(planningTables.map(async (name) => [name, await client[name].findMany()])),
  );
}
export async function clearPlanning(client: any) {
  for (const name of [...planningTables].reverse()) await client[name].deleteMany();
}
