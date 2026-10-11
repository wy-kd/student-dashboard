import test from 'node:test';
import assert from 'node:assert/strict';
import {
  instant,
  civilAt,
  civilRange,
  dayInterval,
  mergeIntervals,
  subtractIntervals,
  overlaps,
  intervalMinutes,
} from '../lib/planning-time';
test('Half-open interval arithmetic merges occupied overlaps without double subtraction', () => {
  assert.deepEqual(
    mergeIntervals([
      { start: 5, end: 15 },
      { start: 10, end: 20 },
      { start: 20, end: 25 },
    ]),
    [{ start: 5, end: 25 }],
  );
  assert.deepEqual(
    subtractIntervals(
      [{ start: 0, end: 30 }],
      [
        { start: 5, end: 15 },
        { start: 10, end: 20 },
      ],
    ),
    [
      { start: 0, end: 5 },
      { start: 20, end: 30 },
    ],
  );
  assert.equal(overlaps({ start: 0, end: 5 }, { start: 5, end: 10 }), false);
  assert.deepEqual(subtractIntervals([{ start: 10, end: 20 }], [{ start: 0, end: 30 }]), []);
});
test('Configured timezone conversion ignores process timezone and preserves midnight/overnight ranges', () => {
  const start = instant('2026-10-11T23:00', 'Australia/Brisbane');
  assert.equal(new Date(start).toISOString(), '2026-10-11T13:00:00.000Z');
  assert.equal(civilAt(start, 'Australia/Brisbane'), '2026-10-11T23:00');
  assert.equal(
    intervalMinutes(civilRange('2026-10-11T23:00', '2026-10-12T01:00', 'Australia/Brisbane')),
    120,
  );
  assert.equal(intervalMinutes(dayInterval('2026-10-11', 'Australia/Brisbane')), 1440);
  assert.throws(() => instant('2026-02-30T12:00', 'Australia/Brisbane'));
});
test('DST missing/ambiguous local times and 23/25 hour days are explicit', () => {
  assert.throws(() => instant('2026-10-04T02:30', 'Australia/Sydney'), /does not exist/);
  const early = instant('2026-04-05T02:30', 'Australia/Sydney'),
    late = instant('2026-04-05T02:30', 'Australia/Sydney', 'later');
  assert.equal(late - early, 3600000);
  assert.equal(intervalMinutes(dayInterval('2026-10-04', 'Australia/Sydney')), 1380);
  assert.equal(intervalMinutes(dayInterval('2026-04-05', 'Australia/Sydney')), 1500);
  assert.equal(
    civilAt(instant('2026-10-11T12:00', 'Asia/Kathmandu'), 'Asia/Kathmandu'),
    '2026-10-11T12:00',
  );
});
