import type { Activity, AppSnapshot, PairMode, PetId } from './app-state';

export const DOUBLE_CLICK_TOLERANCE_MS = 30;
export const FALLBACK_DOUBLE_CLICK_INTERVAL_MS = 500;

export function normalizeDoubleClickDelay(intervalMs: number | null | undefined): number {
  const interval = typeof intervalMs === 'number' && Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : FALLBACK_DOUBLE_CLICK_INTERVAL_MS;
  return Math.ceil(interval) + DOUBLE_CLICK_TOLERANCE_MS;
}

export function nextSinglePetActivity(activity: Activity): Activity {
  if (activity === 'standing') return 'working';
  if (activity === 'working') return 'sleeping';
  return 'standing';
}

export function pairModeIsStanding(mode: PairMode): boolean {
  return mode === 'face-dialogue' || mode === 'kiss';
}

export function isRoleDialogue(kind: string | null | undefined): boolean {
  return !!kind && kind !== 'break-reminder';
}

export function shouldIgnoreSingleClick(paired: boolean, dialogueKind: string | null | undefined): boolean {
  return paired && isRoleDialogue(dialogueKind);
}

export function shouldSplitOnDoubleClick(paired: boolean, dialogueLocked: boolean): boolean {
  return paired && !dialogueLocked;
}

/** Only semantic state changes invalidate a delayed click; telemetry revisions do not. */
export function controlSemanticsChanged(previous: AppSnapshot | null, next: AppSnapshot, id: PetId): boolean {
  if (!previous) return false;
  const oldPet = previous.pets[id], newPet = next.pets[id];
  const oldPair = previous.pair, newPair = next.pair;
  return oldPet.present !== newPet.present
    || oldPet.activity !== newPet.activity
    || oldPair?.owner !== newPair?.owner
    || oldPair?.mode !== newPair?.mode
    || oldPair?.ownLeft !== newPair?.ownLeft
    || isRoleDialogue(previous.dialogue?.kind) !== isRoleDialogue(next.dialogue?.kind)
    || previous.pomodoro.phase !== next.pomodoro.phase
    || previous.sleepSlot !== next.sleepSlot;
}

export type GestureFinish = 'join' | 'single-click' | 'none';

/** Pure release decision used after asynchronous pointer cleanup completes. */
export function gestureFinishAction(
  eventType: 'pointerup' | 'pointercancel' | 'lostpointercapture',
  moved: boolean,
  gestureToken: number,
  currentToken: number,
): GestureFinish {
  if (eventType !== 'pointerup' || gestureToken !== currentToken) return 'none';
  return moved ? 'join' : 'single-click';
}

/** Pure delayed-click guard; the caller supplies the current gesture state. */
export function shouldRunDelayedSingleClick(
  gestureToken: number,
  currentToken: number,
  roleDialoguePlaying: boolean,
  pointerActive: boolean,
  busy: boolean,
  recovering: boolean,
): boolean {
  return gestureToken === currentToken && !roleDialoguePlaying && !pointerActive && !busy && !recovering;
}
