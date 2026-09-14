import type { AppSnapshot } from './app-state';

export function isCounterPreview(hasTauri: boolean, search: string): boolean {
  return !hasTauri && new URLSearchParams(search).get('preview') === '1';
}

/** Keep a newer app snapshot when an initial IPC response races an event. */
export function acceptSnapshot(current: AppSnapshot | null, incoming: AppSnapshot): AppSnapshot {
  return !current || incoming.revision > current.revision ? incoming : current;
}
