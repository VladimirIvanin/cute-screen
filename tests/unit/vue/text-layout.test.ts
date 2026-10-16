import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createTextLayer } from '@cute-screen/editor-core'
import {
  layoutTextContent,
  measuredTextLayer,
  measuredTextCommand,
} from '../../../packages/editor-vue/src/text-layout'
import {
  RichTextEditorController,
  renderRichTextProjection,
  readRichTextProjection,
  restoreRichTextDomSelection,
  readRichTextDomSelection,
} from '../../../packages/editor-vue/src/rich-text-editor'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText(
      this: { font: string },
      text: string,
    ) {
      const unit = this.font.includes('Oswald') ? 5 : 10
      return { width: [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length * unit }
    },
  } as unknown as CanvasRenderingContext2D)
})
const layer = (text: string, fontFamily = 'Roboto') => createTextLayer({ id: 'text', text, fontFamily, origin: { x: 0, y: 0 } })!

describe('measured point text', () => {
  it('starts at one em and grows with the face, then caps and wraps unbroken source', () => {
    expect(layoutTextContent({ text: '', wrap: 'autoSize', spans: [], paragraphs: [] }).width).toBe(24)
    expect(measuredTextLayer(layer('WWW')).localBounds.width).toBe(30)
    expect(measuredTextLayer(layer('WWW', 'Oswald')).localBounds.width).toBe(15)
    const content = layer('ыв'.repeat(90)).payload.content
    const layout = layoutTextContent(content, 480)
    expect(layout.width).toBe(480)
    expect(layout.lines).toHaveLength(4)
    expect(layout.height).toBe(120)
    expect(content.text).toBe('ыв'.repeat(90))
  })

  it('respects manually stretched widths above the initial cap', () => {
    const content = { ...layer('a'.repeat(100)).payload.content, wrap: 'fixedWidth' as const, fixedWidth: 800 }
    expect(layoutTextContent(content, 480).width).toBe(800)
    expect(layoutTextContent(content).lines).toHaveLength(2)
  })

  it('projects shared soft lines without altering whitespace, paragraphs or selection offsets', () => {
    const content = layer('one two  👩‍💻и\u0306\nnext').payload.content
    // Creation API permits one paragraph; editing normalizes its logical blocks.
    const controller = new RichTextEditorController(content)
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.append(editor)
    const state = controller.state
    renderRichTextProjection(editor, state, 1, layoutTextContent(state.content, 60))
    expect(editor.querySelectorAll('[data-rich-text-soft-break]').length).toBeGreaterThan(0)
    expect(readRichTextProjection(editor)).toBe(content.text)
    restoreRichTextDomSelection(editor, { anchor: 4, focus: content.text.length })
    expect(readRichTextDomSelection(editor)).toEqual({ anchor: 4, focus: content.text.length })
    editor.remove()
  })

  it('persists the cap on new pasted text and remeasures group styles atomically', () => {
    const before = layer('в'.repeat(100))
    const capped = measuredTextLayer(before, 480)
    expect(capped.payload.content).toEqual(expect.objectContaining({ wrap: 'fixedWidth', fixedWidth: 480 }))
    expect(before.payload.content.wrap).toBe('autoSize')
    const after = layer(before.payload.content.text, 'Oswald')
    const command = measuredTextCommand({ type: 'batch', commands: [{ type: 'updateLayer', before, after }] })
    expect(command).toEqual({ type: 'batch', commands: [{ type: 'updateLayer', before,
      after: expect.objectContaining({ localBounds: expect.objectContaining({ width: 500 }) }) }] })
  })

})
