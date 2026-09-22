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
  widgetWidth: number;
  widgetHeight: number;
  bubbleWidth: number;
  bubbleHeight: number;
  bubbleOffset: number;
  statusWidth: number;
  statusHeight: number;
  gap: number;
  padding: number;
}

export interface PetLayout {
  windowWidth: number;
  windowHeight: number;
  widgetTop: number;
  statusTop: number;
  bubbleTop: number;
  petTop: number;
}

/** Stack the optional widget, temporary bubble slot, and bottom-anchored pet. */
export function calculatePetLayout(input: PetLayoutInput): PetLayout {
  const topPadding = Math.max(4, input.padding);
  const widgetTop = topPadding;
  let cursor = widgetTop + input.widgetHeight;
  const statusTop = cursor + (input.widgetHeight && input.statusHeight ? input.gap : 0);
  if (input.statusHeight) cursor = statusTop + input.statusHeight;
  const bubbleTop = cursor + ((input.widgetHeight || input.statusHeight) && input.bubbleHeight ? input.gap : 0);
  if (input.bubbleHeight) cursor = bubbleTop + input.bubbleHeight;
  // The widget tail attaches directly to the pet when there is no temporary
  // message. Dialogue and status bubbles keep the ordinary readable gap.
  const petGap = input.statusHeight || input.bubbleHeight ? input.gap : 0;
  const petTop = Math.max(40, cursor + petGap);
  return {
    windowWidth: Math.max(input.petWidth + input.padding * 2, input.widgetWidth + input.padding, input.bubbleWidth + input.bubbleOffset * 2 + input.padding, input.statusWidth + input.padding),
    windowHeight: petTop + input.petHeight + input.padding,
    widgetTop,
    statusTop,
    bubbleTop,
    petTop,
  };
}
