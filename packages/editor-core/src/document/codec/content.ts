import {
  collectExtras,
  readJsonObject,
} from '../json'
import {
  type EmojiPayload,
  type ImageLayerPayload,
  type NumberedMarkerPayload,
  type SrgbColor,
} from '../types'
import {
  parseSrgbColor,
  parseStroke,
} from './paint'
import {
  INLINE_IMAGE_FIELDS,
  assertOnlyFields,
  colorToJson,
  isImageFormat,
  parseBoundedNonNegative,
  parseColor,
  readNonEmptyString,
  readPositiveNumber,
  readSha256,
} from './primitives'
import {
  parseRichTextContent,
} from './text'

const MAX_IMAGE_RADIUS = 16_384

export function parseNumberedMarkerPayload(
  value: unknown,
  field: string,
): NumberedMarkerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['sequence', 'label', 'badge'], field)
  const sequence = readPositiveNumber(input.sequence, `${field}.sequence`)
  if (!Number.isInteger(sequence)) {
    throw new Error(`${field}.sequence is invalid`)
  }
  const badge = readJsonObject(input.badge, `${field}.badge`)
  assertOnlyFields(badge, ['shape', 'color'], `${field}.badge`)
  if (!['circle', 'square', 'diamond', 'star'].includes(String(badge.shape))) {
    throw new Error(`${field}.badge.shape is invalid`)
  }
  return Object.freeze({
    sequence,
    label: parseRichTextContent(input.label, `${field}.label`),
    badge: Object.freeze({
      shape: badge.shape as NumberedMarkerPayload['badge']['shape'],
      color: parseSrgbColor(badge.color, `${field}.badge.color`) as unknown as SrgbColor,
    }),
  })
}

export { parseCalloutPayload } from './callout'

export function parseEmojiPayload(
  value: unknown,
  field: string,
): EmojiPayload {
  const input = readJsonObject(value, field)
  const grapheme = readNonEmptyString(input.grapheme, `${field}.grapheme`)
  if ([...grapheme].length > 16) throw new Error(`${field}.grapheme is invalid`)
  const asset = readJsonObject(input.asset, `${field}.asset`)
  if (asset.collection !== 'notoEmoji') {
    throw new Error(`${field}.asset.collection is invalid`)
  }
  return Object.freeze({
    grapheme,
    asset: Object.freeze({
      collection: 'notoEmoji',
      version: readNonEmptyString(asset.version, `${field}.asset.version`),
      assetId: readNonEmptyString(asset.assetId, `${field}.asset.assetId`),
    }),
  })
}

export function parseImagePayload(
  value: unknown,
  field: string,
): ImageLayerPayload {
  const input = readJsonObject(value, field)
  if (INLINE_IMAGE_FIELDS.some((key) => Object.hasOwn(input, key))) {
    throw new Error(`${field} must reference immutable image bytes by hash`)
  }
  if (!isImageFormat(input.format)) throw new Error(`${field}.format is invalid`)
  if (input.orientationApplied !== true) {
    throw new Error(`${field}.orientationApplied must be true`)
  }
  if (input.role !== 'base' && input.role !== 'content') {
    throw new Error(`${field}.role is invalid`)
  }
  const extras = collectExtras(input, [
    'blobHash',
    'intrinsicWidth',
    'intrinsicHeight',
    'format',
    'orientationApplied',
    'color',
    'role',
    'border',
    'radius',
    'crop',
    'mask',
  ])
  if (input.crop !== null || input.mask !== null) {
    throw new Error(`${field}.crop and ${field}.mask must be null`)
  }
  return Object.freeze({
    ...(extras ?? {}),
    blobHash: readSha256(input.blobHash, `${field}.blobHash`),
    intrinsicWidth: readPositiveNumber(input.intrinsicWidth, `${field}.intrinsicWidth`),
    intrinsicHeight: readPositiveNumber(input.intrinsicHeight, `${field}.intrinsicHeight`),
    format: input.format,
    orientationApplied: true,
    color: colorToJson(parseColor(input.color, `${field}.color`)),
    role: input.role,
    border:
      input.border === null
        ? null
        : (parseStroke(input.border, `${field}.border`) as Exclude<ImageLayerPayload['border'], undefined>),
    radius: parseBoundedNonNegative(input.radius, `${field}.radius`, MAX_IMAGE_RADIUS),
    crop: null,
    mask: null,
  })
}
