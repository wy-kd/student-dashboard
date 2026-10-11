export type InboxState = { state?: string; snoozedUntil?: number | null };
export function actionableInbox<T extends InboxState>(items: T[], now: number) {
  return items.filter(
    (item) =>
      !item.state ||
      item.state === 'pending' ||
      (item.state === 'snoozed' && (item.snoozedUntil ?? Infinity) <= now),
  );
}
export const defaultInboxReview = { revision: 0, frequency: 'off', time: '18:00', weekday: 1 };
