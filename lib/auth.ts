import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { AppError } from './service';
export const hashToken = (s: string) => createHash('sha256').update(s).digest('hex');
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (
    !origin ||
    new URL(origin).host !== req.headers.get('host') ||
    req.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new AppError('Request blocked. Open the app directly and try again.', 403);
  if (!req.headers.get('content-type')?.includes('application/json'))
    throw new AppError('Expected a JSON request.', 415);
}
export async function requireAuth(req: NextRequest) {
  const token = req.cookies.get('student_session')?.value;
  if (!token) throw new AppError('Please sign in.', 401);
  const session = await db.session.findUnique({ where: { id: hashToken(token) } });
  if (!session || session.expiresAt < Date.now())
    throw new AppError('Your session expired. Please sign in.', 401);
  return session;
}
export async function jsonBody(req: NextRequest) {
  if (Number(req.headers.get('content-length') ?? 0) > 5_000_000)
    throw new AppError('This file is too large (maximum 5 MB).', 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 5_000_000)
    throw new AppError('This file is too large (maximum 5 MB).', 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError('Invalid JSON.');
  }
}
export function errorResponse(e: any) {
  if (e.name === 'ZodError')
    return NextResponse.json(
      { error: e.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n') },
      { status: 400 },
    );
  if (e.code === 'P2002')
    return NextResponse.json(
      { error: 'A record with that subject code or assessment grade already exists.' },
      { status: 409 },
    );
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('Request failed:', e.code ?? e.name);
  return NextResponse.json(
    { error: 'Something went wrong. Please retry. Your saved data has not been removed.' },
    { status: 500 },
  );
}
export async function authenticate(req: NextRequest) {
  sameOrigin(req);
  const body = await jsonBody(req);
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 200)
    throw new AppError('Use a password between 10 and 200 characters.');
  const user = await db.user.findUnique({ where: { id: 'owner' } });
  if (!user) {
    let token = '';
    try {
      token = readFileSync('data/setup-token', 'utf8').trim();
    } catch {}
    if (
      !token ||
      typeof body.setupToken !== 'string' ||
      hashToken(body.setupToken) !== hashToken(token)
    )
      throw new AppError('Enter the first-time setup token shown in your laptop terminal.', 403);
    await db.user.create({ data: { id: 'owner', passwordHash: hashPassword(body.password) } });
    await db.setting.upsert({ where: { id: 'settings' }, create: { id: 'settings' }, update: {} });
  } else {
    if (user.lockedUntil > Date.now())
      throw new AppError('Too many attempts. Try again in 15 minutes.', 429);
    if (!checkPassword(body.password, user.passwordHash)) {
      const updated = await db.user.update({
        where: { id: 'owner' },
        data: { failedAttempts: { increment: 1 } },
      });
      if (updated.failedAttempts >= 5)
        await db.user.update({
          where: { id: 'owner' },
          data: { lockedUntil: Date.now() + 15 * 60 * 1000, failedAttempts: 0 },
        });
      throw new AppError('Incorrect password.', 401);
    }
    await db.user.update({ where: { id: 'owner' }, data: { failedAttempts: 0, lockedUntil: 0 } });
  }
  const token = randomBytes(32).toString('hex');
  await db.session.deleteMany({ where: { expiresAt: { lt: Date.now() } } });
  await db.session.create({
    data: { id: hashToken(token), userId: 'owner', expiresAt: Date.now() + 30 * 86400000 },
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('student_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.headers.get('origin')?.startsWith('https://') ?? false,
    path: '/',
    maxAge: 30 * 86400,
  });
  return res;
}
