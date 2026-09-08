// Shared by Next route bundles in the existing Node process. No timer data is cached here.
import { EventEmitter } from 'node:events';
type Channel = { events: EventEmitter; draining: boolean; registered?: boolean };
const globals = globalThis as typeof globalThis & { studentTimerChannel?: Channel };
const channel = (globals.studentTimerChannel ??= {
  events: new EventEmitter().setMaxListeners(0),
  draining: false,
});
export function drainTimerWaits() {
  channel.draining = true;
  channel.events.emit('shutdown');
}
export const timerServerDraining = () => channel.draining;
export const announceTimerChange = (userId: string) => {
  channel.events.emit('user:' + userId);
};
export function watchTimer(userId: string, signal: AbortSignal, timeoutMs = 25000) {
  // Release only our read-only waits. Next.js still owns server/DB draining and process exit.
  if (!channel.registered) {
    channel.registered = true;
    process.once('SIGTERM', drainTimerWaits);
    process.once('SIGINT', drainTimerWaits);
  }
  let finish!: () => void;
  const changed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const timer = setTimeout(finish, timeoutMs);
  channel.events.on('user:' + userId, finish);
  channel.events.on('shutdown', finish);
  signal.addEventListener('abort', finish, { once: true });
  if (signal.aborted || channel.draining) finish();
  return {
    changed,
    close() {
      clearTimeout(timer);
      channel.events.off('user:' + userId, finish);
      channel.events.off('shutdown', finish);
      signal.removeEventListener('abort', finish);
    },
  };
}
export function timerCursor(timer: { id: string; revision: number } | null) {
  return timer ? `${timer.id}:${timer.revision}` : 'none';
}
