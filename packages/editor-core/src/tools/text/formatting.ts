import type { RichTextSpan } from '../../document/types'
import {
  type RichTextEditingState,
  type RichTextParagraphStyle,
  type RichTextSpanStyle,
  freezeColor,
  freezeParagraph,
  freezeSpan,
  mergeSpans,
  normalizeRichTextContent,
  normalizeRichTextSelection,
  paragraphAt,
  paragraphStyle,
  richTextSelectionRange,
  spanStyle,
} from './model'

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
