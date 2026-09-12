export interface PhysicalPoint { x: number; y: number }
export interface PhysicalSize { width: number; height: number }
export interface PhysicalRect { position: PhysicalPoint; size: PhysicalSize }

/** Return the physical window origin that keeps a window inside a work area. */
export function clampWindowPosition(
  position: PhysicalPoint,
  windowSize: PhysicalSize,
  workArea: PhysicalRect,
): PhysicalPoint {
  const maxX = Math.max(workArea.position.x, workArea.position.x + workArea.size.width - windowSize.width);
  const maxY = Math.max(workArea.position.y, workArea.position.y + workArea.size.height - windowSize.height);
  return {
    x: clamp(position.x, workArea.position.x, maxX),
    y: clamp(position.y, workArea.position.y, maxY),
  };
}

/** Place a window at the requested bottom-right slot in a physical work area. */
export function bottomRightPosition(
  workArea: PhysicalRect,
  windowSize: PhysicalSize,
  margin: number,
  slot: number,
): PhysicalPoint {
  return clampWindowPosition({
    x: workArea.position.x + workArea.size.width - margin - windowSize.width - slot * windowSize.width,
    y: workArea.position.y + workArea.size.height - margin - windowSize.height,
  }, windowSize, workArea);
}

/** Convert a CSS-screen delta using one known scale factor (fallback only). */
export function cssDeltaToPhysical(delta: PhysicalPoint, scaleFactor: number): PhysicalPoint {
  return { x: delta.x * scaleFactor, y: delta.y * scaleFactor };
}

/** Normalize tao physical geometry into the logical coordinate space of a window. */
export function physicalToLogical(point: PhysicalPoint, scaleFactor: number): PhysicalPoint {
  return { x: point.x / scaleFactor, y: point.y / scaleFactor };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Convert all parts of a native rectangle using the same display scale. */
export function normalizeRect(rect: PhysicalRect, scale: number): PhysicalRect {
  return { position: physicalToLogical(rect.position, scale), size: { width: rect.size.width / scale, height: rect.size.height / scale } };
}

export function intersects(a: PhysicalRect, b: PhysicalRect): boolean {
  return a.position.x < b.position.x + b.size.width && a.position.x + a.size.width > b.position.x
    && a.position.y < b.position.y + b.size.height && a.position.y + a.size.height > b.position.y;
}
