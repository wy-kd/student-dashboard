import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticate, errorResponse, requireAuth, sameOrigin } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const setup = !(await db.user.findUnique({ where: { id: 'owner' } }));
  let signedIn = false;
  try {
    await requireAuth(req);
    signedIn = true;
  } catch {}
  return NextResponse.json({ setup, signedIn }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: NextRequest) {
  try {
    return await authenticate(req);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req);
    const s = await requireAuth(req);
    await db.session.delete({ where: { id: s.id } });
    const r = NextResponse.json({ ok: true });
    r.cookies.delete('student_session');
    return r;
  } catch (e) {
    return errorResponse(e);
  }
}
