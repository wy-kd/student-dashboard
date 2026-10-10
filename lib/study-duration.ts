/** Review presentation: never modifies authoritative timer millisecond accounting. */
export function studyDurationParts(focusMs: number) {
  const total = Math.round(focusMs / 60000);
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}
export function studyDurationMinutes(hours: string, minutes: string): number {
  if (!/^\d+$/.test(hours) || !/^\d+$/.test(minutes))
    throw new Error('Enter whole numbers in both Hours and Minutes.');
  const h = Number(hours),
    m = Number(minutes);
  if (!Number.isSafeInteger(h) || h > 24) throw new Error('Hours must be between 0 and 24.');
  if (!Number.isSafeInteger(m) || m > 59) throw new Error('Minutes must be between 0 and 59.');
  const total = h * 60 + m;
  if (total > 1440) throw new Error('Actual study time cannot exceed 24 hours.');
  // The existing timer.save validation permits zero; preserve that behaviour.
  return total;
}
