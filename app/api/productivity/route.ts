import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sameOrigin, jsonBody, errorResponse } from '@/lib/auth';
import { productivityAction, productivitySnapshot } from '@/lib/productivity';
import { subscriptionAction, vapidConfig } from '@/lib/push';
import { reconcileReminders } from '@/lib/reminders';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const s = await requireAuth(req);
    return NextResponse.json(
      {
        ...(await productivitySnapshot(s.userId)),
        pushPublicKey: vapidConfig()?.publicKey ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const s = await requireAuth(req),
      b = await jsonBody(req);
    if (typeof b.action === 'string' && b.action.startsWith('push.'))
      await subscriptionAction(s.userId, b, req.headers.get('origin')!);
    else await productivityAction(s.userId, b);
    await reconcileReminders(s.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
