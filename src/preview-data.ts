import type { AppSnapshot, PetId, Progress } from './app-state';
import type { InputCounts } from './live-counts';

export const previewScenarios = ['normal', 'away', 'permission', 'locked', 'legacy', 'capped'] as const;
export type PreviewScenario = typeof previewScenarios[number];
export interface PreviewMessage { type: 'dual-pet-preview'; scenario: PreviewScenario; keys: number; clicks: number }
export function parsePreviewMessage(value: unknown): PreviewMessage | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (p.type !== 'dual-pet-preview' || !previewScenarios.includes(p.scenario as PreviewScenario)) return null;
  if (![p.keys, p.clicks].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 100_000)) return null;
  return { type: 'dual-pet-preview', scenario: p.scenario as PreviewScenario, keys: p.keys as number, clicks: p.clicks as number };
}

/** Display fixtures, NOT the growth engine. No storage, clocks or native input. */
export function createPreviewState(scenario: PreviewScenario, keys = 0, clicks = 0): { snapshot: AppSnapshot; counts: InputCounts } {
  if (!parsePreviewMessage({ type: 'dual-pet-preview', scenario, keys, clicks })) throw new Error('Invalid preview fixture');
  const inputStatus = scenario === 'permission' ? 'permission-required' : scenario === 'locked' ? 'locked' : 'available';
  const progress = (id: PetId): Progress => {
    const eligible = inputStatus === 'available' && !(scenario === 'away' && id === 'pet-b');
    const extraKeys = eligible ? keys : 0;
    const extraClicks = eligible ? clicks : 0;
    const keyboard = scenario === 'capped' ? 0 : Math.min(extraKeys / 60, 1);
    const mouse = scenario === 'capped' ? 0 : Math.min(extraClicks / 12, 1);
    const legacy = scenario === 'legacy';
    const capped = scenario === 'capped';
    const result: Progress = {
      personalGrowth: (capped ? 2500 : 420) + keyboard + mouse,
      day: '2026-09-14', dailyEarned: (capped ? 800 : legacy ? 40 : 25) + keyboard + mouse,
      dailyFocusEarned: capped ? 80 : 8,
      dailySources: capped ? { companion: 600, keyboard: 60, mouse: 60 }
        : { companion: legacy ? 0 : 12, keyboard: (legacy ? 0 : 3) + keyboard, mouse: (legacy ? 0 : 2) + mouse },
      keyPresses: (capped ? 3600 : 1200) + extraKeys, mouseClicks: (capped ? 720 : 320) + extraClicks,
      todayKeys: (capped ? 3600 : 1200) + extraKeys, todayClicks: (capped ? 720 : 320) + extraClicks,
      companionSeconds: capped ? 36000 : 720, slept: true, faceCompleted: false, workedTogether: false, kissed: false,
    };
    if (legacy && extraKeys === 0 && extraClicks === 0) delete result.dailySources;
    return result;
  };
  const snapshot: AppSnapshot = {
    revision: 1,
    pets: { 'pet-a': { present: true, activity: 'working', progress: progress('pet-a') },
      'pet-b': { present: scenario !== 'away', activity: 'standing', progress: progress('pet-b') } },
    bond: { value: scenario === 'capped' ? 2500 : 420, day: '2026-09-14', dailyEarned: scenario === 'capped' ? 800 : 12 },
    pair: null, stage: 1,
    settings: { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, autoNext: false,
      longBreakEnabled: true, lunchEnabled: true, nightEnabled: true, inputEnabled: true, bubblesEnabled: true },
    pomodoro: { phase: 'idle', resumePhase: 'focus', remainingSeconds: 0, completedRounds: 0 },
    dialogue: null, sleepSlot: null, inputStatus, storageWarning: null, unlockedDialogues: [],
  };
  const count = (id: PetId) => {
    const p = snapshot.pets[id].progress;
    return { day: p.day, todayKeys: p.todayKeys, todayClicks: p.todayClicks };
  };
  return { snapshot, counts: { sequence: 1, stateRevision: 1, inputStatus,
    pets: { 'pet-a': count('pet-a'), 'pet-b': count('pet-b') } } };
}
