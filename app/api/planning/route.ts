import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sameOrigin, jsonBody, errorResponse } from '@/lib/auth';
import { planningSnapshot } from '@/lib/planning-store';
import { planningAction } from '@/lib/planning-actions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const s = await requireAuth(req);
    return NextResponse.json(await planningSnapshot(undefined, s.userId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const s = await requireAuth(req),
      b = await jsonBody(req);
    return NextResponse.json({ ok: true, result: await planningAction(s.userId, b) });
  } catch (e) {
    return errorResponse(e);
  }
}
