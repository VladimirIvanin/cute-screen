import type {
  EmojiAssetReference,
  EmojiLayer,
  ImageLayer,
  Point,
} from '../../document/types'
import {
  DEFAULT_COLOR,
  IDENTITY,
  SHA256_PATTERN,
  assertFinitePoint,
  assertNonEmptyString,
  assertPositiveFinite,
} from './shared'

export function createEmojiLayer(input: {
  readonly id: string
  readonly grapheme: string
  readonly origin: Point
  readonly asset: EmojiAssetReference
  readonly size?: number
}): EmojiLayer {
  assertFinitePoint(input.origin)
  assertNonEmptyString(input.grapheme, 'emoji grapheme')
  if ([...input.grapheme].length > 16) {
    throw new Error('emoji grapheme must contain at most 16 code points')
  }
  assertNonEmptyString(input.asset.version, 'emoji asset version')
  assertNonEmptyString(input.asset.assetId, 'emoji asset id')
  const size = input.size ?? 32
  assertPositiveFinite(size, 'emoji size')
  return Object.freeze({
    id: input.id,
    kind: 'emoji',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: { x: 0, y: 0, width: size, height: size },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: { grapheme: input.grapheme, asset: input.asset },
  })
}

/**
 * Creates an ordinary content image. The caller supplies an immutable blob
 * produced by the native staged-import path; this helper never receives bytes.
 */
export function createContentImageLayer(input: {
  readonly id: string
  readonly blobHash: string
  readonly format: ImageLayer['payload']['format']
  readonly intrinsicWidth: number
  readonly intrinsicHeight: number
  readonly origin: Point
}): ImageLayer {
  assertFinitePoint(input.origin)
  if (!SHA256_PATTERN.test(input.blobHash)) {
    throw new Error('content image blob hash must be a lowercase SHA-256 hash')
  }
  assertPositiveFinite(input.intrinsicWidth, 'content image width')
  assertPositiveFinite(input.intrinsicHeight, 'content image height')
  return Object.freeze({
    id: input.id,
    kind: 'image',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: {
      x: 0,
      y: 0,
      width: input.intrinsicWidth,
      height: input.intrinsicHeight,
    },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      blobHash: input.blobHash,
      intrinsicWidth: input.intrinsicWidth,
      intrinsicHeight: input.intrinsicHeight,
      format: input.format,
      orientationApplied: true as const,
      color: DEFAULT_COLOR,
      role: 'content' as const,
      border: null,
      radius: 0,
      crop: null,
      mask: null,
    },
  })
}

/** The value is document-level, independent from paint order or z-order. */
