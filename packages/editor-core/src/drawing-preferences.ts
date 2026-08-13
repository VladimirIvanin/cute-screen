import type { JsonObject, SrgbColor } from './document/types'
import { DEFAULT_DRAWING_DEFAULTS, type DrawingDefaults } from './drawing'

export interface DrawingToolPreferencesV2 {
  readonly schemaVersion: 2
  readonly defaults: DrawingDefaults
  readonly recentColors: readonly SrgbColor[]
}

export type DrawingToolPreferences = DrawingToolPreferencesV2

/** Platform adapters own IO; this codec keeps settings independent from the DOM. */
export interface DrawingToolPreferencesStorage {
  load(): unknown
  save(value: DrawingToolPreferencesV2): void
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

function normalizedStroke(value: unknown): JsonObject | undefined {
  if (!isJsonObject(value) || !isColor(value.color)) return undefined
  if (
    typeof value.width !== 'number' ||
    !Number.isFinite(value.width) ||
    value.width <= 0
  ) {
    return undefined
  }
  if (
    value.style !== 'solid' &&
    value.style !== 'dashed' &&
    value.style !== 'dotted'
  ) {
    return undefined
  }
  if (value.cap !== 'butt' && value.cap !== 'round' && value.cap !== 'square') {
    return undefined
  }
  if (
    value.join !== 'miter' &&
    value.join !== 'round' &&
    value.join !== 'bevel'
  ) {
    return undefined
  }
  return {
    color: { ...value.color },
    width: value.width,
    style: value.style,
    cap: value.cap,
    join: value.join,
  }
}

function normalizedArrow(
  value: unknown,
  schemaVersion: 1 | 2,
  fallback: JsonObject,
): JsonObject {
  if (!isJsonObject(value)) return fallback
  const path = value.path
  if (path !== 'straight' && path !== 'quadratic' && path !== 'elbow') {
    return fallback
  }
  const stroke = normalizedStroke(value.stroke)
  if (!stroke) return fallback
  const migrateCap = (cap: unknown): unknown =>
    schemaVersion === 1 && cap === 'chevron'
      ? 'lineArrow'
      : schemaVersion === 1 && cap === 'triangle'
        ? 'solidArrow'
        : cap
  const startCap = migrateCap(value.startCap)
  const endCap = migrateCap(value.endCap)
  const caps = [
    'none',
    'lineArrow',
    'solidArrow',
    'triangle',
    'circle',
    'diamond',
  ]
  if (!caps.includes(String(startCap)) || !caps.includes(String(endCap))) {
    return fallback
  }
  let elbow: JsonObject | undefined
  if (path === 'elbow') {
    if (!isJsonObject(value.elbow)) return fallback
    if (value.elbow.axis !== 'x' && value.elbow.axis !== 'y') return fallback
    if (
      typeof value.elbow.offset !== 'number' ||
      !Number.isFinite(value.elbow.offset)
    ) {
      return fallback
    }
    elbow = { axis: value.elbow.axis, offset: value.elbow.offset }
  }
  const style = { ...value }
  delete style.bend
  delete style.elbow
  delete style.end
  delete style.label
  delete style.start
  delete style.text
  return {
    ...style,
    path,
    stroke,
    startCap: String(startCap),
    endCap: String(endCap),
    ...(elbow === undefined ? {} : { elbow }),
  }
}

function defaults(value: unknown, schemaVersion: 1 | 2): DrawingDefaults {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneDefaults(DEFAULT_DRAWING_DEFAULTS)
  }
  const input = value as Record<string, unknown>
  const fallback = cloneDefaults(DEFAULT_DRAWING_DEFAULTS)
  return {
    arrow: normalizedArrow(input.arrow, schemaVersion, fallback.arrow),
    shape: isJsonObject(input.shape) ? input.shape : fallback.shape,
    pencil: isJsonObject(input.pencil) ? input.pencil : fallback.pencil,
    marker: isJsonObject(input.marker) ? input.marker : fallback.marker,
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function defaultDrawingToolPreferences(): DrawingToolPreferencesV2 {
  return Object.freeze({
    schemaVersion: 2,
    defaults: cloneDefaults(DEFAULT_DRAWING_DEFAULTS),
    recentColors: Object.freeze([]),
  })
}

/** Invalid settings are intentionally recoverable: callers continue with defaults. */
export function parseDrawingToolPreferences(
  value: unknown,
): DrawingToolPreferencesV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultDrawingToolPreferences()
  }
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
    return defaultDrawingToolPreferences()
  }
  const colors = Array.isArray(input.recentColors)
    ? input.recentColors
        .filter(isColor)
        .slice(0, 12)
        .map((color) => Object.freeze({ ...color }))
    : []
  return Object.freeze({
    schemaVersion: 2,
    defaults: defaults(input.defaults, input.schemaVersion),
    recentColors: Object.freeze(colors),
  })
}

export function rememberDrawingColor(
  preferences: DrawingToolPreferencesV2,
  color: SrgbColor,
): DrawingToolPreferencesV2 {
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
    schemaVersion: 2,
    defaults: preferences.defaults,
    recentColors: Object.freeze(recentColors),
  })
}
