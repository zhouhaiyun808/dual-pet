export type PetId = 'pet-a' | 'pet-b';
export type Activity = 'standing' | 'working' | 'sleeping';
export type PairMode = 'face-dialogue' | 'shared-work' | 'kiss' | 'double-sleep';
export interface Progress {
  personalGrowth: number; day: string; dailyEarned: number; dailyFocusEarned: number;
  dailySources?: { companion: number; keyboard: number; mouse: number };
  keyPresses: number; mouseClicks: number; todayKeys: number; todayClicks: number;
  companionSeconds: number; slept: boolean; faceCompleted: boolean; workedTogether: boolean; kissed: boolean;
}
export interface Bond { value: number; day: string; dailyEarned: number }
export interface PetRecord { present: boolean; activity: Activity; progress: Progress }
export interface Settings {
  focusMinutes: number; breakMinutes: number; longBreakMinutes: number;
  autoNext: boolean; longBreakEnabled: boolean; lunchEnabled: boolean; nightEnabled: boolean;
  inputEnabled: boolean; bubblesEnabled: boolean;
}
export interface Pomodoro {
  phase: 'idle' | 'focus' | 'break' | 'paused'; resumePhase: 'focus' | 'break';
  remainingSeconds: number; completedRounds: number;
}
export interface PairRecord { owner: PetId; mode: PairMode; ownLeft: boolean; bedColor: 'green' | 'blue' }
export interface DialogueLine { speaker: PetId | 'system'; text: string }
export interface Dialogue { id: number; lines: DialogueLine[]; index: number; remainingSeconds: number; kind: string }
export interface AppSnapshot {
  revision: number; pets: Record<PetId, PetRecord>; pair: PairRecord | null;
  bond: Bond; stage: number; settings: Settings; pomodoro: Pomodoro; dialogue: Dialogue | null;
  sleepSlot: string | null; inputStatus: string; storageWarning: string | null;
  unlockedDialogues: string[];
}
export interface AppAction {
  kind: string; pet?: PetId; activity?: Activity; ownLeft?: boolean;
  settings?: Settings;
}
export const petNames: Record<PetId, string> = { 'pet-a': '陈子奚', 'pet-b': '江晏' };
