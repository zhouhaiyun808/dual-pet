import test from 'node:test';
import assert from 'node:assert/strict';
import { bottomRightPosition, clampWindowPosition, cssDeltaToPhysical, normalizeRect, intersects } from '../src/window-geometry.ts';
import { acceptPetMenuAction, calculatePetLayout, userFacingPetError } from '../src/pet-ui-logic.ts';
import { DOUBLE_CLICK_TOLERANCE_MS, FALLBACK_DOUBLE_CLICK_INTERVAL_MS, controlSemanticsChanged, gestureFinishAction, isRoleDialogue, nextSinglePetActivity, normalizeDoubleClickDelay, pairModeIsStanding, shouldIgnoreSingleClick, shouldRunDelayedSingleClick, shouldSplitOnDoubleClick } from '../src/click-logic.ts';

test('click rules keep single and double clicks mutually exclusive', () => {
  assert.equal(normalizeDoubleClickDelay(470), 180);
  assert.equal(normalizeDoubleClickDelay(undefined), FALLBACK_DOUBLE_CLICK_INTERVAL_MS + DOUBLE_CLICK_TOLERANCE_MS);
  assert.deepEqual(['standing', 'working', 'sleeping'].map(nextSinglePetActivity), ['working', 'sleeping', 'standing']);
  assert.equal(pairModeIsStanding('face-dialogue'), true);
  assert.equal(pairModeIsStanding('kiss'), true);
  assert.equal(isRoleDialogue('face-dialogue'), true);
  assert.equal(isRoleDialogue('shared-work'), true);
  assert.equal(isRoleDialogue('break-reminder'), false);
  assert.equal(shouldIgnoreSingleClick(true, 'face-dialogue'), true);
  assert.equal(shouldIgnoreSingleClick(true, 'shared-work'), true);
  assert.equal(shouldIgnoreSingleClick(true, 'break-reminder'), false);
  assert.equal(shouldIgnoreSingleClick(false, 'face-dialogue'), false);
  assert.equal(shouldSplitOnDoubleClick(true, false), true);
  assert.equal(shouldSplitOnDoubleClick(true, true), false);
  assert.equal(shouldSplitOnDoubleClick(false, false), false);
});

const snapshot = (overrides: Partial<any> = {}): any => ({
  revision: 1,
  pets: {
    'pet-a': { present: true, activity: 'standing', progress: {} },
    'pet-b': { present: true, activity: 'standing', progress: {} },
  },
  pair: null, stage: 3, settings: {}, pomodoro: { phase: 'idle' }, dialogue: null,
  sleepSlot: null, inputStatus: '', storageWarning: null, unlockedDialogues: [], ...overrides,
});

test('telemetry revisions keep a pending click and current snapshot is used', () => {
  const before = snapshot();
  const tick = snapshot({ revision: 2, inputStatus: '32ms:12' });
  assert.equal(controlSemanticsChanged(before, tick, 'pet-a'), false);
  assert.equal(shouldRunDelayedSingleClick(4, 4, false, false, false, false), true);
});

test('semantic snapshot changes invalidate a gesture even before its click timer exists', () => {
  const before = snapshot();
  const activityChanged = snapshot({ revision: 2, pets: { ...before.pets, 'pet-a': { ...before.pets['pet-a'], activity: 'working' } } });
  assert.equal(controlSemanticsChanged(before, activityChanged, 'pet-a'), true);
  assert.equal(gestureFinishAction('pointerup', false, 7, 8), 'none');
});

test('async pointer release cannot requeue after a prior double click', () => {
  assert.equal(gestureFinishAction('pointerup', false, 4, 5), 'none');
  assert.equal(gestureFinishAction('pointerup', true, 4, 5), 'none');
  assert.equal(gestureFinishAction('pointerup', false, 5, 5), 'single-click');
  assert.equal(gestureFinishAction('pointerup', true, 5, 5), 'join');
  assert.equal(gestureFinishAction('lostpointercapture', false, 5, 5), 'none');
});

test('single double-click advances exactly one step and dialogue start cancels', () => {
  assert.equal(nextSinglePetActivity('standing'), 'working');
  assert.equal(nextSinglePetActivity('working'), 'sleeping');
  const before = snapshot();
  const dialogue = snapshot({ revision: 2, dialogue: { kind: 'shared-work', id: 1, lines: [], index: 0, remainingSeconds: 1 } });
  assert.equal(controlSemanticsChanged(before, dialogue, 'pet-a'), true);
  assert.equal(shouldRunDelayedSingleClick(3, 3, true, false, false, false), false);
});

test('menu action is accepted only by its targeted pet window', () => {
  const closeChen = { action: 'close-a', targetWindow: 'pet-a', pet: 'pet-a' } as const;
  assert.deepEqual(acceptPetMenuAction(closeChen, 'pet-a'), { action: 'close-a', pet: 'pet-a' });
  assert.equal(acceptPetMenuAction(closeChen, 'pet-b'), null);
  assert.deepEqual(acceptPetMenuAction({ action: 'close-a', targetWindow: 'pet-a', pet: 'pet-a' }, 'pet-a')?.pet, 'pet-a');
  assert.deepEqual(acceptPetMenuAction({ action: 'close-b', targetWindow: 'pet-a', pet: 'pet-b' }, 'pet-a')?.pet, 'pet-b');
});

test('system error text is short and measured above the pet', () => {
  assert.equal(userFacingPetError('stale-revision: refresh app state'), '状态已更新，请再试一次');
  assert.equal(userFacingPetError('double sleep is not unlocked'), '双人床尚未解锁');
  assert.equal(userFacingPetError('unexpected backend detail'), '操作未完成，请稍后再试');
  const layout = calculatePetLayout({ petWidth: 100, petHeight: 110, widgetWidth: 184, widgetHeight: 70, bubbleWidth: 180, bubbleHeight: 40, bubbleOffset: 0, statusWidth: 150, statusHeight: 24, gap: 8, padding: 16 });
  assert.equal(layout.statusTop < layout.bubbleTop && layout.bubbleTop < layout.petTop, true);
  assert.equal(layout.widgetTop < layout.statusTop, true);
  assert.equal(layout.windowHeight, layout.petTop + 110 + 16);
});

test('clampWindowPosition respects a work area with negative monitor coordinates', () => {
  const area = { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1080 } };
  const size = { width: 196, height: 212 };

  assert.deepEqual(clampWindowPosition({ x: -2500, y: -10 }, size, area), { x: -1920, y: 0 });
  assert.deepEqual(clampWindowPosition({ x: 100, y: 1000 }, size, area), { x: -196, y: 868 });
});

test('bottomRightPosition keeps both slots inside the usable work area', () => {
  const area = { position: { x: 0, y: 23 }, size: { width: 1440, height: 857 } };
  const size = { width: 196, height: 212 };

  assert.deepEqual(bottomRightPosition(area, size, 24, 0), { x: 1220, y: 644 });
  assert.deepEqual(bottomRightPosition(area, size, 24, 1), { x: 1024, y: 644 });
});

test('cssDeltaToPhysical converts the single-display fallback without rounding', () => {
  assert.deepEqual(cssDeltaToPhysical({ x: -12.5, y: 7 }, 2), { x: -25, y: 14 });
});

test('oversize windows anchor to the accessible top-left without inverted bounds', () => {
  assert.deepEqual(clampWindowPosition({x: 300, y: 400}, {width: 3000, height: 2000}, {position: {x: -800, y: 25}, size: {width: 800, height: 575}}), {x: -800, y: 25});
});

test('mixed DPI windows normalize to one Mac desktop without changing logical size', () => {
  const retina = normalizeRect({position: {x: 2800, y: 200}, size: {width: 224, height: 288}}, 2);
  const external = normalizeRect({position: {x: 1400, y: 100}, size: {width: 112, height: 144}}, 1);
  assert.deepEqual(retina, external);
  const primary = normalizeRect({position: {x: 0, y: 50}, size: {width: 3584, height: 2190}}, 2);
  assert.deepEqual(bottomRightPosition(primary, external.size, 12, 0), {x: 1668, y: 964});
});

test('removed displays are detected while partially visible windows remain recoverable', () => {
  const screen = {position: {x: 0, y: 25}, size: {width: 1792, height: 1095}};
  assert.equal(intersects({position: {x: -112, y: 100}, size: {width: 112, height: 144}}, screen), false);
  assert.equal(intersects({position: {x: -111, y: 100}, size: {width: 112, height: 144}}, screen), true);
});
