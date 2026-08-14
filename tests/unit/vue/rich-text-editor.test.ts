import { describe, expect, it } from 'vitest'

import type { RichTextContent } from '@cute-screen/editor-core'
import { RichTextEditorController } from '../../../packages/editor-vue/src/rich-text-editor'

const CONTENT: RichTextContent = Object.freeze({
  text: 'A😀B',
  wrap: 'autoSize',
  spans: [
    {
      start: 0,
      end: 4,
      fontFamily: 'Roboto',
      fontSize: 24,
      color: { red: 0, green: 0, blue: 0, alpha: 1 },
      weight: 400 as const,
      italic: false,
      strikethrough: false,
    },
  ],
  paragraphs: [
    {
      start: 0,
      end: 4,
      alignment: 'start' as const,
      listKind: 'none' as const,
    },
  ],
})

describe('RichTextEditorController', () => {
  it('tracks a UTF-16-safe browser selection and formats only that range', () => {
    const controller = new RichTextEditorController(CONTENT)
    controller.setSelection({ anchor: 1, focus: 3 })
    controller.applySpanStyle({ italic: true })

    expect(controller.state.content.spans).toEqual([
      expect.objectContaining({ start: 0, end: 1, italic: false }),
      expect.objectContaining({ start: 1, end: 3, italic: true }),
      expect.objectContaining({ start: 3, end: 4, italic: false }),
    ])
  })

  it('defers intermediate IME text and range updates until compositionend', () => {
    const controller = new RichTextEditorController(CONTENT, {
      anchor: 4,
      focus: 4,
    })
    controller.compositionStart()

    expect(
      controller.reconcileBrowserText('A😀Bに', { anchor: 5, focus: 5 }),
    ).toBe('deferred')
    expect(
      controller.reconcileBrowserText('A😀B日本', { anchor: 6, focus: 6 }),
    ).toBe('deferred')
    expect(controller.state.content.text).toBe('A😀B')
    expect(controller.revision).toBe(0)

    controller.compositionEnd('A😀B日本', { anchor: 6, focus: 6 })
    expect(controller.state.content.text).toBe('A😀B日本')
    expect(controller.state.content.spans.at(-1)?.end).toBe(6)
    expect(controller.revision).toBe(1)
  })

  it('uses paragraph metadata for bullet Enter and Backspace behavior', () => {
    const controller = new RichTextEditorController({
      ...CONTENT,
      text: 'item',
      spans: [{ ...CONTENT.spans[0]!, end: 4 }],
      paragraphs: [
        { start: 0, end: 4, alignment: 'start', listKind: 'bullet' },
      ],
    })
    controller.setSelection({ anchor: 4, focus: 4 })

    expect(controller.keydown('Enter')).toBe(true)
    expect(controller.state.content.text).toBe('item\n')
    expect(controller.state.content.paragraphs.at(-1)).toMatchObject({
      start: 5,
      end: 5,
      listKind: 'bullet',
    })
    expect(controller.keydown('Enter')).toBe(true)
    expect(controller.state.content.text).toBe('item\n')
    expect(controller.state.content.paragraphs.at(-1)?.listKind).toBe('none')

    controller.applyParagraphStyle({ listKind: 'bullet' })
    expect(controller.keydown('Backspace')).toBe(true)
    expect(controller.state.content.text).toBe('item\n')
    expect(controller.state.content.paragraphs.at(-1)?.listKind).toBe('none')
  })

  it('copies and pastes only normalized plain text', () => {
    const controller = new RichTextEditorController(CONTENT)
    controller.setSelection({ anchor: 1, focus: 3 })
    expect(controller.selectedPlainText()).toBe('😀')

    controller.replaceSelectionPlainText('plain\r\n<b>text</b>')
    expect(controller.state.content.text).toBe('Aplain\n<b>text</b>B')
    expect(controller.state.content.text).not.toContain('\r')
    expect(controller.state.content.spans.at(-1)?.end).toBe(
      controller.state.content.text.length,
    )
  })
})
