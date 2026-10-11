import { addDays, civilNow } from './civil';
import { validDate } from './validation';
export type Interval = { start: number; end: number };
export const minute = 60000;
/** Half-open ranges merge before subtraction, so overlapping commitments count once. */
export function mergeIntervals(input: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const item of input
    .filter((x) => Number.isFinite(x.start) && x.end > x.start)
    .map((x) => ({ ...x }))
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else result.push(item);
  }
  return result;
}
export function subtractIntervals(available: Interval[], occupied: Interval[]): Interval[] {
  const busy = mergeIntervals(occupied),
    result: Interval[] = [];
  for (const slot of mergeIntervals(available)) {
    let start = slot.start;
    for (const event of busy) {
      if (event.end <= start || event.start >= slot.end) continue;
      if (event.start > start) result.push({ start, end: Math.min(slot.end, event.start) });
      start = Math.max(start, event.end);
      if (start >= slot.end) break;
    }
    if (start < slot.end) result.push({ start, end: slot.end });
  }
  return result;
}
export function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}
export function intervalMinutes(x: Interval) {
  return (x.end - x.start) / minute;
}
export function civilAt(stamp: number, timezone: string) {
  return civilNow(timezone, new Date(stamp));
}
/** Reject non-existent DST wall times. Ambiguous times use the explicitly chosen earlier/later occurrence. */
export function instant(
  civil: string,
  timezone: string,
  ambiguity: 'earlier' | 'later' = 'earlier',
): number {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(civil) || !validDate(civil))
    throw Error('Enter a valid date and time.');
  const desired = Date.parse(civil + 'Z'),
    offsets = new Set<number>();
  // Probe both sides of any nearby transition; supports non-hour offsets and transitions.
  for (const hours of [-48, -24, -12, 0, 12, 24, 48]) {
    const probe = desired + hours * 3600000;
    offsets.add(Date.parse(civilAt(probe, timezone) + 'Z') - probe);
  }
  const candidates = [...offsets]
    .map((offset) => desired - offset)
    .filter((stamp) => civilAt(stamp, timezone) === civil)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw Error('This local time does not exist in the configured timezone. Choose another time.');
  return ambiguity === 'later' ? candidates.at(-1)! : candidates[0];
}
export function dayInterval(date: string, timezone: string): Interval {
  return {
    start: instant(date + 'T00:00', timezone),
    end: instant(addDays(date, 1) + 'T00:00', timezone),
  };
}
export function civilRange(start: string, end: string, timezone: string): Interval {
  const result = { start: instant(start, timezone), end: instant(end, timezone, 'later') };
  if (result.end <= result.start) throw Error('End must follow start.');
  return result;
}
