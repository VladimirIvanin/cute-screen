import type {
  RichTextContent,
  RichTextParagraph,
  RichTextSpan,
  SrgbColor,
} from '../../document/types'

export type RichTextSelection = Readonly<{
  readonly anchor: number
  readonly focus: number
}>

export type RichTextRange = Readonly<{
  readonly start: number
  readonly end: number
}>

export type RichTextSpanStyle = Readonly<Omit<RichTextSpan, 'start' | 'end'>>

export type RichTextParagraphStyle = Readonly<
  Omit<RichTextParagraph, 'start' | 'end'>
>

export type RichTextEditingState = Readonly<{
  readonly content: RichTextContent
  readonly selection: RichTextSelection
  readonly typingStyle: RichTextSpanStyle
  readonly paragraphStyle: RichTextParagraphStyle
}>

const DEFAULT_COLOR: SrgbColor = Object.freeze({
  red: 0,
  green: 0,
  blue: 0,
  alpha: 1,
})

export const DEFAULT_RICH_TEXT_SPAN_STYLE: RichTextSpanStyle = Object.freeze({
  fontFamily: 'Roboto',
  fontSize: 24,
  color: DEFAULT_COLOR,
  weight: 400,
  italic: false,
  strikethrough: false,
})

export const DEFAULT_RICH_TEXT_PARAGRAPH_STYLE: RichTextParagraphStyle =
  Object.freeze({ alignment: 'start', listKind: 'none' })

export function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff
}

export function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff
}

export function isUtf16Boundary(text: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    return false
  }
  if (offset === 0 || offset === text.length) return true
  return !(
    isHighSurrogate(text.charCodeAt(offset - 1)) &&
    isLowSurrogate(text.charCodeAt(offset))
  )
}

export function normalizeOffset(
  text: string,
  offset: number,
  bias: 'backward' | 'forward',
): number {
  if (!Number.isInteger(offset)) {
    throw new RangeError('rich-text offsets must be integers')
  }
  const clamped = Math.max(0, Math.min(text.length, offset))
  if (isUtf16Boundary(text, clamped)) return clamped
  return bias === 'backward' ? clamped - 1 : clamped + 1
}

export function normalizeRichTextSelection(
  text: string,
  selection: RichTextSelection,
): RichTextSelection {
  if (selection.anchor === selection.focus) {
    const caret = normalizeOffset(text, selection.anchor, 'backward')
    return Object.freeze({ anchor: caret, focus: caret })
  }
  if (selection.anchor < selection.focus) {
    return Object.freeze({
      anchor: normalizeOffset(text, selection.anchor, 'backward'),
      focus: normalizeOffset(text, selection.focus, 'forward'),
    })
  }
  return Object.freeze({
    anchor: normalizeOffset(text, selection.anchor, 'forward'),
    focus: normalizeOffset(text, selection.focus, 'backward'),
  })
}

export function richTextSelectionRange(
  selection: RichTextSelection,
): RichTextRange {
  return Object.freeze({
    start: Math.min(selection.anchor, selection.focus),
    end: Math.max(selection.anchor, selection.focus),
  })
}

export function freezeColor(color: SrgbColor): SrgbColor {
  return Object.freeze({
    red: color.red,
    green: color.green,
    blue: color.blue,
    alpha: color.alpha,
  })
}

export function spanStyle(span: RichTextSpan): RichTextSpanStyle {
  return Object.freeze({
    fontFamily: span.fontFamily,
    fontSize: span.fontSize,
    color: freezeColor(span.color),
    weight: span.weight,
    italic: span.italic,
    strikethrough: span.strikethrough,
  })
}

export function paragraphStyle(
  paragraph: RichTextParagraph,
): RichTextParagraphStyle {
  return Object.freeze({
    alignment: paragraph.alignment,
    listKind: paragraph.listKind,
  })
}

export function freezeSpan(
  start: number,
  end: number,
  style: RichTextSpanStyle,
): RichTextSpan {
  return Object.freeze({
    start,
    end,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    color: freezeColor(style.color),
    weight: style.weight,
    italic: style.italic,
    strikethrough: style.strikethrough,
  })
}

export function freezeParagraph(
  start: number,
  end: number,
  style: RichTextParagraphStyle,
): RichTextParagraph {
  return Object.freeze({
    start,
    end,
    alignment: style.alignment,
    listKind: style.listKind,
  })
}

function equalColor(left: SrgbColor, right: SrgbColor): boolean {
  return (
    left.red === right.red &&
    left.green === right.green &&
    left.blue === right.blue &&
    left.alpha === right.alpha
  )
}

function equalSpanStyle(
  left: RichTextSpanStyle,
  right: RichTextSpanStyle,
): boolean {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    equalColor(left.color, right.color) &&
    left.weight === right.weight &&
    left.italic === right.italic &&
    left.strikethrough === right.strikethrough
  )
}

export function mergeSpans(
  spans: readonly RichTextSpan[],
): readonly RichTextSpan[] {
  const result: RichTextSpan[] = []
  for (const span of spans) {
    if (span.end <= span.start) continue
    const previous = result.at(-1)
    if (
      previous &&
      previous.end === span.start &&
      equalSpanStyle(spanStyle(previous), spanStyle(span))
    ) {
      result[result.length - 1] = freezeSpan(
        previous.start,
        span.end,
        spanStyle(previous),
      )
    } else {
      result.push(freezeSpan(span.start, span.end, spanStyle(span)))
    }
  }
  return Object.freeze(result)
}

function assertSpanCoverage(
  text: string,
  spans: readonly RichTextSpan[],
): void {
  if (text.length === 0) {
    if (spans.length !== 0) {
      throw new RangeError('empty rich text cannot contain persisted spans')
    }
    return
  }
  let end = 0
  for (const span of spans) {
    if (
      span.start !== end ||
      span.end <= span.start ||
      !isUtf16Boundary(text, span.start) ||
      !isUtf16Boundary(text, span.end)
    ) {
      throw new RangeError('rich-text spans must cover complete code points')
    }
    end = span.end
  }
  if (end !== text.length) {
    throw new RangeError('rich-text spans must cover text exactly')
  }
}

function assertParagraphCoverage(
  text: string,
  paragraphs: readonly RichTextParagraph[],
): void {
  if (text.length === 0) {
    if (paragraphs.length !== 0) {
      throw new RangeError('empty rich text cannot contain paragraphs')
    }
    return
  }
  let end = 0
  for (const [index, paragraph] of paragraphs.entries()) {
    const terminalEmpty =
      index === paragraphs.length - 1 &&
      paragraph.start === text.length &&
      paragraph.end === text.length &&
      text.endsWith('\n')
    if (
      paragraph.start !== end ||
      (paragraph.end <= paragraph.start && !terminalEmpty) ||
      !isUtf16Boundary(text, paragraph.start) ||
      !isUtf16Boundary(text, paragraph.end)
    ) {
      throw new RangeError(
        'rich-text paragraphs must cover complete code points',
      )
    }
    end = paragraph.end
  }
  if (end !== text.length) {
    throw new RangeError('rich-text paragraphs must cover text exactly')
  }
}

export function logicalParagraphRanges(text: string): readonly RichTextRange[] {
  if (text.length === 0) return Object.freeze([])
  const result: RichTextRange[] = []
  let start = 0
  for (let offset = 0; offset < text.length; offset += 1) {
    if (text.charCodeAt(offset) !== 0x0a) continue
    result.push(Object.freeze({ start, end: offset + 1 }))
    start = offset + 1
  }
  if (start < text.length) {
    result.push(Object.freeze({ start, end: text.length }))
  } else if (text.endsWith('\n')) {
    result.push(Object.freeze({ start, end: start }))
  }
  return Object.freeze(result)
}

export function paragraphAt(
  paragraphs: readonly RichTextParagraph[],
  textLength: number,
  offset: number,
): RichTextParagraph | undefined {
  const terminal = paragraphs.find(
    (paragraph) =>
      paragraph.start === offset &&
      paragraph.end === offset &&
      offset === textLength,
  )
  if (terminal) return terminal
  return (
    paragraphs.find(
      (paragraph) =>
        offset >= paragraph.start &&
        (offset < paragraph.end ||
          (offset === textLength && paragraph.end === textLength)),
    ) ?? paragraphs.at(-1)
  )
}

function normalizedParagraphs(
  text: string,
  paragraphs: readonly RichTextParagraph[],
): readonly RichTextParagraph[] {
  assertParagraphCoverage(text, paragraphs)
  if (text.length === 0) return Object.freeze([])
  return Object.freeze(
    logicalParagraphRanges(text).map((range) => {
      const source = paragraphAt(paragraphs, text.length, range.start)
      return freezeParagraph(
        range.start,
        range.end,
        source ? paragraphStyle(source) : DEFAULT_RICH_TEXT_PARAGRAPH_STYLE,
      )
    }),
  )
}

export function normalizeRichTextContent(
  content: RichTextContent,
): RichTextContent {
  assertSpanCoverage(content.text, content.spans)
  const spans = mergeSpans(content.spans)
  const paragraphs = normalizedParagraphs(content.text, content.paragraphs)
  return Object.freeze({
    text: content.text,
    wrap: content.wrap,
    ...(content.fixedWidth === undefined
      ? {}
      : { fixedWidth: content.fixedWidth }),
    spans,
    paragraphs,
  })
}

export function richTextSpanStyleAt(
  content: RichTextContent,
  offset: number,
): RichTextSpanStyle {
  const normalized = normalizeRichTextContent(content)
  const safe = normalizeOffset(normalized.text, offset, 'backward')
  const source =
    normalized.spans.find((span) => safe >= span.start && safe < span.end) ??
    normalized.spans.at(-1)
  return source ? spanStyle(source) : DEFAULT_RICH_TEXT_SPAN_STYLE
}

export function richTextParagraphStyleAt(
  content: RichTextContent,
  offset: number,
): RichTextParagraphStyle {
  const normalized = normalizeRichTextContent(content)
  const safe = normalizeOffset(normalized.text, offset, 'backward')
  const source = paragraphAt(
    normalized.paragraphs,
    normalized.text.length,
    safe,
  )
  return source ? paragraphStyle(source) : DEFAULT_RICH_TEXT_PARAGRAPH_STYLE
}

export function createRichTextEditingState(
  content: RichTextContent,
  selection: RichTextSelection = {
    anchor: content.text.length,
    focus: content.text.length,
  },
  defaults: Readonly<{
    readonly typingStyle?: RichTextSpanStyle
    readonly paragraphStyle?: RichTextParagraphStyle
  }> = {},
): RichTextEditingState {
  const normalized = normalizeRichTextContent(content)
  const safeSelection = normalizeRichTextSelection(normalized.text, selection)
  const range = richTextSelectionRange(safeSelection)
  return Object.freeze({
    content: normalized,
    selection: safeSelection,
    typingStyle:
      normalized.text.length === 0 && defaults.typingStyle
        ? Object.freeze({
            ...defaults.typingStyle,
            color: freezeColor(defaults.typingStyle.color),
          })
        : richTextSpanStyleAt(normalized, range.start),
    paragraphStyle:
      normalized.text.length === 0 && defaults.paragraphStyle
        ? Object.freeze({ ...defaults.paragraphStyle })
        : richTextParagraphStyleAt(normalized, range.start),
  })
}

export function setRichTextSelection(
  state: RichTextEditingState,
  selection: RichTextSelection,
): RichTextEditingState {
  const safeSelection = normalizeRichTextSelection(
    state.content.text,
    selection,
  )
  const range = richTextSelectionRange(safeSelection)
  return Object.freeze({
    content: state.content,
    selection: safeSelection,
    typingStyle: richTextSpanStyleAt(state.content, range.start),
    paragraphStyle: richTextParagraphStyleAt(state.content, range.start),
  })
}
