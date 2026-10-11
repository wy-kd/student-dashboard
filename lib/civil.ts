export function civilNow(timezone = 'Australia/Brisbane', date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function dayNumber(s: string) {
  return Date.parse(s.slice(0, 10) + 'T00:00:00Z') / 86400000;
}
export function addDays(s: string, n: number) {
  return new Date((dayNumber(s) + n) * 86400000).toISOString().slice(0, 10);
}
export const weekday = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00Z').getUTCDay();
