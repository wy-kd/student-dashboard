import { z } from 'zod';
import { validDate } from './validation';
export const planningTables = [
  'schedulingPreference',
  'availabilityWindow',
  'availabilityException',
  'commitment',
  'workEstimate',
  'scheduleBatch',
  'plannedWorkBlock',
] as const;
export const preferencesSchema = z
  .object({
    preferredMinutes: z.number().int().min(5).max(240),
    minimumMinutes: z.number().int().min(5).max(240),
    restMinutes: z.number().int().min(0).max(120),
    maxDailyMinutes: z.number().int().min(5).max(960).nullable(),
  })
  .strict()
  .refine(
    (x) => x.minimumMinutes <= x.preferredMinutes,
    'Minimum session length cannot exceed preferred length.',
  );
export const defaultPlanningPreferences = {
  preferredMinutes: 50,
  minimumMinutes: 20,
  restMinutes: 10,
  maxDailyMinutes: null as number | null,
};
export const windowSchema = z
  .object({
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine(
    (x) => x.endTime > x.startTime,
    'Availability must end after it starts. Split overnight availability between days.',
  );
export const availabilitySchema = z
  .object({
    revision: z.number().int().nonnegative(),
    preferences: preferencesSchema,
    windows: z
      .array(
        z
          .object({
            day: z.number().int().min(0).max(6),
            startTime: z.string(),
            endTime: z.string(),
          })
          .strict()
          .superRefine((x, ctx) => {
            const r = windowSchema.safeParse({ startTime: x.startTime, endTime: x.endTime });
            if (!r.success)
              ctx.addIssue({ code: 'custom', message: 'Enter a valid availability interval.' });
          }),
      )
      .max(100),
    exceptions: z
      .array(
        z
          .object({
            date: z.string().refine((x) => x.length === 10 && validDate(x)),
            windows: z.array(windowSchema).max(20),
          })
          .strict(),
      )
      .max(366),
  })
  .strict()
  .superRefine((x, ctx) => {
    if (new Set(x.exceptions.map((e) => e.date)).size !== x.exceptions.length)
      ctx.addIssue({ code: 'custom', message: 'Only one exception per date is allowed.' });
    for (const day of Array.from({ length: 7 }, (_, i) => i)) {
      const windows = x.windows
        .filter((w) => w.day === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (windows.some((w, i) => i > 0 && w.startTime < windows[i - 1].endTime))
        ctx.addIssue({ code: 'custom', message: 'Availability windows cannot overlap.' });
    }
    for (const exception of x.exceptions) {
      const windows = [...exception.windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (windows.some((w, i) => i > 0 && w.startTime < windows[i - 1].endTime))
        ctx.addIssue({ code: 'custom', message: 'Exception windows cannot overlap.' });
    }
  });
export type PlanningState = {
  taskRecordedMinutes?: Record<string, number>;
  preference: any;
  windows: any[];
  exceptions: any[];
  commitments: any[];
  estimates: any[];
  blocks: any[];
  batches: any[];
};
