import type { LayerNode } from './document/types'

export type CirclingKind = 'circling' | 'rectangularCircling'

export const CIRCLING_SEEDS = Object.freeze({
  circling: Object.freeze([1021, 241, 16411, 97531]),
  rectangularCircling: Object.freeze([683, 337, 127]),
})

export function isCirclingKind(value: unknown): value is CirclingKind {
  return value === 'circling' || value === 'rectangularCircling'
}

export function circlingSketch(
  kind: CirclingKind,
  sequence = 0,
): { readonly sketchSeed: number; readonly sketchVersion: 2; readonly sketchSequence: number } {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    sequence >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Circling sequence must be a nonnegative safe integer below MAX_SAFE_INTEGER')
  }
  const seeds = CIRCLING_SEEDS[kind]
  return { sketchSeed: seeds[sequence % seeds.length]!, sketchVersion: 2, sketchSequence: sequence }
}

/** Document-derived cursors make cancellation, history, duplicates and reordering deterministic. */
export function nextCirclingSequence(
  layers: readonly LayerNode[],
  kind: unknown,
): number | undefined {
  if (!isCirclingKind(kind)) return undefined
  let next = 0
  for (const layer of layers) {
    if (
      layer.kind === 'shape' &&
      layer.payload.shape === kind &&
      layer.payload.sketchVersion === 2 &&
      typeof layer.payload.sketchSequence === 'number'
    ) next = Math.max(next, layer.payload.sketchSequence + 1)
  }
  return next
}
