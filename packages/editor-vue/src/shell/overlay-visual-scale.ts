export interface OverlayScaleInput {
  readonly backingWidth: number
  readonly backingHeight: number
  readonly clientWidth: number
  readonly clientHeight: number
}

/** Returns document-to-CSS scale from the canvas that is actually displayed. */
export function overlayVisualScale(
  input: OverlayScaleInput,
  fallback: number,
): number {
  const scales = [
    input.backingWidth > 0 ? input.clientWidth / input.backingWidth : 0,
    input.backingHeight > 0 ? input.clientHeight / input.backingHeight : 0,
  ].filter((value) => Number.isFinite(value) && value > 0)
  return scales.length > 0 ? Math.min(...scales) : Math.max(fallback, 0.01)
}
