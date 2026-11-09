export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages (like `WheelEvent.deltaMode`). */
  deltaMode: number;
  shiftKey: boolean;
}

/**
 * Movement in pixels produced by a wheel event. With Shift the vertical wheel
 * scrolls horizontally, as in browsers.
 */
export function wheelDelta(
  e: WheelLike,
  lineHeight: number,
  pageHeight: number,
): { dx: number; dy: number } {
  const unit = e.deltaMode === 1 ? lineHeight : e.deltaMode === 2 ? pageHeight : 1;
  let dx = e.deltaX * unit;
  let dy = e.deltaY * unit;
  if (e.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  return { dx, dy };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
