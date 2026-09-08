import { addDays, dayNumber, weekday } from './calculations';
export function nextOccurrence(r: any, from: string): string | null {
  for (let i = 0; i <= 366 * 2; i++) {
    const date = addDays(from, i);
    if (r.endDate && date > r.endDate) return null;
    if (date < r.anchor) continue;
    const offset = dayNumber(date) - dayNumber(r.anchor);
    if (
      r.weekdays
        ? r.weekdays.split(',').includes(String(weekday(date))) &&
          Math.floor((offset + ((weekday(r.anchor) + 6) % 7)) / 7) % r.weekInterval === 0
        : offset % r.intervalDays === 0
    )
      return date;
  }
  return null;
}
export function recurrenceDescription(r: {
  weekdays: string;
  weekInterval: number;
  intervalDays: number;
}) {
  if (r.weekdays) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${r.weekdays
      .split(',')
      .map((d) => days[Number(d)])
      .join(', ')} · every ${r.weekInterval === 1 ? 'week' : r.weekInterval + ' weeks'}`;
  }
  return r.intervalDays === 1
    ? 'Daily'
    : r.intervalDays === 7
      ? 'Weekly'
      : r.intervalDays === 14
        ? 'Fortnightly'
        : `Every ${r.intervalDays} days`;
}
