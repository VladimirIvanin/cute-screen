import type {
  RichTextContent,
  RichTextParagraph,
  RichTextSpan,
  SrgbColor,
} from './document/types'

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

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff
}

function isLowSurrogate(value: number): boolean {
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

function normalizeOffset(
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

function freezeColor(color: SrgbColor): SrgbColor {
  return Object.freeze({
    red: color.red,
    green: color.green,
    blue: color.blue,
    alpha: color.alpha,
  })
}

function spanStyle(span: RichTextSpan): RichTextSpanStyle {
  return Object.freeze({
    fontFamily: span.fontFamily,
    fontSize: span.fontSize,
    color: freezeColor(span.color),
    weight: span.weight,
    italic: span.italic,
    strikethrough: span.strikethrough,
  })
}

function paragraphStyle(paragraph: RichTextParagraph): RichTextParagraphStyle {
  return Object.freeze({
    alignment: paragraph.alignment,
    listKind: paragraph.listKind,
  })
}

function freezeSpan(
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

function freezeParagraph(
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

function mergeSpans(spans: readonly RichTextSpan[]): readonly RichTextSpan[] {
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

function logicalParagraphRanges(text: string): readonly RichTextRange[] {
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

function paragraphAt(
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

function patchedSpanStyle(
  style: RichTextSpanStyle,
  patch: Partial<RichTextSpanStyle>,
): RichTextSpanStyle {
  return Object.freeze({
    ...style,
    ...patch,
    color: freezeColor(patch.color ?? style.color),
  })
}

export function applyRichTextSpanStyle(
  state: RichTextEditingState,
  patch: Partial<RichTextSpanStyle>,
): RichTextEditingState {
  const selection = normalizeRichTextSelection(
    state.content.text,
    state.selection,
  )
  const range = richTextSelectionRange(selection)
  const typingStyle = patchedSpanStyle(state.typingStyle, patch)
  if (range.start === range.end) {
    return Object.freeze({ ...state, selection, typingStyle })
  }

  const spans: RichTextSpan[] = []
  for (const span of state.content.spans) {
    if (span.end <= range.start || span.start >= range.end) {
      spans.push(span)
      continue
    }
    if (span.start < range.start) {
      spans.push(freezeSpan(span.start, range.start, spanStyle(span)))
    }
    spans.push(
      freezeSpan(
        Math.max(span.start, range.start),
        Math.min(span.end, range.end),
        patchedSpanStyle(spanStyle(span), patch),
      ),
    )
    if (span.end > range.end) {
      spans.push(freezeSpan(range.end, span.end, spanStyle(span)))
    }
  }
  return Object.freeze({
    ...state,
    selection,
    typingStyle,
    content: Object.freeze({
      ...state.content,
      spans: mergeSpans(spans),
    }),
  })
}

export function applyRichTextParagraphStyle(
  state: RichTextEditingState,
  patch: Partial<RichTextParagraphStyle>,
): RichTextEditingState {
  const content = normalizeRichTextContent(state.content)
  const selection = normalizeRichTextSelection(content.text, state.selection)
  const range = richTextSelectionRange(selection)
  const currentIndex = content.paragraphs.findIndex(
    (paragraph) =>
      paragraph ===
      paragraphAt(content.paragraphs, content.text.length, range.start),
  )
  const paragraphs = content.paragraphs.map((paragraph, index) => {
    const touched =
      range.start === range.end
        ? index === currentIndex
        : paragraph.start < range.end && paragraph.end > range.start
    return touched
      ? freezeParagraph(paragraph.start, paragraph.end, {
          ...paragraphStyle(paragraph),
          ...patch,
        })
      : paragraph
  })
  return Object.freeze({
    ...state,
    selection,
    paragraphStyle: Object.freeze({ ...state.paragraphStyle, ...patch }),
    content: Object.freeze({
      ...content,
      paragraphs: Object.freeze(paragraphs),
    }),
  })
}

function paragraphsAfterReplacement(
  previous: RichTextContent,
  nextText: string,
  range: RichTextRange,
  insertedText: string,
  insertionStyle: RichTextParagraphStyle,
): readonly RichTextParagraph[] {
  if (nextText.length === 0) return Object.freeze([])
  const delta = insertedText.length - (range.end - range.start)
  const insertedEnd = range.start + insertedText.length
  return Object.freeze(
    logicalParagraphRanges(nextText).map((paragraph) => {
      let style: RichTextParagraphStyle
      if (paragraph.start === 0) {
        style =
          range.start === 0
            ? insertionStyle
            : richTextParagraphStyleAt(previous, 0)
      } else {
        const separator = paragraph.start - 1
        if (separator >= range.start && separator < insertedEnd) {
          style = insertionStyle
        } else {
          const oldOffset =
            paragraph.start <= range.start
              ? paragraph.start
              : paragraph.start - delta
          style = richTextParagraphStyleAt(previous, oldOffset)
        }
      }
      return freezeParagraph(paragraph.start, paragraph.end, style)
    }),
  )
}

export function replaceRichTextSelection(
  state: RichTextEditingState,
  insertedText: string,
): RichTextEditingState {
  const content = normalizeRichTextContent(state.content)
  const selection = normalizeRichTextSelection(content.text, state.selection)
  const range = richTextSelectionRange(selection)
  const text =
    content.text.slice(0, range.start) +
    insertedText +
    content.text.slice(range.end)
  const delta = insertedText.length - (range.end - range.start)
  const spans: RichTextSpan[] = []

  for (const span of content.spans) {
    if (span.start < range.start) {
      const end = Math.min(span.end, range.start)
      if (end > span.start) {
        spans.push(freezeSpan(span.start, end, spanStyle(span)))
      }
    }
  }
  if (insertedText.length > 0) {
    spans.push(
      freezeSpan(
        range.start,
        range.start + insertedText.length,
        state.typingStyle,
      ),
    )
  }
  for (const span of content.spans) {
    if (span.end <= range.end) continue
    const sourceStart = Math.max(span.start, range.end)
    spans.push(
      freezeSpan(sourceStart + delta, span.end + delta, spanStyle(span)),
    )
  }

  const caret = normalizeOffset(
    text,
    range.start + insertedText.length,
    'backward',
  )
  return Object.freeze({
    content: Object.freeze({
      text,
      wrap: content.wrap,
      ...(content.fixedWidth === undefined
        ? {}
        : { fixedWidth: content.fixedWidth }),
      spans: text.length === 0 ? Object.freeze([]) : mergeSpans(spans),
      paragraphs: paragraphsAfterReplacement(
        content,
        text,
        range,
        insertedText,
        state.paragraphStyle,
      ),
    }),
    selection: Object.freeze({ anchor: caret, focus: caret }),
    typingStyle: state.typingStyle,
    paragraphStyle: state.paragraphStyle,
  })
}

function codePointOffsets(text: string): readonly number[] {
  const offsets = [0]
  let offset = 0
  for (const codePoint of text) {
    offset += codePoint.length
    offsets.push(offset)
  }
  return offsets
}

export function reconcileRichTextText(
  state: RichTextEditingState,
  nextText: string,
  nextSelection: RichTextSelection,
): RichTextEditingState {
  if (state.content.text === nextText) {
    return Object.freeze({
      ...state,
      selection: normalizeRichTextSelection(nextText, nextSelection),
    })
  }
  const oldPoints = Array.from(state.content.text)
  const nextPoints = Array.from(nextText)
  let prefix = 0
  while (
    prefix < oldPoints.length &&
    prefix < nextPoints.length &&
    oldPoints[prefix] === nextPoints[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < oldPoints.length - prefix &&
    suffix < nextPoints.length - prefix &&
    oldPoints[oldPoints.length - 1 - suffix] ===
      nextPoints[nextPoints.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const oldOffsets = codePointOffsets(state.content.text)
  const nextOffsets = codePointOffsets(nextText)
  const oldStart = oldOffsets[prefix]!
  const oldEnd = oldOffsets[oldPoints.length - suffix]!
  const nextStart = nextOffsets[prefix]!
  const nextEnd = nextOffsets[nextPoints.length - suffix]!
  const replacing = Object.freeze({
    ...state,
    selection: Object.freeze({ anchor: oldStart, focus: oldEnd }),
  })
  const replaced = replaceRichTextSelection(
    replacing,
    nextText.slice(nextStart, nextEnd),
  )
  return Object.freeze({
    ...replaced,
    selection: normalizeRichTextSelection(nextText, nextSelection),
  })
}

function currentParagraph(
  state: RichTextEditingState,
): RichTextParagraph | undefined {
  const range = richTextSelectionRange(state.selection)
  return paragraphAt(
    state.content.paragraphs,
    state.content.text.length,
    range.start,
  )
}

function paragraphIsEmpty(text: string, paragraph: RichTextParagraph): boolean {
  const contentEnd =
    paragraph.end > paragraph.start && text[paragraph.end - 1] === '\n'
      ? paragraph.end - 1
      : paragraph.end
  return paragraph.start === contentEnd
}

export function handleRichTextEnter(
  state: RichTextEditingState,
): RichTextEditingState {
  let current = state
  const initialRange = richTextSelectionRange(current.selection)
  if (initialRange.start !== initialRange.end) {
    current = replaceRichTextSelection(current, '')
  }
  const paragraph = currentParagraph(current)
  if (
    paragraph?.listKind === 'bullet' &&
    paragraphIsEmpty(current.content.text, paragraph)
  ) {
    return applyRichTextParagraphStyle(current, { listKind: 'none' })
  }
  return replaceRichTextSelection(current, '\n')
}

export function handleRichTextBackspace(
  state: RichTextEditingState,
): Readonly<{ handled: boolean; state: RichTextEditingState }> {
  const selection = normalizeRichTextSelection(
    state.content.text,
    state.selection,
  )
  const range = richTextSelectionRange(selection)
  const normalizedState = Object.freeze({ ...state, selection })
  if (range.start !== range.end) {
    return Object.freeze({
      handled: true,
      state: replaceRichTextSelection(normalizedState, ''),
    })
  }
  const paragraph = currentParagraph(normalizedState)
  if (paragraph?.listKind === 'bullet' && range.start === paragraph.start) {
    return Object.freeze({
      handled: true,
      state: applyRichTextParagraphStyle(normalizedState, {
        listKind: 'none',
      }),
    })
  }
  if (range.start === 0) {
    return Object.freeze({ handled: false, state: normalizedState })
  }
  let previous = range.start - 1
  if (
    previous > 0 &&
    isLowSurrogate(state.content.text.charCodeAt(previous)) &&
    isHighSurrogate(state.content.text.charCodeAt(previous - 1))
  ) {
    previous -= 1
  }
  return Object.freeze({
    handled: true,
    state: replaceRichTextSelection(
      Object.freeze({
        ...normalizedState,
        selection: Object.freeze({ anchor: previous, focus: range.start }),
      }),
      '',
    ),
  })
}
