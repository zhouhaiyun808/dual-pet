import type { PetId } from './app-state';

export interface PetMenuActionPayload {
  action: string;
  targetWindow: PetId;
  pet: PetId;
}

/** Accept menu commands only when both the destination window and pet match. */
export function acceptPetMenuAction(
  payload: unknown,
  windowId: PetId,
): { action: string; pet: PetId } | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Partial<PetMenuActionPayload>;
  if (value.targetWindow !== windowId || (value.pet !== 'pet-a' && value.pet !== 'pet-b') || typeof value.action !== 'string') return null;
  return { action: value.action, pet: value.pet };
}

/** Keep backend details in the console while showing short, stable Chinese UI text. */
export function userFacingPetError(error: unknown): string {
  const detail = String(error);
  if (/stale|revision|版本|过期/i.test(detail)) return '状态已更新，请再试一次';
  if (/double sleep|双人床|尚未解锁|not unlocked/i.test(detail)) return '双人床尚未解锁';
  return '操作未完成，请稍后再试';
}

export interface PetLayoutInput {
  petWidth: number;
  petHeight: number;
  bubbleWidth: number;
  bubbleHeight: number;
  statusWidth: number;
  statusHeight: number;
  gap: number;
  padding: number;
}

export interface PetLayout {
  windowWidth: number;
  windowHeight: number;
  statusTop: number;
  bubbleTop: number;
  petTop: number;
}

/** Stack system status, dialogue, and the bottom-anchored pet in measured space. */
export function calculatePetLayout(input: PetLayoutInput): PetLayout {
  const topPadding = Math.max(4, input.padding);
  const statusTop = topPadding;
  const bubbleTop = statusTop + input.statusHeight + (input.statusHeight ? input.gap : 0);
  const petTop = Math.max(40, bubbleTop + input.bubbleHeight + (input.bubbleHeight ? input.gap : 0));
  return {
    windowWidth: Math.max(input.petWidth + input.padding * 2, input.bubbleWidth + input.padding, input.statusWidth + input.padding),
    windowHeight: petTop + input.petHeight + input.padding,
    statusTop,
    bubbleTop,
    petTop,
  };
}
