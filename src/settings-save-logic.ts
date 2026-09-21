export function validateIntegerSetting(value: number, minimum: number, maximum: number): string {
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? ''
    : `请输入 ${minimum}–${maximum} 之间的整数分钟。`;
}

/** A completed request may only clear the exact edit version it captured. */
export function savedEditIsCurrent(capturedVersion: number, currentVersion: number): boolean {
  return capturedVersion === currentVersion;
}
