import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopWidgetContext, desktopWidgetView, desktopWidgetVisible, setDesktopWidgetVisible } from '../src/desktop-widget.ts';
import type { AppSnapshot } from '../src/app-state.ts';
import type { InputCounts } from '../src/live-counts.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

function snapshot(phase: AppSnapshot['pomodoro']['phase'] = 'idle'): AppSnapshot {
  return {
    revision: 4,
    inputTotals: { day: '2026-09-22', todayKeys: 1200, todayClicks: 320 },
    settings: { focusMinutes: 25 },
    pomodoro: { phase, resumePhase: 'focus', remainingSeconds: 1476, completedRounds: 0 },
  } as AppSnapshot;
}

test('single pets and the paired widget persist independent visibility', () => {
  const storage = memoryStorage();
  assert.equal(desktopWidgetVisible(storage, 'pet-a'), true);
  assert.equal(desktopWidgetVisible(storage, 'pet-b'), true);
  assert.equal(desktopWidgetVisible(storage, 'paired'), true);
  setDesktopWidgetVisible(storage, 'pet-a', false);
  assert.equal(desktopWidgetVisible(storage, 'pet-a'), false);
  assert.equal(desktopWidgetVisible(storage, 'pet-b'), true);
  assert.equal(desktopWidgetVisible(storage, 'paired'), true);
  assert.equal(desktopWidgetContext(false, 'pet-b'), 'pet-b');
  assert.equal(desktopWidgetContext(true, 'pet-b'), 'paired');
});

test('widget uses the configured idle time and device-level live totals', () => {
  const state = snapshot();
  const live = {
    sequence: 8, stateRevision: 4, inputStatus: 'listening',
    total: { day: '2026-09-22', todayKeys: 4232, todayClicks: 576 }, pets: {},
  } as InputCounts;
  assert.deepEqual(desktopWidgetView(state, live), { phase: '准备', time: '25:00', keys: '4,232', clicks: '576', control: 'start', controlDisabled: false });
  assert.deepEqual(desktopWidgetView(snapshot('focus'), live), { phase: '专注', time: '24:36', keys: '4,232', clicks: '576', control: 'pause', controlDisabled: false });
  assert.deepEqual(desktopWidgetView(snapshot('paused'), live), { phase: '暂停', time: '24:36', keys: '4,232', clicks: '576', control: 'resume', controlDisabled: false });
  const sleeping = snapshot('paused');
  sleeping.sleepSlot = 'night';
  assert.equal(desktopWidgetView(sleeping, live).controlDisabled, true);
  const sleepingIdle = snapshot();
  sleepingIdle.sleepSlot = 'night';
  assert.deepEqual(desktopWidgetView(sleepingIdle, live).control, 'start');
  assert.equal(desktopWidgetView(sleepingIdle, live).controlDisabled, true);
});
