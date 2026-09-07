import { db } from './db';
import { reconcileReminders } from './reminders';
import { deliverPush } from './push';
const shared = globalThis as unknown as { studentScheduler?: ReturnType<typeof setTimeout> };
export function startScheduler() {
  if (shared.studentScheduler) return;
  const run = async () => {
    try {
      const owner = await db.user.findUnique({ where: { id: 'owner' }, select: { id: true } });
      if (owner) {
        const { quiet, preference } = await reconcileReminders(owner.id);
        if (!quiet) await deliverPush(owner.id, preference);
      }
    } catch {
      /* A temporary DB/network failure retries next minute. Never log private data. */
    } finally {
      shared.studentScheduler = setTimeout(run, 60000);
      shared.studentScheduler.unref();
    }
  };
  shared.studentScheduler = setTimeout(run, 1000);
  shared.studentScheduler.unref();
}
