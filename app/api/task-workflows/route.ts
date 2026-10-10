import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sameOrigin, jsonBody, errorResponse } from '@/lib/auth';
import { saveAssignmentBreakdown, convertTodoToTask } from '@/lib/task-workflows';
import { AppError } from '@/lib/service';
import { reconcileReminders } from '@/lib/reminders';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const session = await requireAuth(req);
    const { action, ...input } = await jsonBody(req);
    let result;
    if (action === 'assignment.breakdown') result = await saveAssignmentBreakdown(input);
    else if (action === 'todo.convert') result = await convertTodoToTask(session.userId, input);
    else throw new AppError('Choose a task workflow.');
    await reconcileReminders(session.userId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
