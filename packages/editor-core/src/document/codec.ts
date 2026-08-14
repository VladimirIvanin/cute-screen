import { collectExtras, freezeJsonObject, readJsonObject } from './json'
import {
  DEFAULT_PRESENTATION_SETTINGS,
  ARROW_CAPS,
  BLEND_MODES,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  LAYER_KINDS,
  type ColorMetadata,
  type BlendMode,
  type ArrowLayerPayload,
  type CalloutPayload,
  type EmojiPayload,
  type ShapeLayerPayload,
  type PencilLayerPayload,
  type MarkerLayerPayload,
  type NumberedMarkerPayload,
  type RichTextContent,
  type RichTextParagraph,
  type RichTextSpan,
  type SrgbColor,
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

function parseCalloutPayload(value: unknown, field: string): CalloutPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['content', 'bubble', 'tailAnchor'], field)
  return Object.freeze({
    content: parseRichTextContent(input.content, `${field}.content`),
    bubble: parseTextBackground(input.bubble, `${field}.bubble`),
    tailAnchor: parsePointPayload(
      input.tailAnchor,
      `${field}.tailAnchor`,
    ) as CalloutPayload['tailAnchor'],
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
  const common = {
    id: readStableId(input.id, `${field}.id`),
    kind: input.kind,
    transform: parseTransform(input.transform, `${field}.transform`),
    localBounds: parseRect(input.localBounds, `${field}.localBounds`),
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
