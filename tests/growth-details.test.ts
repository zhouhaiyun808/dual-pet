import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyEarningsBreakdown, formatDailyEarnings, formatDailySourceEarnings } from '../src/growth-details.ts';

const progress = (overrides: Record<string, unknown> = {}) => ({ dailyEarned: 10, dailyFocusEarned: 2, ...overrides }) as any;

test('legacy saves keep the remainder explicitly unclassified', () => {
  assert.deepEqual(dailyEarningsBreakdown(progress()), { companion: 0, keyboard: 0, mouse: 0, focus: 2, unclassified: 8, total: 10, cappedTotal: 10 });
});
test('new backend source earnings are shown independently', () => {
  assert.deepEqual(dailyEarningsBreakdown(progress({ dailySources: { companion: 1.5, keyboard: 2, mouse: 0.5 } })), { companion: 1.5, keyboard: 2, mouse: 0.5, focus: 2, unclassified: 4, total: 10, cappedTotal: 10 });
});
test('away pets can show zero recorded earnings without inventing catch-up', () => {
  assert.equal(dailyEarningsBreakdown(progress({ dailyEarned: 0, dailyFocusEarned: 0 })).unclassified, 0);
});
test('floating point residue below precision is not displayed as a negative bucket', () => {
  assert.equal(dailyEarningsBreakdown(progress({ dailyEarned: 0.3, dailyFocusEarned: 0, dailySources: { companion: 0.1, keyboard: 0.2, mouse: 0 } })).unclassified, 0);
});
test('daily display respects the 800-point cap', () => {
  assert.equal(formatDailyEarnings(801.25), '800.0');
  assert.equal(dailyEarningsBreakdown(progress({ dailyEarned: 801.25 })).cappedTotal, 800);
});
test('source display keeps two decimal places while total keeps one', () => {
  assert.equal(formatDailySourceEarnings(0.126), '0.13');
  assert.equal(formatDailyEarnings(0.126), '0.1');
});
