import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';
import { timerCursor, watchTimer, timerServerDraining } from '@/lib/timer-events';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (timerServerDraining()) return stoppingResponse();
    // Subscribe before reading so a transition cannot fall between the read and the wait.
    const watch = watchTimer(session.userId, req.signal);
    try {
      let timer = await db.studyTimer.findUnique({ where: { activeKey: session.userId } });
      if (req.nextUrl.searchParams.get('cursor') === timerCursor(timer)) {
        await watch.changed;
        if (timerServerDraining()) return stoppingResponse();
        // A held request must not return private data after logout/session expiry.
        await requireAuth(req);
        timer = await db.studyTimer.findUnique({ where: { activeKey: session.userId } });
      }
      return NextResponse.json(
        { timer, cursor: timerCursor(timer), serverNow: Date.now() },
        {
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    } finally {
      watch.close();
    }
  } catch (e) {
    return errorResponse(e);
  }
}

function stoppingResponse() {
  // End the waiting HTTP connection promptly so Next can finish its normal drain.
  return NextResponse.json(
    { error: 'Dashboard is stopping.' },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store', Connection: 'close' },
    },
  );
}
