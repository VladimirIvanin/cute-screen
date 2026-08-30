import type { RichTextParagraph } from '../../document/types'
import { applyRichTextParagraphStyle } from './formatting'
import {
  type RichTextEditingState,
  isHighSurrogate,
  isLowSurrogate,
  normalizeRichTextSelection,
  paragraphAt,
  richTextSelectionRange,
} from './model'
import { replaceRichTextSelection } from './replacement'

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
