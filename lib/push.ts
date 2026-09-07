import { readFileSync } from 'node:fs';
import { z } from 'zod';
import webpush from 'web-push';
import { db } from './db';
import { AppError } from './service';
// Browser-issued HTTPS endpoints only. Never send to a user-supplied arbitrary server/LAN URL.
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      (u.hostname === 'fcm.googleapis.com' ||
        u.hostname === 'updates.push.services.mozilla.com' ||
        u.hostname === 'web.push.apple.com' ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))
    );
  } catch {
    return false;
  }
}
export function vapidConfig() {
  try {
    return z
      .object({
        publicKey: z.string().regex(/^[\w-]{87}$/),
        privateKey: z.string().regex(/^[\w-]{43}$/),
        subject: z.string().startsWith('mailto:'),
      })
      .parse(JSON.parse(readFileSync('data/vapid.json', 'utf8')));
  } catch {
    return null;
  }
}
export async function subscriptionAction(userId: string, b: any, origin: string) {
  if (b.action === 'push.remove') {
    await db.pushSubscription.deleteMany({
      where: { id: z.string().max(100).parse(b.id), userId },
    });
    return;
  }
  if (b.action === 'push.unsubscribe') {
    await db.pushSubscription.deleteMany({
      where: { endpoint: z.string().max(4096).parse(b.endpoint), userId, origin },
    });
    return;
  }
  if (b.action !== 'push.subscribe') throw new AppError('Unknown push action.');
  if (!vapidConfig()) throw new AppError('Set up local push keys on your laptop first.');
  if (!origin.startsWith('https://'))
    throw new AppError('Enable notifications using your private HTTPS address.');
  const s = z
    .object({
      endpoint: z.string().max(4096).refine(validPushEndpoint, 'Unsupported push service.'),
      keys: z.object({
        p256dh: z.string().regex(/^[\w-]{87}$/),
        auth: z.string().regex(/^[\w-]{22}$/),
      }),
    })
    .parse(b.subscription);
  if (
    (await db.pushSubscription.count({ where: { userId } })) >= 20 &&
    !(await db.pushSubscription.findUnique({ where: { endpoint: s.endpoint } }))
  )
    throw new AppError('Remove an old device before adding another.');
  return db.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: {
      userId,
      endpoint: s.endpoint,
      ...s.keys,
      origin,
      name: z.string().trim().min(1).max(80).parse(b.name),
      createdAt: Date.now(),
    },
    update: { ...s.keys, origin, name: z.string().trim().min(1).max(80).parse(b.name) },
  });
}
export async function deliverPush(
  userId: string,
  preference: any,
  now = Date.now(),
  send = webpush.sendNotification,
) {
  const config = vapidConfig();
  if (!config) return;
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  const notifications = await db.notification.findMany({
    where: { userId, dismissed: false, readAt: null, createdAt: { gte: now - 86400000 } },
    take: 100,
  });
  const existing = new Set(
    (
      await db.pushDelivery.findMany({
        where: { notificationId: { in: notifications.map((n) => n.id) }, subscription: { userId } },
        select: { notificationId: true, subscriptionId: true },
      })
    ).map((x) => x.notificationId + ':' + x.subscriptionId),
  );
  for (const n of notifications)
    for (const s of subscriptions)
      if (n.createdAt >= s.createdAt && !existing.has(n.id + ':' + s.id))
        await db.pushDelivery.upsert({
          where: { notificationId_subscriptionId: { notificationId: n.id, subscriptionId: s.id } },
          create: { notificationId: n.id, subscriptionId: s.id, nextAttempt: now },
          update: {},
        });
  const queue = await db.pushDelivery.findMany({
    where: {
      deliveredAt: null,
      nextAttempt: { lte: now },
      attempts: { lt: 5 },
      subscription: { userId },
      notification: { dismissed: false, readAt: null, createdAt: { gte: now - 86400000 } },
    },
    include: { notification: true, subscription: true },
    take: 10,
  });
  for (const job of queue) {
    // Persist a lease before network IO. A restart retries an abandoned lease after five minutes.
    const lease = await db.pushDelivery.updateMany({
      where: {
        id: job.id,
        nextAttempt: job.nextAttempt,
        deliveredAt: null,
        notification: { readAt: null, dismissed: false },
      },
      data: { attempts: { increment: 1 }, nextAttempt: now + 300000 },
    });
    if (!lease.count) continue;
    if (!validPushEndpoint(job.subscription.endpoint)) continue;
    const reminder = await db.reminder.findUnique({
      where: { id: job.notification.reminderId ?? '' },
    });
    if (job.notification.reminderId && !reminder) continue;
    if (reminder) {
      const kind = reminder.kind as 'task' | 'assignment' | 'exam' | 'studySession',
        id = (reminder as any)[kind + 'Id'];
      const row = await (db[kind] as any).findUnique({ where: { id } });
      if (
        !row ||
        row.status === 'Completed' ||
        row.status === 'Submitted' ||
        row.completed ||
        row.dueAt !== reminder.dueAt
      )
        continue;
    }
    const n = job.notification,
      payload = {
        title: preference.privatePush ? 'Student Dashboard' : n.title,
        body: preference.privatePush ? 'A university reminder needs your attention.' : n.message,
        tag: n.id,
        url: '/notifications',
      };
    try {
      await send(
        {
          endpoint: job.subscription.endpoint,
          keys: { p256dh: job.subscription.p256dh, auth: job.subscription.auth },
        },
        JSON.stringify(payload),
        {
          vapidDetails: config,
          TTL: 3600,
          timeout: 5000,
          topic: n.id.replace(/[^\w-]/g, '').slice(0, 32),
        },
      );
      await db.pushDelivery.updateMany({
        where: { id: job.id },
        data: { deliveredAt: Date.now() },
      });
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410)
        await db.pushSubscription.deleteMany({
          where: { id: job.subscriptionId },
        }); /* Never log endpoints, subscription keys, bodies or transport errors. */
    }
  }
}
