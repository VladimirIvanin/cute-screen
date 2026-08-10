import type { JsonObject, SrgbColor } from './document/types'
import { DEFAULT_DRAWING_DEFAULTS, type DrawingDefaults } from './drawing'

export interface DrawingToolPreferencesV1 {
  readonly schemaVersion: 1
  readonly defaults: DrawingDefaults
  readonly recentColors: readonly SrgbColor[]
}

/** Platform adapters own IO; this codec keeps settings independent from the DOM. */
export interface DrawingToolPreferencesStorage {
  load(): unknown
  save(value: DrawingToolPreferencesV1): void
}

function cloneDefaults(defaults: DrawingDefaults): DrawingDefaults {
  return JSON.parse(JSON.stringify(defaults)) as DrawingDefaults
}

function isColor(value: unknown): value is SrgbColor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const color = value as Record<string, unknown>
  return ['red', 'green', 'blue', 'alpha'].every(
    (channel) =>
      typeof color[channel] === 'number' &&
      Number.isFinite(color[channel]) &&
      (color[channel] as number) >= 0 &&
      (color[channel] as number) <= 1,
  )
}

function defaults(value: unknown): DrawingDefaults {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneDefaults(DEFAULT_DRAWING_DEFAULTS)
  }
  const input = value as Record<string, unknown>
  const fallback = cloneDefaults(DEFAULT_DRAWING_DEFAULTS)
  return {
    arrow: isJsonObject(input.arrow) ? input.arrow : fallback.arrow,
    shape: isJsonObject(input.shape) ? input.shape : fallback.shape,
    pencil: isJsonObject(input.pencil) ? input.pencil : fallback.pencil,
    marker: isJsonObject(input.marker) ? input.marker : fallback.marker,
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function defaultDrawingToolPreferences(): DrawingToolPreferencesV1 {
  return Object.freeze({
    schemaVersion: 1,
    defaults: cloneDefaults(DEFAULT_DRAWING_DEFAULTS),
    recentColors: Object.freeze([]),
  })
}

/** Invalid settings are intentionally recoverable: callers continue with defaults. */
export function parseDrawingToolPreferences(
  value: unknown,
): DrawingToolPreferencesV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultDrawingToolPreferences()
  }
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1) return defaultDrawingToolPreferences()
  const colors = Array.isArray(input.recentColors)
    ? input.recentColors
        .filter(isColor)
        .slice(0, 12)
        .map((color) => Object.freeze({ ...color }))
    : []
  return Object.freeze({
    schemaVersion: 1,
    defaults: defaults(input.defaults),
    recentColors: Object.freeze(colors),
  })
}

export function rememberDrawingColor(
  preferences: DrawingToolPreferencesV1,
  color: SrgbColor,
): DrawingToolPreferencesV1 {
  if (!isColor(color)) return preferences
  const key = `${color.red}:${color.green}:${color.blue}:${color.alpha}`
  const recentColors = [
    Object.freeze({ ...color }),
    ...preferences.recentColors.filter(
      (current) =>
        `${current.red}:${current.green}:${current.blue}:${current.alpha}` !==
        key,
    ),
  ].slice(0, 12)
  return Object.freeze({
    schemaVersion: 1,
    defaults: preferences.defaults,
    recentColors: Object.freeze(recentColors),
  })
}
