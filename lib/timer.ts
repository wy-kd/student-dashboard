import type { StudyTimer } from '@prisma/client';
// This pure projection works on the server and every device. A stopped browser cannot add rounds.
export function timerView(t: StudyTimer, now = Date.now()) {
  const elapsed =
    t.elapsedMs +
    (t.status === 'running' && t.segmentAt != null ? Math.max(0, now - t.segmentAt) : 0);
  const limit = (t.phase === 'break' ? t.breakMinutes : t.focusMinutes) * 60_000;
  const timed = t.mode === 'countdown' || t.phase === 'break';
  const elapsedMs = timed ? Math.min(limit, elapsed) : elapsed;
  return {
    elapsedMs,
    remainingMs: timed ? Math.max(0, limit - elapsedMs) : null,
    complete: timed && elapsed >= limit,
    totalFocusMs: t.focusMs + (t.phase === 'focus' ? elapsedMs : 0),
  };
}
export function clockText(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000)),
    h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
