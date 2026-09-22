import test from 'node:test';
import assert from 'node:assert/strict';
import { minutesToTime, savedEditIsCurrent, timeToMinutes, validateIntegerSetting } from '../src/settings-save-logic.ts';

test('minute settings accept only integers inside their explicit range', () => {
  assert.equal(validateIntegerSetting(25, 5, 120), '');
  assert.equal(validateIntegerSetting(4, 5, 120), '请输入 5–120 之间的整数分钟。');
  assert.equal(validateIntegerSetting(5.5, 5, 120), '请输入 5–120 之间的整数分钟。');
  assert.equal(validateIntegerSetting(Number.NaN, 1, 60), '请输入 1–60 之间的整数分钟。');
});

test('time inputs round-trip schedule minute values', () => {
  assert.equal(minutesToTime(750), '12:30');
  assert.equal(minutesToTime(1320), '22:00');
  assert.equal(timeToMinutes('08:30'), 510);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(timeToMinutes('8:30'), null);
});

test('an older save response cannot clear an edit made while it was pending', () => {
  assert.equal(savedEditIsCurrent(3, 3), true);
  assert.equal(savedEditIsCurrent(3, 4), false);
});
