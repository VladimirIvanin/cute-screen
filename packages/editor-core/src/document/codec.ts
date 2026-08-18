import { collectExtras, freezeJsonObject, readJsonObject } from './json'
import {
  DEFAULT_PRESENTATION_SETTINGS,
  ARROW_CAPS,
  BLEND_MODES,
  CENSOR_MODES,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  LAYER_KINDS,
  LOUPE_SHAPES,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
  RULER_UNITS,
  SPOTLIGHT_FEATHER_PRESETS,
  SPOTLIGHT_SHAPES,
  type ColorMetadata,
  type BlendMode,
  type ArrowLayerPayload,
  type CalloutPayload,
  type CensorLayerPayload,
  type EmojiPayload,
  type LoupeLayerPayload,
  type ShapeLayerPayload,
  type PencilLayerPayload,
  type MarkerLayerPayload,
  type NumberedMarkerPayload,
  type RulerLayerPayload,
  type RichTextContent,
  type RichTextParagraph,
  type RichTextSpan,
  type SrgbColor,
  type SpotlightLayerPayload,
  type TextLayerPayload,
  type EditorDocument,
  type ImageLayerPayload,
  type JsonObject,
  type LayerKind,
  type LayerNode,
  type ParsedEditorDocument,
  type PresentationSettingsV1,
  type Rect,
  type SourceImageRef,
  type Transform2D,
} from './types'
import {
  assertValidFreeformPolygon,
  assertValidLoupeSourceRegion,
  pointsBounds,
  rulerVisualBoundsAreConservative,
} from '../precision-tools'

const imageFormats = ['png', 'jpeg', 'webp', 'svg'] as const
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const MAX_TEXT_UTF16_LENGTH = 100_000
const MAX_RICH_TEXT_RANGES = 2_048
const MAX_TEXT_FONT_SIZE = 512
const MAX_TEXT_PADDING = 256
const MAX_IMAGE_RADIUS = 16_384
const MAX_CENSOR_BLOCK_SIZE = 128
const MAX_CENSOR_BLUR_STRENGTH = 128
const MAX_LOUPE_ZOOM = 16
const MAX_LOUPE_SIZE = 2_048
const MAX_LOUPE_BORDER_WIDTH = 64
const MAX_LOUPE_SHADOW_OFFSET = 512
const MAX_LOUPE_SHADOW_BLUR = 128
const GEOMETRY_EPSILON = 1e-9
const INLINE_IMAGE_FIELDS = [
  'data',
  'base64',
  'bytes',
  'dataUrl',
  'src',
] as const

type ImageFormat = (typeof imageFormats)[number]

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

function assertOnlyFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
  field: string,
): void {
  const allowed = new Set(allowedFields)
  const unexpected = Object.keys(input).find((key) => !allowed.has(key))
  if (unexpected !== undefined) {
    throw new Error(`${field}.${unexpected} is unexpected or removed in v7`)
  }
}

function readStableId(value: unknown, field: string): string {
  const id = readNonEmptyString(value, field)
  if (!UUID_PATTERN.test(id) && !ULID_PATTERN.test(id)) {
    throw new Error(`${field} must be a UUID or ULID`)
  }
  return id
}

function readSha256(value: unknown, field: string): string {
  const hash = readNonEmptyString(value, field)
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`${field} must be a lowercase SHA-256 hash`)
  }
  return hash
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`)
  }
  return value
}

function readPositiveNumber(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field)
  if (number <= 0) throw new Error(`${field} must be positive`)
  return number
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`)
  return value
}

function isImageFormat(value: unknown): value is ImageFormat {
  return (
    typeof value === 'string' && imageFormats.includes(value as ImageFormat)
  )
}

function isLayerKind(value: unknown): value is LayerKind {
  return typeof value === 'string' && LAYER_KINDS.includes(value as LayerKind)
}

function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && BLEND_MODES.includes(value as BlendMode)
}

function parseTransform(value: unknown, field: string): Transform2D {
  const input = readJsonObject(value, field)
  const transform = {
    translateX: readFiniteNumber(input.translateX, `${field}.translateX`),
    translateY: readFiniteNumber(input.translateY, `${field}.translateY`),
    rotation: readFiniteNumber(input.rotation, `${field}.rotation`),
    scaleX: readFiniteNumber(input.scaleX, `${field}.scaleX`),
    scaleY: readFiniteNumber(input.scaleY, `${field}.scaleY`),
  }
  if (transform.scaleX === 0 || transform.scaleY === 0) {
    throw new Error(`${field} scales must not be zero`)
  }
  return Object.freeze(transform)
}

function parseColor(value: unknown, field: string): ColorMetadata {
  const input = readJsonObject(value, field)
  const colorSpace = input.colorSpace
  if (
    colorSpace !== 'srgb' &&
    colorSpace !== 'display-p3' &&
    colorSpace !== 'unknown'
  ) {
    throw new Error(`${field}.colorSpace is invalid`)
  }
  const dpiX =
    input.dpiX === undefined
      ? undefined
      : readPositiveNumber(input.dpiX, `${field}.dpiX`)
  const dpiY =
    input.dpiY === undefined
      ? undefined
      : readPositiveNumber(input.dpiY, `${field}.dpiY`)
  return Object.freeze({
    colorSpace,
    hasIccProfile: readBoolean(input.hasIccProfile, `${field}.hasIccProfile`),
    ...(dpiX === undefined ? {} : { dpiX }),
    ...(dpiY === undefined ? {} : { dpiY }),
  })
}

function colorToJson(color: ColorMetadata): ColorMetadata & JsonObject {
  return Object.freeze({
    colorSpace: color.colorSpace,
    hasIccProfile: color.hasIccProfile,
    ...(color.dpiX === undefined ? {} : { dpiX: color.dpiX }),
    ...(color.dpiY === undefined ? {} : { dpiY: color.dpiY }),
  }) as ColorMetadata & JsonObject
}

function parseSource(value: unknown): SourceImageRef {
  const input = readJsonObject(value, 'source')
  if (INLINE_IMAGE_FIELDS.some((key) => Object.hasOwn(input, key))) {
    throw new Error('source must reference immutable image bytes by hash')
  }
  if (!isImageFormat(input.format)) throw new Error('source.format is invalid')
  if (input.orientationApplied !== true) {
    throw new Error('source.orientationApplied must be true')
  }
  if (
    input.provenance !== 'capture' &&
    input.provenance !== 'fileOpen' &&
    input.provenance !== 'clipboard'
  ) {
    throw new Error('source.provenance is invalid')
  }
  return Object.freeze({
    blobHash: readSha256(input.blobHash, 'source.blobHash'),
    format: input.format,
    mimeType: readNonEmptyString(input.mimeType, 'source.mimeType'),
    width: readPositiveNumber(input.width, 'source.width'),
    height: readPositiveNumber(input.height, 'source.height'),
    orientationApplied: true,
    provenance: input.provenance,
    color: parseColor(input.color, 'source.color'),
  })
}

function sourceToJson(source: SourceImageRef): JsonObject {
  return {
    blobHash: source.blobHash,
    format: source.format,
    mimeType: source.mimeType,
    width: source.width,
    height: source.height,
    orientationApplied: true,
    provenance: source.provenance ?? 'capture',
    color: colorToJson(source.color),
  }
}

function parseRect(value: unknown, field: string): Rect {
  const input = readJsonObject(value, field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
    width: readPositiveNumber(input.width, `${field}.width`),
    height: readPositiveNumber(input.height, `${field}.height`),
  })
}

function rectToJson(rect: Rect): JsonObject {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function parsePresentation(value: unknown): PresentationSettingsV1 {
  const input = readJsonObject(value, 'presentation')
  const beautify = readJsonObject(input.beautify, 'presentation.beautify')
  const watermark = readJsonObject(input.watermark, 'presentation.watermark')
  if (beautify.enabled !== false || watermark.enabled !== false) {
    throw new Error('presentation contains unsupported settings')
  }
  return DEFAULT_PRESENTATION_SETTINGS
}

function parseBoundedNonNegative(
  value: unknown,
  field: string,
  maximum: number,
): number {
  const number = readFiniteNumber(value, field)
  if (number < 0 || number > maximum) {
    throw new Error(`${field} is outside supported bounds`)
  }
  return number
}

function isUtf16Boundary(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return true
  const before = text.charCodeAt(offset - 1)
  const after = text.charCodeAt(offset)
  return !(
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  )
}

function parseTextRange(
  value: unknown,
  field: string,
  text: string,
): Readonly<{ start: number; end: number }> {
  const input = readJsonObject(value, field)
  const start = readFiniteNumber(input.start, `${field}.start`)
  const end = readFiniteNumber(input.end, `${field}.end`)
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > text.length ||
    !isUtf16Boundary(text, start) ||
    !isUtf16Boundary(text, end)
  ) {
    throw new Error(`${field} must use UTF-16 code-point boundaries`)
  }
  return Object.freeze({ start, end })
}

function canonicalizeRichTextSpans(
  spans: readonly RichTextSpan[],
): readonly RichTextSpan[] {
  const result: RichTextSpan[] = []
  for (const span of spans) {
    const previous = result.at(-1)
    const previousStyle = previous
      ? JSON.stringify({ ...previous, start: 0, end: 0 })
      : undefined
    const style = JSON.stringify({ ...span, start: 0, end: 0 })
    if (previous && previous.end === span.start && previousStyle === style) {
      result[result.length - 1] = Object.freeze({ ...previous, end: span.end })
    } else {
      result.push(span)
    }
  }
  return Object.freeze(result)
}

function parseRichTextContent(value: unknown, field: string): RichTextContent {
  const input = readJsonObject(value, field)
  assertOnlyFields(
    input,
    ['text', 'wrap', 'fixedWidth', 'spans', 'paragraphs'],
    field,
  )
  const text = typeof input.text === 'string' ? input.text : undefined
  if (text === undefined || text.length > MAX_TEXT_UTF16_LENGTH) {
    throw new Error(`${field}.text is invalid`)
  }
  if (input.wrap !== 'autoSize' && input.wrap !== 'fixedWidth') {
    throw new Error(`${field}.wrap is invalid`)
  }
  const fixedWidth =
    input.wrap === 'fixedWidth'
      ? readPositiveNumber(input.fixedWidth, `${field}.fixedWidth`)
      : undefined
  if (input.wrap === 'autoSize' && input.fixedWidth !== undefined) {
    throw new Error(`${field}.fixedWidth is only valid for fixedWidth text`)
  }
  if (
    !Array.isArray(input.spans) ||
    !Array.isArray(input.paragraphs) ||
    input.spans.length > MAX_RICH_TEXT_RANGES ||
    input.paragraphs.length > MAX_RICH_TEXT_RANGES
  ) {
    throw new Error(`${field} ranges are invalid`)
  }
  let previousEnd = 0
  const parsedSpans = (input.spans as readonly unknown[]).map((span, index) => {
    const range = parseTextRange(span, `${field}.spans[${index}]`, text)
    const item = readJsonObject(span, `${field}.spans[${index}]`)
    assertOnlyFields(
      item,
      [
        'start',
        'end',
        'fontFamily',
        'fontSize',
        'color',
        'weight',
        'italic',
        'strikethrough',
      ],
      `${field}.spans[${index}]`,
    )
    if (range.start !== previousEnd || range.end <= range.start) {
      throw new Error(`${field}.spans must be contiguous non-empty ranges`)
    }
    previousEnd = range.end
    const fontFamily = readNonEmptyString(
      item.fontFamily,
      `${field}.spans[${index}].fontFamily`,
    )
    const fontSize = readPositiveNumber(
      item.fontSize,
      `${field}.spans[${index}].fontSize`,
    )
    if (fontSize > MAX_TEXT_FONT_SIZE) {
      throw new Error(
        `${field}.spans[${index}].fontSize is outside supported bounds`,
      )
    }
    const weight = readFiniteNumber(
      item.weight,
      `${field}.spans[${index}].weight`,
    )
    if (
      !Number.isInteger(weight) ||
      weight < 100 ||
      weight > 900 ||
      weight % 100 !== 0
    ) {
      throw new Error(`${field}.spans[${index}].weight is invalid`)
    }
    const color = parseSrgbColor(
      item.color,
      `${field}.spans[${index}].color`,
    ) as unknown as SrgbColor
    return Object.freeze({
      ...range,
      fontFamily,
      fontSize,
      color,
      weight: weight as RichTextSpan['weight'],
      italic: readBoolean(item.italic, `${field}.spans[${index}].italic`),
      strikethrough: readBoolean(
        item.strikethrough,
        `${field}.spans[${index}].strikethrough`,
      ),
    }) as RichTextSpan
  })
  const spans = canonicalizeRichTextSpans(parsedSpans)
  if (
    (text.length === 0 && spans.length !== 0) ||
    (text.length > 0 && (spans.length === 0 || previousEnd !== text.length))
  ) {
    throw new Error(`${field}.spans must cover text exactly`)
  }
  previousEnd = 0
  const paragraphs = input.paragraphs.map((paragraph, index) => {
    const range = parseTextRange(
      paragraph,
      `${field}.paragraphs[${index}]`,
      text,
    )
    const item = readJsonObject(paragraph, `${field}.paragraphs[${index}]`)
    assertOnlyFields(
      item,
      ['start', 'end', 'alignment', 'listKind'],
      `${field}.paragraphs[${index}]`,
    )
    const terminalEmpty =
      index === (input.paragraphs as readonly unknown[]).length - 1 &&
      range.start === text.length &&
      range.end === text.length &&
      text.endsWith('\n')
    if (
      range.start !== previousEnd ||
      (range.end <= range.start && !terminalEmpty)
    ) {
      throw new Error(`${field}.paragraphs must be contiguous non-empty ranges`)
    }
    previousEnd = range.end
    if (!['start', 'center', 'end'].includes(String(item.alignment))) {
      throw new Error(`${field}.paragraphs[${index}].alignment is invalid`)
    }
    if (item.listKind !== 'none' && item.listKind !== 'bullet') {
      throw new Error(`${field}.paragraphs[${index}].listKind is invalid`)
    }
    return Object.freeze({
      ...range,
      alignment: item.alignment as RichTextParagraph['alignment'],
      listKind: item.listKind,
    }) as RichTextParagraph
  })
  if (
    (text.length === 0 && paragraphs.length !== 0) ||
    (text.length > 0 &&
      (paragraphs.length === 0 || previousEnd !== text.length))
  ) {
    throw new Error(`${field}.paragraphs must cover text exactly`)
  }
  return Object.freeze({
    text,
    wrap: input.wrap,
    ...(fixedWidth === undefined ? {} : { fixedWidth }),
    spans,
    paragraphs: Object.freeze(paragraphs),
  })
}

function parseTextBackground(
  value: unknown,
  field: string,
): NonNullable<TextLayerPayload['background']> {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['color', 'padding', 'radius'], field)
  return Object.freeze({
    color: parseSrgbColor(input.color, `${field}.color`),
    padding: parseBoundedNonNegative(
      input.padding,
      `${field}.padding`,
      MAX_TEXT_PADDING,
    ),
    radius: parseBoundedNonNegative(
      input.radius,
      `${field}.radius`,
      MAX_IMAGE_RADIUS,
    ),
  }) as NonNullable<TextLayerPayload['background']>
}

function parseTextPayload(value: unknown, field: string): TextLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['content', 'background'], field)
  return Object.freeze({
    content: parseRichTextContent(input.content, `${field}.content`),
    background:
      input.background === null
        ? null
        : parseTextBackground(input.background, `${field}.background`),
  })
}

function parseNumberedMarkerPayload(
  value: unknown,
  field: string,
): NumberedMarkerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['sequence', 'label', 'badge'], field)
  const sequence = readPositiveNumber(input.sequence, `${field}.sequence`)
  if (!Number.isInteger(sequence))
    throw new Error(`${field}.sequence is invalid`)
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
      color: parseSrgbColor(
        badge.color,
        `${field}.badge.color`,
      ) as unknown as SrgbColor,
    }),
  })
}

function parseCalloutRoute(
  value: unknown,
  field: string,
): CalloutPayload['route'] {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['path', 'elbow'], field)
  if (input.path !== 'elbow') throw new Error(`${field}.path is invalid`)
  const elbow = readJsonObject(input.elbow, `${field}.elbow`)
  assertOnlyFields(elbow, ['axis', 'offset'], `${field}.elbow`)
  if (elbow.axis !== 'x' && elbow.axis !== 'y') {
    throw new Error(`${field}.elbow.axis is invalid`)
  }
  return Object.freeze({
    path: 'elbow',
    elbow: Object.freeze({
      axis: elbow.axis,
      offset: readFiniteNumber(elbow.offset, `${field}.elbow.offset`),
    }),
  }) as CalloutPayload['route']
}

function parseCalloutMarker(
  value: unknown,
  field: string,
): CalloutPayload['targetMarker'] {
  if (value !== 'circle') throw new Error(`${field} is invalid`)
  return 'circle'
}

function parseCalloutPayload(value: unknown, field: string): CalloutPayload {
  const input = readJsonObject(value, field)
  if (Object.hasOwn(input, 'bubble') || Object.hasOwn(input, 'tailAnchor')) {
    throw new Error(
      `${field} legacy callout bubble/tail fields are removed in v7`,
    )
  }
  assertOnlyFields(
    input,
    [
      'content',
      'background',
      'target',
      'label',
      'route',
      'stroke',
      'targetMarker',
      'labelMarker',
    ],
    field,
  )
  return Object.freeze({
    content: parseRichTextContent(input.content, `${field}.content`),
    background:
      input.background === null
        ? null
        : parseTextBackground(input.background, `${field}.background`),
    target: parsePointPayload(
      input.target,
      `${field}.target`,
    ) as CalloutPayload['target'],
    label: parsePointPayload(
      input.label,
      `${field}.label`,
    ) as CalloutPayload['label'],
    route: parseCalloutRoute(input.route, `${field}.route`),
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as CalloutPayload['stroke'],
    targetMarker: parseCalloutMarker(
      input.targetMarker,
      `${field}.targetMarker`,
    ),
    labelMarker: parseCalloutMarker(input.labelMarker, `${field}.labelMarker`),
  })
}

function parseEmojiPayload(value: unknown, field: string): EmojiPayload {
  const input = readJsonObject(value, field)
  const grapheme = readNonEmptyString(input.grapheme, `${field}.grapheme`)
  if ([...grapheme].length > 16) throw new Error(`${field}.grapheme is invalid`)
  const asset = readJsonObject(input.asset, `${field}.asset`)
  if (asset.collection !== 'notoEmoji')
    throw new Error(`${field}.asset.collection is invalid`)
  return Object.freeze({
    grapheme,
    asset: Object.freeze({
      collection: 'notoEmoji',
      version: readNonEmptyString(asset.version, `${field}.asset.version`),
      assetId: readNonEmptyString(asset.assetId, `${field}.asset.assetId`),
    }),
  })
}

function parseImagePayload(value: unknown, field: string): ImageLayerPayload {
  const input = readJsonObject(value, field)
  if (INLINE_IMAGE_FIELDS.some((key) => Object.hasOwn(input, key))) {
    throw new Error(`${field} must reference immutable image bytes by hash`)
  }
  if (!isImageFormat(input.format))
    throw new Error(`${field}.format is invalid`)
  if (input.orientationApplied !== true) {
    throw new Error(`${field}.orientationApplied must be true`)
  }
  if (input.role !== 'base' && input.role !== 'content') {
    throw new Error(`${field}.role is invalid`)
  }
  const color = colorToJson(parseColor(input.color, `${field}.color`))
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
    intrinsicWidth: readPositiveNumber(
      input.intrinsicWidth,
      `${field}.intrinsicWidth`,
    ),
    intrinsicHeight: readPositiveNumber(
      input.intrinsicHeight,
      `${field}.intrinsicHeight`,
    ),
    format: input.format,
    orientationApplied: true,
    color,
    role: input.role,
    border:
      input.border === null
        ? null
        : (parseStroke(input.border, `${field}.border`) as Exclude<
            ImageLayerPayload['border'],
            undefined
          >),
    radius: parseBoundedNonNegative(
      input.radius,
      `${field}.radius`,
      MAX_IMAGE_RADIUS,
    ),
    crop: null,
    mask: null,
  })
}

function parseUnitInterval(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field)
  if (number < 0 || number > 1) {
    throw new Error(`${field} must be between 0 and 1`)
  }
  return number
}

function parseSrgbColor(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['red', 'green', 'blue', 'alpha'], field)
  return Object.freeze({
    red: parseUnitInterval(input.red, `${field}.red`),
    green: parseUnitInterval(input.green, `${field}.green`),
    blue: parseUnitInterval(input.blue, `${field}.blue`),
    alpha: parseUnitInterval(input.alpha, `${field}.alpha`),
  })
}

function parsePointPayload(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
  })
}

function parseStroke(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  if (
    input.style !== 'solid' &&
    input.style !== 'dashed' &&
    input.style !== 'dotted'
  ) {
    throw new Error(`${field}.style is invalid`)
  }
  if (input.cap !== 'butt' && input.cap !== 'round' && input.cap !== 'square') {
    throw new Error(`${field}.cap is invalid`)
  }
  if (
    input.join !== 'miter' &&
    input.join !== 'round' &&
    input.join !== 'bevel'
  ) {
    throw new Error(`${field}.join is invalid`)
  }
  return Object.freeze({
    color: parseSrgbColor(input.color, `${field}.color`),
    width: readPositiveNumber(input.width, `${field}.width`),
    style: input.style,
    cap: input.cap,
    join: input.join,
  })
}

function parsePaintTransform(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  const scale = readPositiveNumber(input.scale, `${field}.scale`)
  return Object.freeze({
    scale,
    rotation: readFiniteNumber(input.rotation, `${field}.rotation`),
    offsetX: readFiniteNumber(input.offsetX, `${field}.offsetX`),
    offsetY: readFiniteNumber(input.offsetY, `${field}.offsetY`),
  })
}

function parseGradientStops(
  value: unknown,
  field: string,
): readonly JsonObject[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    throw new Error(`${field} must contain 2 to 8 stops`)
  }
  let previous = -Infinity
  const stops = value.map((stop, index) => {
    const input = readJsonObject(stop, `${field}[${index}]`)
    const position = parseUnitInterval(
      input.position,
      `${field}[${index}].position`,
    )
    if (position < previous) throw new Error(`${field} must be ordered`)
    previous = position
    return Object.freeze({
      position,
      color: parseSrgbColor(input.color, `${field}[${index}].color`),
    })
  })
  return Object.freeze(stops)
}

function parseFill(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  switch (input.kind) {
    case 'none':
      return Object.freeze({ kind: 'none' })
    case 'solid':
      return Object.freeze({
        kind: 'solid',
        color: parseSrgbColor(input.color, `${field}.color`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    case 'linearGradient':
      return Object.freeze({
        kind: 'linearGradient',
        stops: parseGradientStops(input.stops, `${field}.stops`),
        start: parsePointPayload(input.start, `${field}.start`),
        end: parsePointPayload(input.end, `${field}.end`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    case 'radialGradient':
      return Object.freeze({
        kind: 'radialGradient',
        stops: parseGradientStops(input.stops, `${field}.stops`),
        center: parsePointPayload(input.center, `${field}.center`),
        radius: readPositiveNumber(input.radius, `${field}.radius`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    case 'pattern': {
      const pattern = input.pattern
      if (
        pattern !== 'dots' &&
        pattern !== 'grid' &&
        pattern !== 'diagonal' &&
        pattern !== 'crosshatch' &&
        pattern !== 'checker'
      ) {
        throw new Error(`${field}.pattern is invalid`)
      }
      return Object.freeze({
        kind: 'pattern',
        pattern,
        color: parseSrgbColor(input.color, `${field}.color`),
        background: parseSrgbColor(input.background, `${field}.background`),
        transform: parsePaintTransform(input.transform, `${field}.transform`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    }
    case 'imageTexture': {
      if (
        input.format !== 'png' &&
        input.format !== 'jpeg' &&
        input.format !== 'webp'
      ) {
        throw new Error(`${field}.format is invalid`)
      }
      if (
        input.fit !== 'repeat' &&
        input.fit !== 'fit' &&
        input.fit !== 'fill'
      ) {
        throw new Error(`${field}.fit is invalid`)
      }
      return Object.freeze({
        kind: 'imageTexture',
        blobHash: readSha256(input.blobHash, `${field}.blobHash`),
        format: input.format,
        intrinsicWidth: readPositiveNumber(
          input.intrinsicWidth,
          `${field}.intrinsicWidth`,
        ),
        intrinsicHeight: readPositiveNumber(
          input.intrinsicHeight,
          `${field}.intrinsicHeight`,
        ),
        fit: input.fit,
        transform: parsePaintTransform(input.transform, `${field}.transform`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    }
    default:
      throw new Error(`${field}.kind is invalid`)
  }
}

function parseArrowPayload(value: unknown, field: string): ArrowLayerPayload {
  const input = readJsonObject(value, field)
  if (
    input.path !== 'straight' &&
    input.path !== 'quadratic' &&
    input.path !== 'elbow'
  ) {
    throw new Error(`${field}.path is invalid`)
  }
  const parseCap = (value: unknown, cap: string) => {
    if (ARROW_CAPS.includes(value as (typeof ARROW_CAPS)[number])) {
      return value as (typeof ARROW_CAPS)[number]
    }
    throw new Error(`${field}.${cap} is invalid`)
  }
  const startCap = parseCap(input.startCap, 'startCap')
  const endCap = parseCap(input.endCap, 'endCap')
  if (input.path === 'quadratic' && input.bend === undefined) {
    throw new Error(`${field}.bend is required for a quadratic path`)
  }
  if (input.path === 'elbow' && input.elbow === undefined) {
    throw new Error(`${field}.elbow is required for an elbow path`)
  }
  if (input.text !== undefined || input.label !== undefined) {
    throw new Error(`${field} connector text is not supported`)
  }
  const elbow =
    input.path === 'elbow'
      ? (() => {
          const route = readJsonObject(input.elbow, `${field}.elbow`)
          if (route.axis !== 'x' && route.axis !== 'y') {
            throw new Error(`${field}.elbow.axis is invalid`)
          }
          return Object.freeze({
            axis: route.axis,
            offset: readFiniteNumber(route.offset, `${field}.elbow.offset`),
          })
        })()
      : undefined
  return Object.freeze({
    path: input.path,
    start: parsePointPayload(
      input.start,
      `${field}.start`,
    ) as ArrowLayerPayload['start'],
    end: parsePointPayload(
      input.end,
      `${field}.end`,
    ) as ArrowLayerPayload['end'],
    ...(input.path !== 'quadratic'
      ? {}
      : {
          bend: parsePointPayload(
            input.bend,
            `${field}.bend`,
          ) as ArrowLayerPayload['start'],
        }),
    ...(elbow === undefined ? {} : { elbow }),
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as ArrowLayerPayload['stroke'],
    startCap,
    endCap,
  })
}

function parseShapePayload(value: unknown, field: string): ShapeLayerPayload {
  const input = readJsonObject(value, field)
  if (
    !['rectangle', 'circle', 'oval', 'diamond', 'star'].includes(
      String(input.shape),
    )
  ) {
    throw new Error(`${field}.shape is invalid`)
  }
  const fill = parseFill(input.fill, `${field}.fill`)
  const radius = readFiniteNumber(input.cornerRadius, `${field}.cornerRadius`)
  const starPoints = readFiniteNumber(input.starPoints, `${field}.starPoints`)
  const innerRatio = parseUnitInterval(
    input.starInnerRatio,
    `${field}.starInnerRatio`,
  )
  if (
    radius < 0 ||
    starPoints < 3 ||
    starPoints > 32 ||
    !Number.isInteger(starPoints)
  ) {
    throw new Error(`${field} geometry is invalid`)
  }
  return Object.freeze({
    shape: input.shape as ShapeLayerPayload['shape'],
    fill: fill as ShapeLayerPayload['fill'],
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as ShapeLayerPayload['stroke'],
    cornerRadius: radius,
    starPoints,
    starInnerRatio: innerRatio,
  })
}

function parseSampledPayload(
  value: unknown,
  field: string,
  marker: boolean,
): PencilLayerPayload | MarkerLayerPayload {
  const input = readJsonObject(value, field)
  if (!Array.isArray(input.points) || input.points.length === 0) {
    throw new Error(`${field}.points must not be empty`)
  }
  const points = input.points.map((point, index) => {
    const parsed = readJsonObject(point, `${field}.points[${index}]`)
    return Object.freeze({
      x: readFiniteNumber(parsed.x, `${field}.points[${index}].x`),
      y: readFiniteNumber(parsed.y, `${field}.points[${index}].y`),
      pressure: parseUnitInterval(
        parsed.pressure,
        `${field}.points[${index}].pressure`,
      ),
    })
  })
  const common = {
    points: Object.freeze(points),
    width: readPositiveNumber(input.width, `${field}.width`),
    color: parseSrgbColor(input.color, `${field}.color`),
    smoothing: parseUnitInterval(input.smoothing, `${field}.smoothing`),
  }
  if (marker) return Object.freeze(common) as MarkerLayerPayload
  if (
    input.brush !== 'pen' &&
    input.brush !== 'pencil' &&
    input.brush !== 'brush'
  ) {
    throw new Error(`${field}.brush is invalid`)
  }
  return Object.freeze({ ...common, brush: input.brush }) as PencilLayerPayload
}

function parseStrictPoint(
  value: unknown,
  field: string,
): Readonly<{ x: number; y: number }> & JsonObject {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['x', 'y'], field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
  })
}

function parseStrictRect(value: unknown, field: string): Rect & JsonObject {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['x', 'y', 'width', 'height'], field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
    width: readPositiveNumber(input.width, `${field}.width`),
    height: readPositiveNumber(input.height, `${field}.height`),
  })
}

function parseCensorPayload(value: unknown, field: string): CensorLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['region', 'effect', 'sampleSource'], field)
  if (input.sampleSource !== 'compositeBelow') {
    throw new Error(`${field}.sampleSource must be compositeBelow`)
  }
  const rawRegion = readJsonObject(input.region, `${field}.region`)
  let region: CensorLayerPayload['region']
  if (rawRegion.kind === 'rectangle') {
    assertOnlyFields(rawRegion, ['kind'], `${field}.region`)
    region = Object.freeze({ kind: 'rectangle' })
  } else if (rawRegion.kind === 'freeform') {
    assertOnlyFields(rawRegion, ['kind', 'points'], `${field}.region`)
    if (!Array.isArray(rawRegion.points)) {
      throw new Error(`${field}.region.points must be an array`)
    }
    const points = rawRegion.points.map((point, index) =>
      parseStrictPoint(point, `${field}.region.points[${index}]`),
    )
    assertValidFreeformPolygon(points, `${field}.region.points`)
    region = Object.freeze({
      kind: 'freeform',
      points: Object.freeze(points),
    }) as CensorLayerPayload['region']
  } else {
    throw new Error(`${field}.region.kind is invalid`)
  }

  const rawEffect = readJsonObject(input.effect, `${field}.effect`)
  if (!CENSOR_MODES.includes(rawEffect.mode as (typeof CENSOR_MODES)[number])) {
    throw new Error(`${field}.effect.mode is invalid`)
  }
  let effect: CensorLayerPayload['effect']
  if (rawEffect.mode === 'pixelate') {
    assertOnlyFields(rawEffect, ['mode', 'blockSize'], `${field}.effect`)
    const blockSize = readFiniteNumber(
      rawEffect.blockSize,
      `${field}.effect.blockSize`,
    )
    if (
      !Number.isInteger(blockSize) ||
      blockSize < 2 ||
      blockSize > MAX_CENSOR_BLOCK_SIZE
    ) {
      throw new Error(`${field}.effect.blockSize is outside supported bounds`)
    }
    effect = Object.freeze({ mode: 'pixelate', blockSize })
  } else if (rawEffect.mode === 'blur') {
    assertOnlyFields(rawEffect, ['mode', 'strength'], `${field}.effect`)
    const strength = readFiniteNumber(
      rawEffect.strength,
      `${field}.effect.strength`,
    )
    if (strength < 0.5 || strength > MAX_CENSOR_BLUR_STRENGTH) {
      throw new Error(`${field}.effect.strength is outside supported bounds`)
    }
    effect = Object.freeze({ mode: 'blur', strength })
  } else {
    assertOnlyFields(rawEffect, ['mode', 'color'], `${field}.effect`)
    effect = Object.freeze({
      mode: 'solid',
      color: parseSrgbColor(
        rawEffect.color,
        `${field}.effect.color`,
      ) as unknown as SrgbColor,
    })
  }
  return Object.freeze({ region, effect, sampleSource: 'compositeBelow' })
}

function parseSpotlightPayload(
  value: unknown,
  field: string,
): SpotlightLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['shape', 'dimColor', 'dimOpacity', 'feather'], field)
  if (
    !SPOTLIGHT_SHAPES.includes(input.shape as (typeof SPOTLIGHT_SHAPES)[number])
  ) {
    throw new Error(`${field}.shape is invalid`)
  }
  if (
    input.feather !== null &&
    !SPOTLIGHT_FEATHER_PRESETS.includes(
      input.feather as (typeof SPOTLIGHT_FEATHER_PRESETS)[number],
    )
  ) {
    throw new Error(`${field}.feather is invalid`)
  }
  return Object.freeze({
    shape: input.shape as SpotlightLayerPayload['shape'],
    dimColor: parseSrgbColor(
      input.dimColor,
      `${field}.dimColor`,
    ) as unknown as SrgbColor,
    dimOpacity: parseUnitInterval(input.dimOpacity, `${field}.dimOpacity`),
    feather: input.feather as SpotlightLayerPayload['feather'],
  })
}

function parseRulerPayload(value: unknown, field: string): RulerLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(
    input,
    [
      'start',
      'end',
      'unit',
      'percentBasis',
      'snapAngleIncrementDegrees',
      'color',
      'thickness',
      'fontSize',
    ],
    field,
  )
  if (!RULER_UNITS.includes(input.unit as (typeof RULER_UNITS)[number])) {
    throw new Error(`${field}.unit is invalid`)
  }
  if (input.percentBasis !== 'canvasDiagonal') {
    throw new Error(`${field}.percentBasis is invalid`)
  }
  const start = parseStrictPoint(input.start, `${field}.start`)
  const end = parseStrictPoint(input.end, `${field}.end`)
  if (start.x === end.x && start.y === end.y) {
    throw new Error(`${field} endpoints must be distinct`)
  }
  const increment = readFiniteNumber(
    input.snapAngleIncrementDegrees,
    `${field}.snapAngleIncrementDegrees`,
  )
  if (increment <= 0 || increment > 90) {
    throw new Error(`${field}.snapAngleIncrementDegrees is invalid`)
  }
  const thickness = readFiniteNumber(input.thickness, `${field}.thickness`)
  if (
    !Number.isInteger(thickness) ||
    thickness < RULER_THICKNESS_BOUNDS.min ||
    thickness > RULER_THICKNESS_BOUNDS.max
  ) {
    throw new Error(`${field}.thickness is invalid`)
  }
  const fontSize = readFiniteNumber(input.fontSize, `${field}.fontSize`)
  if (
    !Number.isInteger(fontSize) ||
    fontSize < RULER_FONT_SIZE_BOUNDS.min ||
    fontSize > RULER_FONT_SIZE_BOUNDS.max
  ) {
    throw new Error(`${field}.fontSize is invalid`)
  }
  return Object.freeze({
    start,
    end,
    unit: input.unit as RulerLayerPayload['unit'],
    percentBasis: 'canvasDiagonal',
    snapAngleIncrementDegrees: increment,
    color: parseSrgbColor(
      input.color,
      `${field}.color`,
    ) as unknown as SrgbColor,
    thickness,
    fontSize,
  }) as RulerLayerPayload
}

function parseLoupeShadow(
  value: unknown,
  field: string,
): LoupeLayerPayload['shadow'] {
  if (value === null) return null
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['color', 'offsetX', 'offsetY', 'blur'], field)
  const offsetX = readFiniteNumber(input.offsetX, `${field}.offsetX`)
  const offsetY = readFiniteNumber(input.offsetY, `${field}.offsetY`)
  const blur = readFiniteNumber(input.blur, `${field}.blur`)
  if (
    Math.abs(offsetX) > MAX_LOUPE_SHADOW_OFFSET ||
    Math.abs(offsetY) > MAX_LOUPE_SHADOW_OFFSET ||
    blur < 0 ||
    blur > MAX_LOUPE_SHADOW_BLUR
  ) {
    throw new Error(`${field} is outside supported bounds`)
  }
  return Object.freeze({
    color: parseSrgbColor(
      input.color,
      `${field}.color`,
    ) as unknown as SrgbColor,
    offsetX,
    offsetY,
    blur,
  })
}

function parseLoupePayload(value: unknown, field: string): LoupeLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(
    input,
    ['sourceRegion', 'lens', 'zoom', 'border', 'shadow', 'sampleSource'],
    field,
  )
  if (input.sampleSource !== 'compositeBelow') {
    throw new Error(`${field}.sampleSource must be compositeBelow`)
  }
  const sourceRegion = parseStrictRect(
    input.sourceRegion,
    `${field}.sourceRegion`,
  )
  if (Math.abs(sourceRegion.width - sourceRegion.height) > GEOMETRY_EPSILON) {
    throw new Error(`${field}.sourceRegion must be square`)
  }
  const lens = readJsonObject(input.lens, `${field}.lens`)
  assertOnlyFields(lens, ['shape', 'size'], `${field}.lens`)
  if (!LOUPE_SHAPES.includes(lens.shape as (typeof LOUPE_SHAPES)[number])) {
    throw new Error(`${field}.lens.shape is invalid`)
  }
  const size = readFiniteNumber(lens.size, `${field}.lens.size`)
  if (size < 16 || size > MAX_LOUPE_SIZE) {
    throw new Error(`${field}.lens.size is outside supported bounds`)
  }
  const zoom = readFiniteNumber(input.zoom, `${field}.zoom`)
  if (zoom < 1 || zoom > MAX_LOUPE_ZOOM) {
    throw new Error(`${field}.zoom is outside supported bounds`)
  }
  if (Math.abs(sourceRegion.width * zoom - size) > GEOMETRY_EPSILON) {
    throw new Error(`${field} sourceRegion size must equal lens size / zoom`)
  }
  const border = readJsonObject(input.border, `${field}.border`)
  assertOnlyFields(border, ['color', 'width'], `${field}.border`)
  const borderWidth = readFiniteNumber(border.width, `${field}.border.width`)
  if (borderWidth < 0 || borderWidth > MAX_LOUPE_BORDER_WIDTH) {
    throw new Error(`${field}.border.width is outside supported bounds`)
  }
  return Object.freeze({
    sourceRegion,
    lens: Object.freeze({
      shape: lens.shape as LoupeLayerPayload['lens']['shape'],
      size,
    }),
    zoom,
    border: Object.freeze({
      color: parseSrgbColor(
        border.color,
        `${field}.border.color`,
      ) as unknown as SrgbColor,
      width: borderWidth,
    }),
    shadow: parseLoupeShadow(input.shadow, `${field}.shadow`),
    sampleSource: 'compositeBelow',
  })
}

function assertPrecisionPayloadBounds(
  kind: LayerKind,
  payload: JsonObject,
  localBounds: Rect,
  field: string,
): void {
  if (kind === 'censor') {
    const censor = payload as unknown as CensorLayerPayload
    if (censor.region.kind === 'freeform') {
      const bounds = pointsBounds(censor.region.points)
      if (
        Math.abs(bounds.x - localBounds.x) > GEOMETRY_EPSILON ||
        Math.abs(bounds.y - localBounds.y) > GEOMETRY_EPSILON ||
        Math.abs(bounds.width - localBounds.width) > GEOMETRY_EPSILON ||
        Math.abs(bounds.height - localBounds.height) > GEOMETRY_EPSILON
      ) {
        throw new Error(`${field}.localBounds must match its freeform region`)
      }
    }
  } else if (kind === 'ruler') {
    const ruler = payload as unknown as RulerLayerPayload
    for (const [name, point] of [
      ['start', ruler.start],
      ['end', ruler.end],
    ] as const) {
      if (
        point.x < localBounds.x ||
        point.x > localBounds.x + localBounds.width ||
        point.y < localBounds.y ||
        point.y > localBounds.y + localBounds.height
      ) {
        throw new Error(`${field}.payload.${name} must remain in localBounds`)
      }
    }
  } else if (kind === 'loupe') {
    const loupe = payload as unknown as LoupeLayerPayload
    if (
      Math.abs(localBounds.width - loupe.lens.size) > GEOMETRY_EPSILON ||
      Math.abs(localBounds.height - loupe.lens.size) > GEOMETRY_EPSILON
    ) {
      throw new Error(`${field}.localBounds must match its destination lens`)
    }
  }
}

function parseDrawingPayload(
  kind: LayerKind,
  value: unknown,
  field: string,
): JsonObject {
  switch (kind) {
    case 'arrow':
      return parseArrowPayload(value, field)
    case 'shape':
      return parseShapePayload(value, field)
    case 'pencil':
      return parseSampledPayload(value, field, false)
    case 'marker':
      return parseSampledPayload(value, field, true)
    case 'censor':
      return parseCensorPayload(value, field)
    case 'spotlight':
      return parseSpotlightPayload(value, field)
    case 'ruler':
      return parseRulerPayload(value, field)
    case 'loupe':
      return parseLoupePayload(value, field)
    default:
      return freezeJsonObject(value, field)
  }
}

function parseLayerPayload(
  kind: LayerKind,
  value: unknown,
  field: string,
): JsonObject {
  switch (kind) {
    case 'image':
      return parseImagePayload(value, field)
    case 'text':
      return parseTextPayload(value, field)
    case 'numberedMarker':
      return parseNumberedMarkerPayload(value, field)
    case 'callout':
      return parseCalloutPayload(value, field)
    case 'emoji':
      return parseEmojiPayload(value, field)
    default:
      return parseDrawingPayload(kind, value, field)
  }
}

function parseLayer(value: unknown, index: number): LayerNode {
  const field = `layers[${index}]`
  const input = readJsonObject(value, field)
  if (!isLayerKind(input.kind)) throw new Error(`${field}.kind is invalid`)
  const precisionLayer =
    input.kind === 'censor' ||
    input.kind === 'spotlight' ||
    input.kind === 'ruler' ||
    input.kind === 'loupe'
  if (precisionLayer) {
    assertOnlyFields(
      input,
      [
        'id',
        'kind',
        'transform',
        'localBounds',
        'opacity',
        'visible',
        'locked',
        'blendMode',
        'shadows',
        'payload',
      ],
      field,
    )
    const transform = readJsonObject(input.transform, `${field}.transform`)
    assertOnlyFields(
      transform,
      ['translateX', 'translateY', 'rotation', 'scaleX', 'scaleY'],
      `${field}.transform`,
    )
  }
  const textBearing =
    input.kind === 'text' ||
    input.kind === 'numberedMarker' ||
    input.kind === 'callout'
  if (
    textBearing &&
    (Object.hasOwn(input, 'opacity') ||
      Object.hasOwn(input, 'blendMode') ||
      Object.hasOwn(input, 'shadows'))
  ) {
    throw new Error(`${field} text-bearing common effects are removed in v7`)
  }
  const extras = collectExtras(input, [
    'id',
    'kind',
    'transform',
    'localBounds',
    'opacity',
    'visible',
    'locked',
    'blendMode',
    'shadows',
    'payload',
  ])
  const payload = parseLayerPayload(
    input.kind,
    input.payload,
    `${field}.payload`,
  )
  const localBounds = precisionLayer
    ? parseStrictRect(input.localBounds, `${field}.localBounds`)
    : parseRect(input.localBounds, `${field}.localBounds`)
  assertPrecisionPayloadBounds(input.kind, payload, localBounds, field)
  const common = {
    id: readStableId(input.id, `${field}.id`),
    kind: input.kind,
    transform: parseTransform(input.transform, `${field}.transform`),
    localBounds,
    visible: readBoolean(input.visible, `${field}.visible`),
    locked: readBoolean(input.locked, `${field}.locked`),
    payload,
    ...(extras === undefined ? {} : { extras }),
  }
  if (textBearing) return Object.freeze(common) as LayerNode

  const opacity = readFiniteNumber(input.opacity, `${field}.opacity`)
  if (opacity < 0 || opacity > 1) {
    throw new Error(`${field}.opacity must be between 0 and 1`)
  }
  const blendMode = input.blendMode
  if (!isBlendMode(blendMode)) throw new Error(`${field}.blendMode is invalid`)
  if (!Array.isArray(input.shadows) || input.shadows.length > 4) {
    throw new Error(`${field}.shadows is invalid`)
  }
  const shadows = input.shadows.map((shadow, shadowIndex) => {
    const parsed = readJsonObject(shadow, `${field}.shadows[${shadowIndex}]`)
    assertOnlyFields(
      parsed,
      ['color', 'offsetX', 'offsetY', 'blur'],
      `${field}.shadows[${shadowIndex}]`,
    )
    const blur = readFiniteNumber(
      parsed.blur,
      `${field}.shadows[${shadowIndex}].blur`,
    )
    if (blur < 0)
      throw new Error(`${field}.shadows[${shadowIndex}].blur is invalid`)
    return Object.freeze({
      color: parseSrgbColor(
        parsed.color,
        `${field}.shadows[${shadowIndex}].color`,
      ),
      offsetX: readFiniteNumber(
        parsed.offsetX,
        `${field}.shadows[${shadowIndex}].offsetX`,
      ),
      offsetY: readFiniteNumber(
        parsed.offsetY,
        `${field}.shadows[${shadowIndex}].offsetY`,
      ),
      blur,
    })
  })
  return Object.freeze({
    ...common,
    opacity,
    blendMode,
    shadows: Object.freeze(shadows),
  }) as LayerNode
}

function documentToJson(document: EditorDocument): JsonObject {
  const layers: readonly JsonObject[] = document.layers.map((layer) => {
    const common: JsonObject = {
      ...(layer.extras ?? {}),
      id: layer.id,
      kind: layer.kind,
      transform: {
        translateX: layer.transform.translateX,
        translateY: layer.transform.translateY,
        rotation: layer.transform.rotation,
        scaleX: layer.transform.scaleX,
        scaleY: layer.transform.scaleY,
      },
      localBounds: rectToJson(layer.localBounds),
      visible: layer.visible,
      locked: layer.locked,
      payload: layer.payload,
    }
    if (
      layer.kind === 'text' ||
      layer.kind === 'numberedMarker' ||
      layer.kind === 'callout'
    ) {
      return common
    }
    return {
      ...common,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      shadows: layer.shadows,
    }
  })
  return {
    ...(document.extras ?? {}),
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: document.id,
    source: sourceToJson(document.source),
    canvas: { width: document.canvas.width, height: document.canvas.height },
    crop: document.crop === null ? null : rectToJson(document.crop),
    layers,
    presentation: {
      beautify: { enabled: document.presentation.beautify.enabled },
      watermark: { enabled: document.presentation.watermark.enabled },
    },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

export function parseEditorDocument(input: unknown): ParsedEditorDocument {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
  const object = readJsonObject(raw, 'document')
  const schemaVersion = readFiniteNumber(object.schemaVersion, 'schemaVersion')
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error('schemaVersion must be a non-negative integer')
  }
  if (schemaVersion > EDITOR_DOCUMENT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'readOnly',
      schemaVersion,
      raw: freezeJsonObject(object, 'document'),
      reason: 'newerSchema',
    })
  }
  if (schemaVersion < EDITOR_DOCUMENT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'unsupported',
      schemaVersion,
      raw: freezeJsonObject(object, 'document'),
      reason: 'olderSchema',
    })
  }

  const canvas = readJsonObject(object.canvas, 'canvas')
  const canvasSize = Object.freeze({
    width: readPositiveNumber(canvas.width, 'canvas.width'),
    height: readPositiveNumber(canvas.height, 'canvas.height'),
  })
  if (!Array.isArray(object.layers)) throw new Error('layers must be an array')
  const source = parseSource(object.source)
  const layers = object.layers.map((layer, index) => parseLayer(layer, index))
  const ids = new Set<string>()
  let baseCount = 0
  for (const layer of layers) {
    if (ids.has(layer.id)) throw new Error(`duplicate layer id: ${layer.id}`)
    ids.add(layer.id)
    if (layer.kind === 'image' && layer.payload.role === 'base') {
      baseCount += 1
      if (layer.payload.blobHash !== source.blobHash) {
        throw new Error('base layer must reference source.blobHash')
      }
    }
    if (layer.kind === 'loupe') {
      assertValidLoupeSourceRegion(layer.payload.sourceRegion, canvasSize)
    }
    if (
      layer.kind === 'ruler' &&
      !rulerVisualBoundsAreConservative(layer, canvasSize)
    ) {
      throw new Error(
        `layer ${layer.id} must use conservative localBounds containing its ruler line, ticks and badge`,
      )
    }
  }
  if (baseCount > 1)
    throw new Error('document must not contain more than one base layer')
  const crop =
    object.crop === null || object.crop === undefined
      ? null
      : parseRect(object.crop, 'crop')
  if (
    crop !== null &&
    (crop.x < 0 ||
      crop.y < 0 ||
      crop.x + crop.width > canvasSize.width ||
      crop.y + crop.height > canvasSize.height)
  ) {
    throw new Error('crop must remain inside canvas')
  }
  const extras = collectExtras(object, [
    'schemaVersion',
    'id',
    'source',
    'canvas',
    'crop',
    'layers',
    'presentation',
    'createdAt',
    'updatedAt',
  ])
  const document: EditorDocument = {
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: readStableId(object.id, 'id'),
    source,
    canvas: canvasSize,
    crop,
    layers: Object.freeze(layers),
    presentation: parsePresentation(object.presentation),
    createdAt: readNonEmptyString(object.createdAt, 'createdAt'),
    updatedAt: readNonEmptyString(object.updatedAt, 'updatedAt'),
    ...(extras === undefined ? {} : { extras }),
  }
  return Object.freeze({ kind: 'editable', document: Object.freeze(document) })
}

export function normalizeEditorDocument(
  document: EditorDocument,
): EditorDocument {
  const parsed = parseEditorDocument(documentToJson(document))
  if (parsed.kind !== 'editable') {
    throw new Error('current schema unexpectedly read-only')
  }
  return parsed.document
}

export function serializeEditorDocument(document: EditorDocument): string {
  return JSON.stringify(documentToJson(normalizeEditorDocument(document)))
}
