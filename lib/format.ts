/** Display civil dates without interpreting them in the browser's timezone. Storage stays ISO. */
const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const timeFormatter = new Intl.DateTimeFormat('en-AU', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});
export function formatDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return '—';
  const day = value.slice(0, 10),
    date = new Date(day + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
    ? dateFormatter.format(date)
    : '—';
}
export function formatTime(value?: string | null) {
  const time = value?.includes('T') ? value.split('T')[1] : value;
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return '—';
  return timeFormatter
    .format(new Date('2000-01-01T' + time + ':00Z'))
    .replace(/\s+/g, ' ')
    .toUpperCase();
}
export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return formatDate(value) + (value.includes('T') ? ' · ' + formatTime(value) : '');
}
export function formatTimestamp(value: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return formatDateTime(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
}
/** Display old generated reminder copy consistently without rewriting saved notifications. */
export function formatReminderMessage(message: string) {
  return message.replace(
    /^(Due |Starts )(\d{4}-\d{2}-\d{2})(?:T| · )(\d{2}:\d{2})$/,
    (_all, prefix, date, time) => prefix + formatDateTime(date + 'T' + time),
  );
}
