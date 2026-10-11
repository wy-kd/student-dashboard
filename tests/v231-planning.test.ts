import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewGroups, proposalTotals } from '../lib/planning-presentation';
import type { ScheduleProposal } from '../lib/planning-engine';
test('Review separates unknown estimates, real capacity shortfalls and passed deadlines without repeating reasons', () => {
  const proposal = {
    unscheduled: [
      { workKey: 'task:a', name: 'Unknown', minutes: null, reason: 'Remaining estimate unknown' },
      {
        workKey: 'task:b',
        name: 'Capacity',
        minutes: 90,
        reason: 'This work cannot fit before its deadline',
      },
      { workKey: 'task:c', name: 'Past', minutes: 60, reason: 'The effective deadline has passed' },
    ],
  } as ScheduleProposal;
  const result = reviewGroups(proposal);
  assert.equal(result.missing.length, 1);
  assert.equal(result.capacity.length, 1);
  assert.equal(result.deadlines.length, 1);
  assert.equal(result.unscheduledMinutes, 90);
  assert.equal(proposal.unscheduled.length, 3);
});
test('Selected summary reflects edits and rejects invalid time rather than inventing a duration', () => {
  const duration = (s: string, e: string) => {
    if (s === 'bad') throw Error('invalid');
    return Number(e) - Number(s);
  };
  assert.deepEqual(
    proposalTotals(
      [
        { selected: true, start: '10', end: '40' },
        { selected: false, start: '0', end: '100' },
      ],
      duration,
    ),
    { count: 1, minutes: 30, invalid: false },
  );
  assert.equal(
    proposalTotals([{ selected: true, start: 'bad', end: '40' }], duration).invalid,
    true,
  );
});
