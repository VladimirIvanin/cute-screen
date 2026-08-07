export interface PixelDifference {
  readonly changedChannels: number
  readonly maximumDelta: number
}

export function compareRgba(
  actual: Uint8Array,
  expected: Uint8Array,
): PixelDifference {
  if (actual.length !== expected.length || actual.length % 4 !== 0) {
    throw new Error('RGBA buffers must have equal lengths divisible by four')
  }

  let changedChannels = 0
  let maximumDelta = 0
  for (let index = 0; index < actual.length; index += 1) {
    const delta = Math.abs((actual[index] ?? 0) - (expected[index] ?? 0))
    if (delta > 0) changedChannels += 1
    maximumDelta = Math.max(maximumDelta, delta)
  }

  return { changedChannels, maximumDelta }
}
