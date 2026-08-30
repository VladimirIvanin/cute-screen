import type {
  LayerNode,
  Point,
  SrgbColor,
  TextLayer,
} from '../../document/types'

export const IDENTITY = Object.freeze({
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})

export const BLACK_COLOR = Object.freeze({
  red: 0,
  green: 0,
  blue: 0,
  alpha: 1,
})
export const WHITE_COLOR = Object.freeze({
  red: 1,
  green: 1,
  blue: 1,
  alpha: 1,
})

export const DEFAULT_COLOR = Object.freeze({
  colorSpace: 'srgb' as const,
  hasIccProfile: false,
})

export const SHA256_PATTERN = /^[a-f0-9]{64}$/u
export const DEFAULT_TEXT_FONT_FAMILY = 'Roboto'
export const DEFAULT_TEXT_FONT_SIZE = 24
export const DEFAULT_TEXT_LINE_HEIGHT = 1.25

export function cloneLayer(layer: LayerNode): LayerNode {
  return JSON.parse(JSON.stringify(layer)) as LayerNode
}

export function stripTransientLayerFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const input = value as Record<string, unknown>
  const { transient, draft, selection, ...layer } = input
  void transient
  void draft
  void selection
  if (
    !layer.payload ||
    typeof layer.payload !== 'object' ||
    Array.isArray(layer.payload)
  ) {
    return layer
  }
  const {
    transient: payloadTransient,
    draft: payloadDraft,
    ...payload
  } = layer.payload as Record<string, unknown>
  void payloadTransient
  void payloadDraft
  return { ...layer, payload }
}

export function contentImage(layer: LayerNode): LayerNode {
  if (layer.kind !== 'image' || layer.payload.role !== 'base') return layer
  return {
    ...layer,
    locked: false,
    payload: { ...layer.payload, role: 'content' },
  }
}

export function assertFinitePoint(origin: Point): void {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    throw new Error('content-layer origin must be finite')
  }
}

export function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be positive and finite`)
  }
}

export function assertNonEmptyString(value: string, field: string): void {
  if (value.length === 0) throw new Error(`${field} must not be empty`)
}

export function solidColor(color: SrgbColor | undefined, field = 'text color') {
  const value = color ?? BLACK_COLOR
  if (
    ![value.red, value.green, value.blue, value.alpha].every(
      (channel) =>
        typeof channel === 'number' &&
        Number.isFinite(channel) &&
        channel >= 0 &&
        channel <= 1,
    )
  ) {
    throw new Error(`${field} must use finite sRGB channels from 0 to 1`)
  }
  return Object.freeze({
    red: value.red,
    green: value.green,
    blue: value.blue,
    alpha: value.alpha,
  })
}

export function assertTextBackground(
  background: NonNullable<TextLayer['payload']['background']>,
): void {
  solidColor(background.color, 'text background color')
  if (
    !Number.isFinite(background.padding) ||
    background.padding < 0 ||
    background.padding > 256
  ) {
    throw new Error('text background padding must be between 0 and 256')
  }
  if (
    !Number.isFinite(background.radius) ||
    background.radius < 0 ||
    background.radius > 16_384
  ) {
    throw new Error('text background radius must be between 0 and 16384')
  }
}
