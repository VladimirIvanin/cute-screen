export interface PixelDifference {
  readonly changedChannels: number
  readonly maximumDelta: number
}

export interface GoldenTolerance {
  readonly maximumChangedChannelRatio: number
  readonly maximumDelta: number
}

// Native Canvas2D on Linux/Windows rounds a few resampled RGB channels differently.
// Measured on the 4K composition fixture: <=28 channels at 1x, <=187 at 2x, delta 1.
// Keep both a sparse-change budget (0.002%) and a one-level cap; alpha stays exact.
export const compositionCanvas2dTolerance: GoldenTolerance = {
  maximumChangedChannelRatio: 0.00002,
  maximumDelta: 1,
}

// The phone/browser catalog resamples the same 4K fixture into narrower viewports.
// Linux/Windows: <=41 RGB channels at 1x, <=595 at 2x (0.0061%), delta 1.
// Scope this budget to mockups; composition goldens retain their smaller budget.
export const mockupCanvas2dTolerance: GoldenTolerance = {
  maximumChangedChannelRatio: 0.00007,
  maximumDelta: 1,
}

export const semanticParityTolerance = {
  // Skia and Cairo use different edge antialiasing kernels. Interior pixels
  // must agree; up to six percent of channels may differ at vector edges.
  maximumChangedChannelRatio: 0.06,
  maximumDelta: 255,
} as const

export function compareRgba(
  actual: Uint8Array,
  expected: Uint8Array,
  channelTolerance = 0,
): PixelDifference {
  if (actual.length !== expected.length || actual.length % 4 !== 0) {
    throw new Error('RGBA buffers must have equal lengths divisible by four')
  }

  let changedChannels = 0
  let maximumDelta = 0
  for (let index = 0; index < actual.length; index += 1) {
    const delta = Math.abs((actual[index] ?? 0) - (expected[index] ?? 0))
    if (delta > channelTolerance) changedChannels += 1
    maximumDelta = Math.max(maximumDelta, delta)
  }

  return { changedChannels, maximumDelta }
}
