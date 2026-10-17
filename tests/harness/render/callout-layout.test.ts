import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  calloutTextLayout,
  createCalloutLayer,
  createDocumentRenderScene,
  parseEditorDocument,
  rebaseCalloutLayer,
  serializeEditorDocument,
  type RichTextContent,
} from '@cute-screen/editor-core'
import {
  measureRichTextContent,
  renderHeadlessCanvasKitPng,
} from '@cute-screen/editor-renderer'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvasKitFonts,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  rgba,
  alphaBounds,
} from './golden-assertion-test-kit'
import {
  compareRgba,
  semanticParityTolerance,
} from './golden'

beforeAll(prepareGoldenRuntime)

describe('measured callout preview and decoded export', () => {
  it.each([true, false])('keeps the padded label outside its marker across both backends (left=%s)', async (left) => {
    const scratch = createCanvas(1, 1).getContext('2d')
    const measureText = (content: RichTextContent) => measureRichTextContent(content, Infinity, 24, (text, style) => {
      const subset = /[\u0400-\u052f]/u.test(text) ? 'cyrillic' : 'latin'
      scratch.font = `${style.fontSize}px "Roboto ${subset}"`
      const m = scratch.measureText(text)
      return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent,
        lineAscent: m.fontBoundingBoxAscent, lineDescent: m.fontBoundingBoxDescent }
    })
    const context = { measureText }
    const base = createCalloutLayer({ style: null, id: '019c1f62-058e-7000-8000-000000000097',
      text: 'Текст выноски для интерфейса\nLongUnbrokenLabel1234567890',
      target: { x: left ? 650 : 80, y: 60 }, label: { x: left ? 380 : 400, y: 300 },
      background: { color: { red: 1, green: 0.9, blue: 0.6, alpha: 1 }, padding: 12, radius: 8 } })!
    const layer = rebaseCalloutLayer(base, { ...base.payload, content: {
      ...base.payload.content, wrap: 'fixedWidth', fixedWidth: 240,
    } }, context)
    const document = { ...documentFixture, layers: [layer] }
    const parsed = parseEditorDocument(serializeEditorDocument(document))
    if (parsed.kind !== 'editable') throw new Error('expected portable v7 document')
    const scene = createDocumentRenderScene(parsed.document, context)
    const rect = calloutTextLayout(layer.payload, context).text
    expect(left ? rect.x + rect.width < layer.payload.label.x : rect.x > layer.payload.label.x).toBe(true)
    const fallback = await canvas2dPngs(scene, 1)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts)
    expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)))
      .toEqual({ changedChannels: 0, maximumDelta: 0 })
    for (const png of [fallback.exported, kit]) {
      const image = await loadImage(png)
      expect(image.width).toBe(800)
      expect(image.height).toBe(600)
      const ink = alphaBounds(await rgba(png), 800, 600)
      expect(ink.left).toBeGreaterThanOrEqual(0)
      expect(ink.right).toBeLessThan(800)
      const canvas = createCanvas(800, 600)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      const labelPixels = ctx.getImageData(Math.floor(layer.transform.translateX + rect.x),
        Math.floor(layer.transform.translateY + rect.y), 240, Math.floor(rect.height)).data
      expect(labelPixels.some((v, i) => i % 4 === 3 && v > 0)).toBe(true)
    }
    const difference = compareRgba(await rgba(fallback.exported), await rgba(kit))
    expect(difference.changedChannels / (800 * 600 * 4))
      .toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
  })
})
