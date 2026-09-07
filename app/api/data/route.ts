import { reconcileReminders } from '@/lib/reminders';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sameOrigin, jsonBody, errorResponse } from '@/lib/auth';
import { snapshot, saveRow, deleteRow, saveSettings } from '@/lib/service';
import { entitySchema } from '@/lib/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    return NextResponse.json(await snapshot(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const session = await requireAuth(req);
    const b = await jsonBody(req);
    if (b.entity === 'setting') await saveSettings(b.data);
    else await saveRow(entitySchema.parse(b.entity), b.data, b.id, b.revision);
    await reconcileReminders(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req);
    const session = await requireAuth(req);
    const b = await jsonBody(req);
    await deleteRow(entitySchema.parse(b.entity), b.id, b.revision);
    await reconcileReminders(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
