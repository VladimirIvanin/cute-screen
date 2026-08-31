import { readJsonObject } from '../json'
import {
  type RichTextContent,
  type RichTextParagraph,
  type RichTextSpan,
  type SrgbColor,
  type TextLayerPayload,
} from '../types'
import { parseSrgbColor } from './paint'
import {
  assertOnlyFields,
  parseBoundedNonNegative,
  readBoolean,
  readFiniteNumber,
  readNonEmptyString,
  readPositiveNumber,
} from './primitives'

const MAX_TEXT_UTF16_LENGTH = 100_000
const MAX_RICH_TEXT_RANGES = 2_048
const MAX_TEXT_FONT_SIZE = 512
const MAX_TEXT_PADDING = 256
const MAX_IMAGE_RADIUS = 16_384

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

function parseRichTextSpan(
  value: unknown,
  index: number,
  field: string,
  text: string,
  expectedStart: number,
): RichTextSpan {
  const itemField = `${field}.spans[${index}]`
  const range = parseTextRange(value, itemField, text)
  const item = readJsonObject(value, itemField)
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
    itemField,
  )
  if (range.start !== expectedStart || range.end <= range.start) {
    throw new Error(`${field}.spans must be contiguous non-empty ranges`)
  }
  const fontSize = readPositiveNumber(item.fontSize, `${itemField}.fontSize`)
  if (fontSize > MAX_TEXT_FONT_SIZE) {
    throw new Error(`${itemField}.fontSize is outside supported bounds`)
  }
  const weight = readFiniteNumber(item.weight, `${itemField}.weight`)
  if (
    !Number.isInteger(weight) ||
    weight < 100 ||
    weight > 900 ||
    weight % 100 !== 0
  ) {
    throw new Error(`${itemField}.weight is invalid`)
  }
  return Object.freeze({
    ...range,
    fontFamily: readNonEmptyString(item.fontFamily, `${itemField}.fontFamily`),
    fontSize,
    color: parseSrgbColor(
      item.color,
      `${itemField}.color`,
    ) as unknown as SrgbColor,
    weight: weight as RichTextSpan['weight'],
    italic: readBoolean(item.italic, `${itemField}.italic`),
    strikethrough: readBoolean(
      item.strikethrough,
      `${itemField}.strikethrough`,
    ),
  })
}

function parseRichTextSpans(
  values: readonly unknown[],
  field: string,
  text: string,
): readonly RichTextSpan[] {
  let previousEnd = 0
  const spans = values.map((value, index) => {
    const span = parseRichTextSpan(value, index, field, text, previousEnd)
    previousEnd = span.end
    return span
  })
  if (
    (text.length === 0 && spans.length !== 0) ||
    (text.length > 0 && (spans.length === 0 || previousEnd !== text.length))
  ) {
    throw new Error(`${field}.spans must cover text exactly`)
  }
  return canonicalizeRichTextSpans(spans)
}

function parseRichTextParagraph(
  value: unknown,
  index: number,
  count: number,
  field: string,
  text: string,
  expectedStart: number,
): RichTextParagraph {
  const itemField = `${field}.paragraphs[${index}]`
  const range = parseTextRange(value, itemField, text)
  const item = readJsonObject(value, itemField)
  assertOnlyFields(item, ['start', 'end', 'alignment', 'listKind'], itemField)
  const terminalEmpty =
    index === count - 1 &&
    range.start === text.length &&
    range.end === text.length &&
    text.endsWith('\n')
  if (
    range.start !== expectedStart ||
    (range.end <= range.start && !terminalEmpty)
  ) {
    throw new Error(`${field}.paragraphs must be contiguous non-empty ranges`)
  }
  if (!['start', 'center', 'end'].includes(String(item.alignment))) {
    throw new Error(`${itemField}.alignment is invalid`)
  }
  if (item.listKind !== 'none' && item.listKind !== 'bullet') {
    throw new Error(`${itemField}.listKind is invalid`)
  }
  return Object.freeze({
    ...range,
    alignment: item.alignment as RichTextParagraph['alignment'],
    listKind: item.listKind,
  }) as RichTextParagraph
}

function parseRichTextParagraphs(
  values: readonly unknown[],
  field: string,
  text: string,
): readonly RichTextParagraph[] {
  let previousEnd = 0
  const paragraphs = values.map((value, index) => {
    const paragraph = parseRichTextParagraph(
      value,
      index,
      values.length,
      field,
      text,
      previousEnd,
    )
    previousEnd = paragraph.end
    return paragraph
  })
  if (
    (text.length === 0 && paragraphs.length !== 0) ||
    (text.length > 0 &&
      (paragraphs.length === 0 || previousEnd !== text.length))
  ) {
    throw new Error(`${field}.paragraphs must cover text exactly`)
  }
  return Object.freeze(paragraphs)
}

export function parseRichTextContent(
  value: unknown,
  field: string,
): RichTextContent {
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
  return Object.freeze({
    text,
    wrap: input.wrap,
    ...(fixedWidth === undefined ? {} : { fixedWidth }),
    spans: parseRichTextSpans(input.spans, field, text),
    paragraphs: parseRichTextParagraphs(input.paragraphs, field, text),
  })
}

export function parseTextBackground(
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

export function parseTextPayload(
  value: unknown,
  field: string,
): TextLayerPayload {
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
