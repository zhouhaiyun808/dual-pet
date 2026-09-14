import type { Progress } from './app-state';

export const DAILY_EARNING_CAP = 800;
export interface DailySources { companion: number; keyboard: number; mouse: number }
export interface DailyEarningsBreakdown extends DailySources {
  focus: number; unclassified: number; total: number; cappedTotal: number;
}
type ProgressWithSources = Progress & { dailySources?: Partial<DailySources> };

function nonNegativeFinite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}
function roundedTiny(value: number): number { return Math.abs(value) < 1e-9 ? 0 : value; }

/** Split recorded earnings; never infer input earnings from key/click counts. */
export function dailyEarningsBreakdown(progress: ProgressWithSources): DailyEarningsBreakdown {
  const total = nonNegativeFinite(progress.dailyEarned);
  const focus = nonNegativeFinite(progress.dailyFocusEarned);
  const sources: DailySources = {
    companion: nonNegativeFinite(progress.dailySources?.companion),
    keyboard: nonNegativeFinite(progress.dailySources?.keyboard),
    mouse: nonNegativeFinite(progress.dailySources?.mouse),
  };
  const remainder = roundedTiny(total - focus - sources.companion - sources.keyboard - sources.mouse);
  return { ...sources, focus, unclassified: Math.max(0, remainder), total, cappedTotal: Math.min(total, DAILY_EARNING_CAP) };
}

export function formatDailyEarnings(value: number): string {
  return nonNegativeFinite(Math.min(value, DAILY_EARNING_CAP)).toFixed(1);
}

export function formatDailySourceEarnings(value: number): string {
  return nonNegativeFinite(value).toFixed(2);
}
