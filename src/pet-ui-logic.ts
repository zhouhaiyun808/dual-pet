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
  visibleTopInset: number;
  widgetWidth: number;
  widgetHeight: number;
  bubbleWidth: number;
  bubbleHeight: number;
  bubbleVisibleBottomInset?: number;
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

export function suppressDesktopWidgetForDialogue(dialogueVisible: boolean): boolean {
  return dialogueVisible;
}

/** Put a stable source-canvas anchor at the center of the drawing envelope. */
export function anchoredDrawX(canvasWidth: number, cropLeft: number, anchorSourceX: number, scale: number): number {
  return Math.round(canvasWidth / 2 - (anchorSourceX - cropLeft) * scale);
}

/** Stack the optional widget, temporary bubble slot, and bottom-anchored pet. */
export function calculatePetLayout(input: PetLayoutInput): PetLayout {
  const topPadding = Math.max(4, input.padding);
  const baseWidgetTop = topPadding;
  let cursor = baseWidgetTop + input.widgetHeight;
  const baseStatusTop = cursor + (input.widgetHeight && input.statusHeight ? input.gap : 0);
  if (input.statusHeight) cursor = baseStatusTop + input.statusHeight;
  const baseBubbleTop = cursor + ((input.widgetHeight || input.statusHeight) && input.bubbleHeight ? input.gap : 0);
  if (input.bubbleHeight) cursor = baseBubbleTop + input.bubbleHeight;
  // The widget tail attaches directly to the pet when there is no temporary
  // message. Dialogue and status bubbles keep the ordinary readable gap.
  const petGap = input.statusHeight || input.bubbleHeight ? input.gap : 0;
  const visibleTopInset = Math.max(0, Math.min(input.petHeight, input.visibleTopInset));
  const petTop = Math.max(40, cursor + petGap);
  // Keep the window and canvas envelope stable. Move only the upper stack into
  // the current canvas' transparent top inset, attaching it to visible art.
  const widgetTop = baseWidgetTop + visibleTopInset;
  const statusTop = baseStatusTop + visibleTopInset;
  // The dialogue PNG ends above its 108px layout box. Let its transparent
  // lower pixels overlap the pet canvas so the painted tail keeps the gap.
  const bubbleTop = baseBubbleTop + visibleTopInset + (input.bubbleHeight ? Math.max(0, input.bubbleVisibleBottomInset ?? 0) : 0);
  return {
    windowWidth: Math.max(input.petWidth + input.padding * 2, input.widgetWidth + input.padding, input.bubbleWidth + input.bubbleOffset * 2 + input.padding, input.statusWidth + input.padding),
    windowHeight: petTop + input.petHeight + input.padding,
    widgetTop,
    statusTop,
    bubbleTop,
    petTop,
  };
}
