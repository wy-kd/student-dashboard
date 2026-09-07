import { z } from 'zod';
export const widgetNames = {
  next: 'What should I work on?',
  today: 'Today',
  timer: 'Study timer',
  upcoming: 'Upcoming deadlines',
  alerts: 'Alerts',
  classes: "Today's classes",
  tasks: 'Tasks',
  assignments: 'Assignment progress',
  exams: 'Exams',
  calendar: 'Calendar',
  semester: 'Semester progress',
  hours: 'Study hours',
  workload: 'Workload forecast',
  grades: 'Grades',
  quick: 'Quick Add',
  weekly: 'Weekly summary',
} as const;
export type WidgetId = keyof typeof widgetNames;
export type Breakpoint = 'desktop' | 'tablet' | 'mobile';
const widgetSchema = z
  .object({
    id: z.enum(Object.keys(widgetNames) as [WidgetId, ...WidgetId[]]),
    width: z.number().int().min(1).max(12),
    height: z.number().int().min(1).max(4),
    hidden: z.boolean(),
  })
  .strict();
export const layoutSchema = z
  .object({
    desktop: z.array(widgetSchema).max(16),
    tablet: z.array(widgetSchema).max(16),
    mobile: z.array(widgetSchema).max(16),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const bp of ['desktop', 'tablet', 'mobile'] as const) {
      if (new Set(v[bp].map((x) => x.id)).size !== v[bp].length)
        ctx.addIssue({ code: 'custom', message: 'Widgets must be unique.', path: [bp] });
      if (
        v[bp].some(
          (x) =>
            (bp !== 'mobile' && x.width < 3) ||
            x.width > (bp === 'desktop' ? 12 : bp === 'tablet' ? 6 : 1),
        )
      )
        ctx.addIssue({ code: 'custom', message: 'Width exceeds layout columns.', path: [bp] });
    }
  });
export type Layout = z.infer<typeof layoutSchema>;
export function defaultLayout(): Layout {
  return Object.fromEntries(
    (['desktop', 'tablet', 'mobile'] as const).map((bp) => [
      bp,
      (
        (bp === 'mobile'
          ? Object.keys(widgetNames)
          : [
              'next',
              'timer',
              'today',
              'upcoming',
              ...Object.keys(widgetNames).filter(
                (id) => !['next', 'timer', 'today', 'upcoming'].includes(id),
              ),
            ]) as WidgetId[]
      ).map((id) => ({
        id,
        width:
          bp === 'desktop' ? (id === 'next' || id === 'today' ? 7 : 5) : bp === 'tablet' ? 3 : 1,
        height: 2,
        hidden: !['next', 'today', 'timer', 'upcoming', 'alerts'].includes(id),
      })),
    ]),
  ) as Layout;
}
export function readLayout(raw?: string): Layout {
  try {
    return layoutSchema.parse(JSON.parse(raw || ''));
  } catch {
    return defaultLayout();
  }
}
export function moveWidget(layout: Layout, bp: Breakpoint, id: WidgetId, delta: number): Layout {
  const rows = [...layout[bp]],
    i = rows.findIndex((x) => x.id === id),
    j = Math.min(rows.length - 1, Math.max(0, i + delta));
  if (i < 0) return layout;
  const [row] = rows.splice(i, 1);
  rows.splice(j, 0, row);
  return { ...layout, [bp]: rows };
}
