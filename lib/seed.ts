import { db } from './db';
import { civilNow, addDays, weekday } from './calculations';
import { exportOrder, saveBackup } from './backup';
export async function seedDemo() {
  return db.$transaction(
    async (tx) => {
      if (await tx.semester.findUnique({ where: { id: 'demo-semester' } })) return;
      const today = civilNow().slice(0, 10),
        start = addDays(today, -35),
        end = addDays(today, 70);
      const c = tx as any;
      async function add(e: string, id: string, data: any) {
        await c[e].create({ data: { id: 'demo-' + id, demo: true, ...data } });
      }
      await add('semester', 'semester', {
        name: 'Semester 2 · Demo',
        startDate: start,
        endDate: end,
        teachingStart: start,
        teachingWeeks: 13,
        examStart: addDays(today, 56),
        examEnd: end,
        notes: 'Illustrative data only. Replace with your official university dates.',
      });
      const subjects = [
        ['security', 'IFB240', 'Cyber Security', '#6366f1'],
        ['programming', 'CAB201', 'Programming Principles', '#0ea5e9'],
        ['systems', 'IFB220', 'Business Analysis', '#f59e0b'],
      ];
      for (const [id, code, name, color] of subjects)
        await add('subject', id, {
          code,
          name,
          color,
          semesterId: 'demo-semester',
          lecturer: 'Example lecturer',
          notes: 'Demo subject. Check your actual unit details.',
        });
      await add('assignment', 'report', {
        name: 'Security risk report',
        subjectId: 'demo-security',
        weighting: 35,
        dueAt: addDays(today, 4) + 'T23:59',
        releaseDate: addDays(today, -14),
        estimatedHours: 18,
        priority: 'High',
        difficulty: 4,
        status: 'In Progress',
        description: 'Analyse a security vulnerability and its impact on information assets.',
        notes: 'Read the rubric before your final review.',
      });
      await add('assignment', 'code', {
        name: 'Programming project',
        subjectId: 'demo-programming',
        weighting: 40,
        dueAt: addDays(today, 10) + 'T17:00',
        releaseDate: addDays(today, -7),
        estimatedHours: 24,
        priority: 'High',
        difficulty: 4,
        status: 'Planning',
      });
      await add('assignment', 'journey', {
        name: 'Candidate journey map',
        subjectId: 'demo-systems',
        weighting: 30,
        dueAt: addDays(today, 12) + 'T23:59',
        releaseDate: addDays(today, -10),
        estimatedHours: 12,
        status: 'In Progress',
        progress: 35,
      });
      await add('assignment', 'quiz', {
        name: 'Foundations quiz',
        subjectId: 'demo-security',
        weighting: 25,
        dueAt: addDays(today, -10) + 'T15:00',
        estimatedHours: 4,
        status: 'Submitted',
        progress: 100,
      });
      await add('grade', 'quiz-grade', { assignmentId: 'demo-quiz', score: 19, maximum: 25 });
      const tasks = [
        ['brief', 'Read the assignment brief', 'Completed', -4, 1],
        ['rubric', 'Analyse the marking rubric', 'Completed', -3, 1],
        ['research', 'Research the vulnerability', 'In Progress', 0, 4],
        ['write', 'Write the risk analysis', 'Not Started', 1, 6],
        ['references', 'Check sources and references', 'Not Started', 2, 2],
        ['review', 'Proofread against the rubric', 'Not Started', 3, 2],
      ];
      for (const [id, name, status, delta, hours] of tasks)
        await add('task', String(id), {
          name,
          status,
          assignmentId: 'demo-report',
          subjectId: 'demo-security',
          dueAt: addDays(today, Number(delta)) + 'T18:00',
          estimatedHours: hours,
          completedAt: status === 'Completed' ? addDays(today, Number(delta)) + 'T16:00' : null,
        });
      await add('task', 'weekly', {
        name: 'Finish this week’s programming exercises',
        subjectId: 'demo-programming',
        dueAt: today + 'T19:00',
        estimatedHours: 2,
        priority: 'High',
      });
      await add('task', 'overdue', {
        name: 'Review tutorial feedback',
        subjectId: 'demo-systems',
        dueAt: addDays(today, -1) + 'T17:00',
        estimatedHours: 0.5,
      });
      await add('milestone', 'draft', {
        name: 'Draft complete',
        assignmentId: 'demo-report',
        dueAt: addDays(today, 2) + 'T18:00',
      });
      await add('milestone', 'final', {
        name: 'Final rubric review',
        assignmentId: 'demo-report',
        dueAt: addDays(today, 3) + 'T18:00',
      });
      for (const [id, subject, days, weight] of [
        ['security-exam', 'security', 28, 40],
        ['programming-exam', 'programming', 32, 60],
        ['systems-exam', 'systems', 30, 70],
      ]) {
        await add('exam', String(id), {
          name: 'Final exam',
          subjectId: 'demo-' + subject,
          dueAt: addDays(today, Number(days)) + 'T09:00',
          weighting: weight,
          location: 'Campus · room to confirm',
          estimatedHours: 20,
        });
        for (const [i, name] of [
          'Core concepts',
          'Tutorial questions',
          'Timed mock exam',
        ].entries())
          await add('examTopic', `${id}-${i}`, {
            examId: 'demo-' + id,
            name,
            status: i === 0 ? 'Revising' : 'Not Started',
            kind: i === 2 ? 'Mock exam' : 'Topic',
          });
      }
      for (const [i, [id, , name]] of subjects.entries())
        await add('class', id + '-class', {
          subjectId: 'demo-' + id,
          name,
          day: (weekday(today) + i) % 7,
          startTime: i === 0 ? '10:00' : '14:00',
          endTime: i === 0 ? '12:00' : '16:00',
          startDate: start,
          endDate: addDays(today, 50),
          kind: i === 0 ? 'Lecture' : 'Tutorial',
          location: 'Gardens Point · demo room',
        });
      await add('studySession', 'study-today', {
        name: 'Risk report research',
        subjectId: 'demo-security',
        assignmentId: 'demo-report',
        dueAt: today + 'T14:00',
        plannedHours: 1.5,
      });
      await add('studySession', 'study-done', {
        name: 'Programming practice',
        subjectId: 'demo-programming',
        dueAt: addDays(today, -1) + 'T16:00',
        plannedHours: 2,
        actualHours: 1.75,
        completed: true,
      });
      await add('importantDate', 'break', {
        name: 'Mid-semester break',
        semesterId: 'demo-semester',
        kind: 'Break',
        dueAt: addDays(today, 14) + 'T00:00',
        endDate: addDays(today, 20),
      });
      await add('weeklyContent', 'content', {
        subjectId: 'demo-security',
        name: 'Authentication and access control',
        week: 6,
        notes: 'Review lecture notes and complete the tutorial.',
      });
      await tx.setting.upsert({
        where: { id: 'settings' },
        create: { id: 'settings', activeSemesterId: 'demo-semester' },
        update: { activeSemesterId: 'demo-semester' },
      });
    },
    { timeout: 30000 },
  );
}
export async function clearDemo() {
  await saveBackup();
  let removed = 0,
    retained = 0;
  for (const e of [...exportOrder].reverse()) {
    const c = db as any;
    const rows = await c[e].findMany({ where: { demo: true } });
    for (const r of rows)
      try {
        if (['subject', 'assignment', 'exam', 'task'].includes(e)) {
          const timerLinks = await db.studyTimer.count({ where: { [e + 'Id']: r.id } });
          const recurrenceLinks = ['subject', 'assignment'].includes(e)
            ? await db.recurrence.count({ where: { [e + 'Id']: r.id } })
            : 0;
          if (timerLinks || recurrenceLinks) {
            retained++;
            continue;
          }
        }
        await c[e].delete({ where: { id: r.id } });
        removed++;
      } catch (error: any) {
        if (error.code === 'P2003') {
          retained++;
        } else throw error;
      }
  }
  const setting = await db.setting.findUnique({ where: { id: 'settings' } });
  if (
    setting?.activeSemesterId &&
    !(await db.semester.findUnique({ where: { id: setting.activeSemesterId } }))
  )
    await db.setting.update({ where: { id: 'settings' }, data: { activeSemesterId: null } });
  return { removed, retained };
}
