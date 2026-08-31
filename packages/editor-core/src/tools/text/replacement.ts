import type {
  RichTextContent,
  RichTextParagraph,
  RichTextSpan,
} from '../../document/types'
import {
  type RichTextEditingState,
  type RichTextParagraphStyle,
  type RichTextRange,
  type RichTextSelection,
  freezeParagraph,
  freezeSpan,
  logicalParagraphRanges,
  mergeSpans,
  normalizeOffset,
  normalizeRichTextContent,
  normalizeRichTextSelection,
  richTextParagraphStyleAt,
  richTextSelectionRange,
  spanStyle,
} from './model'

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
