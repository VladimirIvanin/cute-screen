import { describe, expect, it } from 'vitest'

import type {
  RichTextContent,
  RichTextParagraph,
  RichTextSpan,
} from './document/types'
import {
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  createRichTextEditingState,
  handleRichTextBackspace,
  handleRichTextEnter,
  normalizeRichTextContent,
  normalizeRichTextSelection,
  replaceRichTextSelection,
  setRichTextSelection,
} from './rich-text-editing'

const BLACK = Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 })

const BASE_STYLE = Object.freeze({
  fontFamily: 'Roboto',
  fontSize: 24,
  color: BLACK,
  weight: 400 as const,
  italic: false,
  strikethrough: false,
})

const BASE_PARAGRAPH = Object.freeze({
  alignment: 'start' as const,
  listKind: 'none' as const,
})

function content(
  text: string,
  input: {
    readonly spans?: readonly RichTextSpan[]
    readonly paragraphs?: readonly RichTextParagraph[]
  } = {},
): RichTextContent {
  return Object.freeze({
    text,
    wrap: 'autoSize' as const,
    spans:
      input.spans ??
      (text.length === 0
        ? []
        : [Object.freeze({ start: 0, end: text.length, ...BASE_STYLE })]),
    paragraphs:
      input.paragraphs ??
      (text.length === 0
        ? []
        : [Object.freeze({ start: 0, end: text.length, ...BASE_PARAGRAPH })]),
  })
}

describe('v7 rich-text editing operations', () => {
  it('normalizes forward, reverse and collapsed selections without splitting surrogate pairs', () => {
    const text = 'A😀B'

    expect(normalizeRichTextSelection(text, { anchor: 2, focus: 2 })).toEqual({
      anchor: 1,
      focus: 1,
    })
    expect(normalizeRichTextSelection(text, { anchor: 2, focus: 3 })).toEqual({
      anchor: 1,
      focus: 3,
    })
    expect(normalizeRichTextSelection(text, { anchor: 3, focus: 2 })).toEqual({
      anchor: 3,
      focus: 1,
    })
  })

  it('replaces and deletes complete code points when offsets land inside a surrogate pair', () => {
    const initial = createRichTextEditingState(content('A😀B'), {
      anchor: 2,
      focus: 3,
    })
    const replaced = replaceRichTextSelection(initial, 'x')

    expect(replaced.content.text).toBe('AxB')
    expect(replaced.selection).toEqual({ anchor: 2, focus: 2 })
    expect(replaced.content.spans).toEqual([
      { start: 0, end: 3, ...BASE_STYLE },
    ])

    const afterEmoji = setRichTextSelection(
      createRichTextEditingState(content('A😀B')),
      { anchor: 3, focus: 3 },
    )
    const deleted = handleRichTextBackspace(afterEmoji)
    expect(deleted.handled).toBe(true)
    expect(deleted.state.content.text).toBe('AB')
    expect(deleted.state.selection).toEqual({ anchor: 1, focus: 1 })
  })

  it('splits selected spans, applies formatting, and merges equal neighbours', () => {
    let state = createRichTextEditingState(content('A😀BC'), {
      anchor: 1,
      focus: 3,
    })
    state = applyRichTextSpanStyle(state, { italic: true })

    expect(state.content.spans).toEqual([
      { start: 0, end: 1, ...BASE_STYLE },
      { start: 1, end: 3, ...BASE_STYLE, italic: true },
      { start: 3, end: 5, ...BASE_STYLE },
    ])

    state = setRichTextSelection(state, { anchor: 3, focus: 5 })
    state = applyRichTextSpanStyle(state, { italic: true })
    expect(state.content.spans).toEqual([
      { start: 0, end: 1, ...BASE_STYLE },
      { start: 1, end: 5, ...BASE_STYLE, italic: true },
    ])
  })

  it('stores a collapsed-caret typing style and applies it only to later input', () => {
    let state = createRichTextEditingState(content('AB'), {
      anchor: 1,
      focus: 1,
    })
    const unchanged = state.content
    state = applyRichTextSpanStyle(state, {
      weight: 700,
      strikethrough: true,
    })

    expect(state.content).toBe(unchanged)
    expect(state.typingStyle).toMatchObject({
      weight: 700,
      strikethrough: true,
    })

    state = replaceRichTextSelection(state, 'x')
    expect(state.content.text).toBe('AxB')
    expect(state.content.spans).toEqual([
      { start: 0, end: 1, ...BASE_STYLE },
      {
        start: 1,
        end: 2,
        ...BASE_STYLE,
        weight: 700,
        strikethrough: true,
      },
      { start: 2, end: 3, ...BASE_STYLE },
    ])
  })

  it('keeps logical paragraph ranges valid through insert, replace and delete', () => {
    const bullet = Object.freeze({
      alignment: 'center' as const,
      listKind: 'bullet' as const,
    })
    let state = createRichTextEditingState(
      content('one\ntwo', {
        paragraphs: [{ start: 0, end: 7, ...bullet }],
      }),
      { anchor: 3, focus: 3 },
    )

    state = replaceRichTextSelection(state, '\n')
    expect(state.content.text).toBe('one\n\ntwo')
    expect(state.content.paragraphs).toEqual([
      { start: 0, end: 4, ...bullet },
      { start: 4, end: 5, ...bullet },
      { start: 5, end: 8, ...bullet },
    ])

    state = setRichTextSelection(state, { anchor: 2, focus: 6 })
    state = replaceRichTextSelection(state, '😀')
    expect(state.content.text).toBe('on😀wo')
    expect(state.content.spans.at(-1)?.end).toBe(state.content.text.length)
    expect(state.content.paragraphs).toEqual([{ start: 0, end: 6, ...bullet }])
    expect(
      state.content.spans.every((span) => span.start !== 3 && span.end !== 3),
    ).toBe(true)
  })

  it('stores bullets only as paragraph metadata and continues them on Enter', () => {
    const bulletContent = content('item', {
      paragraphs: [
        { start: 0, end: 4, alignment: 'start', listKind: 'bullet' },
      ],
    })
    let state = createRichTextEditingState(bulletContent, {
      anchor: 4,
      focus: 4,
    })

    state = handleRichTextEnter(state)
    expect(state.content.text).toBe('item\n')
    expect(state.content.text).not.toContain('•')
    expect(state.content.paragraphs).toEqual([
      { start: 0, end: 5, alignment: 'start', listKind: 'bullet' },
      { start: 5, end: 5, alignment: 'start', listKind: 'bullet' },
    ])
  })

  it('turns an empty bullet off on Enter without inserting content', () => {
    let state = handleRichTextEnter(
      createRichTextEditingState(
        content('item', {
          paragraphs: [
            { start: 0, end: 4, alignment: 'start', listKind: 'bullet' },
          ],
        }),
        { anchor: 4, focus: 4 },
      ),
    )

    state = handleRichTextEnter(state)
    expect(state.content.text).toBe('item\n')
    expect(state.content.paragraphs).toEqual([
      { start: 0, end: 5, alignment: 'start', listKind: 'bullet' },
      { start: 5, end: 5, alignment: 'start', listKind: 'none' },
    ])
  })

  it('turns a bullet off on Backspace at paragraph start instead of deleting text', () => {
    const state = createRichTextEditingState(
      content('one\ntwo', {
        paragraphs: [
          { start: 0, end: 4, alignment: 'start', listKind: 'bullet' },
          { start: 4, end: 7, alignment: 'start', listKind: 'bullet' },
        ],
      }),
      { anchor: 4, focus: 4 },
    )

    const result = handleRichTextBackspace(state)
    expect(result.handled).toBe(true)
    expect(result.state.content.text).toBe('one\ntwo')
    expect(result.state.content.paragraphs).toEqual([
      { start: 0, end: 4, alignment: 'start', listKind: 'bullet' },
      { start: 4, end: 7, alignment: 'start', listKind: 'none' },
    ])
  })

  it('normalizes adjacent spans and paragraph metadata without changing text', () => {
    const normalized = normalizeRichTextContent(
      content('a\nb', {
        spans: [
          { start: 0, end: 1, ...BASE_STYLE },
          { start: 1, end: 3, ...BASE_STYLE },
        ],
        paragraphs: [{ start: 0, end: 3, alignment: 'end', listKind: 'none' }],
      }),
    )

    expect(normalized.spans).toEqual([{ start: 0, end: 3, ...BASE_STYLE }])
    expect(normalized.paragraphs).toEqual([
      { start: 0, end: 2, alignment: 'end', listKind: 'none' },
      { start: 2, end: 3, alignment: 'end', listKind: 'none' },
    ])
  })

  it('applies paragraph formatting to every logical paragraph touched by a selection', () => {
    let state = createRichTextEditingState(content('one\ntwo\nthree'), {
      anchor: 1,
      focus: 8,
    })
    state = applyRichTextParagraphStyle(state, {
      alignment: 'center',
      listKind: 'bullet',
    })

    expect(state.content.paragraphs).toEqual([
      { start: 0, end: 4, alignment: 'center', listKind: 'bullet' },
      { start: 4, end: 8, alignment: 'center', listKind: 'bullet' },
      { start: 8, end: 13, alignment: 'start', listKind: 'none' },
    ])
  })
})
