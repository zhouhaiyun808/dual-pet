import type { AppSnapshot, PetId } from './app-state';
import type { InputCounts } from './live-counts.ts';
import { displayedTotalCounts } from './live-counts.ts';

export type DesktopWidgetContext = PetId | 'paired';

const key = (context: DesktopWidgetContext) => `desktop-widget-visible:${context}`;

export interface StorageLike {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
}

export function desktopWidgetVisible(storage: StorageLike, context: DesktopWidgetContext): boolean {
  return storage.getItem(key(context)) !== 'false';
}

export function setDesktopWidgetVisible(storage: StorageLike, context: DesktopWidgetContext, visible: boolean): void {
  storage.setItem(key(context), String(visible));
}

export function desktopWidgetContext(paired: boolean, pet: PetId): DesktopWidgetContext {
  return paired ? 'paired' : pet;
}

export interface DesktopWidgetView {
  phase: '待开始' | '专注' | '休息' | '暂停';
  time: string;
  keys: string;
  clicks: string;
  control: 'pause' | 'resume' | null;
  controlDisabled: boolean;
}

export function desktopWidgetView(snapshot: AppSnapshot, live: InputCounts | null): DesktopWidgetView {
  const phase = snapshot.pomodoro.phase;
  const seconds = phase === 'idle'
    ? snapshot.settings.focusMinutes * 60
    : Math.max(0, Math.ceil(snapshot.pomodoro.remainingSeconds));
  const counts = displayedTotalCounts(snapshot, live);
  return {
    phase: phase === 'focus' ? '专注' : phase === 'break' ? '休息' : phase === 'paused' ? '暂停' : '待开始',
    time: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    keys: counts.todayKeys.toLocaleString('zh-CN'),
    clicks: counts.todayClicks.toLocaleString('zh-CN'),
    control: phase === 'focus' || phase === 'break' ? 'pause' : phase === 'paused' ? 'resume' : null,
    controlDisabled: phase === 'paused' && Boolean(snapshot.sleepSlot),
  };
}
