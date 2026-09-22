export function validateIntegerSetting(value: number, minimum: number, maximum: number): string {
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? ''
    : `请输入 ${minimum}–${maximum} 之间的整数分钟。`;
}

export function minutesToTime(value: number): string {
  const minutes = Number.isInteger(value) ? Math.max(0, Math.min(1439, value)) : 0;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** A completed request may only clear the exact edit version it captured. */
export function savedEditIsCurrent(capturedVersion: number, currentVersion: number): boolean {
  return capturedVersion === currentVersion;
}
