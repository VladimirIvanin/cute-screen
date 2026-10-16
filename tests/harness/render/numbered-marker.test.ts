import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createNumberedMarkerLayer,
  rebaseNumberedMarkerLayer,
  numberedMarkerLabelBounds,
  numberedMarkerNumberContent,
  setNumberedMarkerCaption,
  numberedMarkerCaptionBounds,
  createDocumentRenderScene,
  serializeEditorDocument,
  parseEditorDocument,
  type RichTextContent,
} from '@cute-screen/editor-core'
import {
  measureRichTextContent,
  renderHeadlessCanvasKitPng,
} from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvasKitFonts,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)
describe('measured numbered marker decoded export', () => {
  it.each(['circle', 'square', 'diamond', 'star'] as const)('fits numbers inside %s and keeps its multiline caption outside on both backends', async (shape) => {
    const scratch = createCanvas(1, 1).getContext('2d')
    const measure = (content: RichTextContent) => measureRichTextContent(content, Infinity, 16, (text, style) => {
      const subset = /[\u0400-\u052f]/u.test(text) ? 'cyrillic' : 'latin'
      scratch.font = `700 ${style.fontSize}px "Roboto ${subset}"`
      const m = scratch.measureText(text)
      return { width: m.width,
        ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent,
        lineAscent: m.fontBoundingBoxAscent, lineDescent: m.fontBoundingBoxDescent,
      }
    })
    for (const text of ['1', '10', '100', 'Шаг\nдалее']) {
      const fontSize = text === '1' ? 16 : 48
      const base = createNumberedMarkerLayer({
        id: '019c1f62-058e-7000-8000-000000000099', sequence: text.startsWith('Шаг') ? 7 : Number(text),
        origin: { x: 700, y: 500 }, shape,
        badgeColor: { red: 0.12, green: 0.25, blue: 0.65, alpha: 1 },
      })
      const content = { ...base.payload.label, text, spans: [{ ...base.payload.label.spans[0]!, fontSize, end: text.length }], paragraphs: text.split('\n').map((part, index, parts) => ({ ...base.payload.label.paragraphs[0]!, start: index === 0 ? 0 : parts[0]!.length + 1, end: index === 0 && parts.length > 1 ? part.length + 1 : text.length })) }
      const numbered = { ...base, payload: { ...base.payload,
        label: { ...base.payload.label, spans: [{ ...base.payload.label.spans[0]!, fontSize }] } } }
      const captioned = text.startsWith('Шаг') ? setNumberedMarkerCaption(numbered, {
        ...content, spans: content.spans.map((span) => ({ ...span, color: { red: 0, green: 0, blue: 0, alpha: 1 } })),
      }) : numbered
      const layer = rebaseNumberedMarkerLayer(captioned, measure(numberedMarkerNumberContent(captioned)))
      const document = { ...documentFixture,
        canvas: { width: 1400, height: 1000 },
        layers: [layer],
      }
      const parsed = parseEditorDocument(serializeEditorDocument(document))
      if (parsed.kind !== 'editable') throw new Error('expected portable v7 document')
      const scene = createDocumentRenderScene(parsed.document, { measureText: measure })
      const fallback = await canvas2dPngs(scene, 1)
      const kit = renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts)
      expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)))
        .toEqual({ changedChannels: 0, maximumDelta: 0 })
      const safe = numberedMarkerLabelBounds(layer)
      if (text.startsWith('Шаг')) {
        const caption = scene.nodes.find((node) => node.id.endsWith(':caption'))!
        const bounds = numberedMarkerCaptionBounds(layer, { measureText: measure })
        expect(caption).toMatchObject({ text,
          x: layer.transform.translateX + bounds.x, y: layer.transform.translateY + bounds.y,
        })
        expect(bounds.x).toBeGreaterThan(layer.localBounds.x + layer.localBounds.width)
      }
      for (const png of [fallback.exported, kit]) {
        const decoded = await loadImage(png)
        expect([decoded.width, decoded.height]).toEqual([1400, 1000])
        const pixels = (await rgba(png))
        let ink = 0
        let captionInk = 0
        const captionBounds = numberedMarkerCaptionBounds(layer, { measureText: measure })
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            text.startsWith('Шаг') &&
            pixels[i]! < 20 &&
            pixels[i + 1]! < 20 &&
            pixels[i + 2]! < 20 &&
            pixels[i + 3]! > 100
          ) {
            const x = i / 4 % 1400
            const y = Math.floor(i / 4 / 1400)
            expect(x).toBeGreaterThanOrEqual(Math.floor(layer.transform.translateX + captionBounds.x) - 2)
            expect(x).toBeLessThanOrEqual(
              Math.ceil(layer.transform.translateX + captionBounds.x + captionBounds.width) + 2,
            )
            expect(y).toBeGreaterThanOrEqual(Math.floor(layer.transform.translateY + captionBounds.y) - 2)
            expect(y).toBeLessThanOrEqual(
              Math.ceil(layer.transform.translateY + captionBounds.y + captionBounds.height) + 2,
            )
            captionInk++
          }
          if (
            pixels[i]! < 220 ||
            pixels[i + 1]! < 220 ||
            pixels[i + 2]! < 220 ||
            pixels[i + 3]! < 100
          ) continue
          const x = (i / 4) % 1400
          const y = Math.floor(i / 4 / 1400)
          expect(x).toBeGreaterThanOrEqual(Math.floor(layer.transform.translateX + safe.x) - 2)
          expect(x).toBeLessThanOrEqual(Math.ceil(layer.transform.translateX + safe.x + safe.width) + 2)
          expect(y).toBeGreaterThanOrEqual(Math.floor(layer.transform.translateY + safe.y) - 2)
          expect(y).toBeLessThanOrEqual(Math.ceil(layer.transform.translateY + safe.y + safe.height) + 2)
          ink += 1
        }
        expect(ink).toBeGreaterThan(10)
        if (text.startsWith('Шаг')) expect(captionInk).toBeGreaterThan(10)
      }
    }
  })
})
