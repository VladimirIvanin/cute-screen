import type {
  BlendMode,
  JsonObject,
} from './document/types'

export type HighlighterEffect = 'highlight' | 'illuminate' | 'veil'
export type HighlighterMode = 'auto' | HighlighterEffect

export function isHighlighterMode(value: unknown): value is HighlighterMode {
  return value === 'auto' || value === 'highlight' || value === 'illuminate' || value === 'veil'
}

/** A distribution rejects mixed backgrounds without averaging black and white into grey. */
export function classifyHighlighterBackground(rgba: Uint8ClampedArray): HighlighterEffect {
  let opaque = 0
  let dark = 0
  let light = 0
  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    if (rgba[offset + 3] !== 255) continue
    opaque += 1
    const brightness = (0.2126 * rgba[offset]! + 0.7152 * rgba[offset + 1]! + 0.0722 * rgba[offset + 2]!) / 255
    if (brightness <= 0.4) dark += 1
    if (brightness >= 0.65) light += 1
  }
  if (!opaque) return 'highlight'
  if (dark / opaque >= 0.6) return 'illuminate'
  if (light / opaque >= 0.6) return 'highlight'
  return 'veil'
}

export function resolveHighlighterBlend(
  mode: HighlighterMode,
  automatic: HighlighterEffect = 'highlight',
): BlendMode {
  const effect = mode === 'auto' ? automatic : mode
  return effect === 'illuminate' ? 'screen' : effect === 'veil' ? 'normal' : 'multiply'
}

/** Legacy Mode owned creation; the old independently persisted Blend was ignored. */
export function normalizeHighlighterDefaults(value: JsonObject): JsonObject {
  const { mode, blendMode, highlighterMode, ...rest } = value
  if (isHighlighterMode(highlighterMode)) {
    return { ...rest, highlighterMode, ...(highlighterMode === 'highlight' && blendMode === 'darken' ? { blendMode } : {}) }
  }
  return { ...rest, highlighterMode: 'highlight', blendMode: mode === 'darken' ? 'darken' : 'multiply' }
}

/** Existing layer appearance is authoritative; never reinterpret old saved strokes. */
export function highlighterModeForLayer(
  payload: JsonObject,
  blend: BlendMode,
): HighlighterMode | 'legacy' {
  if (payload.highlighterMode === 'auto') return 'auto'
  if (blend === 'multiply' || blend === 'darken') return 'highlight'
  if (blend === 'screen') return 'illuminate'
  return blend === 'normal' ? 'veil' : 'legacy'
}
