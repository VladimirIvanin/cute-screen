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
  createCalloutLayer,
  createDocumentRenderScene,
  DEFAULT_CALLOUT_STYLE,
  serializeEditorDocument,
  parseEditorDocument,
  rebaseCalloutLayer,
  calloutTextRect,
  type CalloutFrame,
  type CalloutMarker,
} from '@cute-screen/editor-core'
import {
  renderHeadlessCanvasKitPng,
  measureRichTextContent,
} from '@cute-screen/editor-renderer'
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
const kinds: readonly CalloutFrame['kind'][] = ['text', 'outline', 'card', 'capsule', 'accent']
const markers: readonly CalloutMarker[] = ['none', 'circle', 'ring', 'lineArrow', 'solidArrow']
describe('portable callout appearance', () => {
  it('decodes the accent on the expected edge for all four target directions', async () => {
    const cases = [
      { target: { x: 100, y: 80 }, label: { x: 250, y: 80 }, side: 'right' },
      { target: { x: 700, y: 180 }, label: { x: 450, y: 180 }, side: 'left' },
      { target: { x: 100, y: 220 }, label: { x: 100, y: 360 }, side: 'bottom' },
      { target: { x: 550, y: 480 }, label: { x: 550, y: 320 }, side: 'top' },
    ] as const
    const layers = cases.map((entry, index) => createCalloutLayer({
      id: `019c1f62-058e-7000-8000-00000000007${index}`, text: 'Label',
      target: entry.target, label: entry.label, route: { path: 'straight' },
      style: { ...DEFAULT_CALLOUT_STYLE, frame: { ...DEFAULT_CALLOUT_STYLE.frame, kind: 'accent' } },
    })!)
    const scene = createDocumentRenderScene({ ...documentFixture, layers })
    const fallback = await canvas2dPngs(scene, 1)
    for (const png of [fallback.exported, renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts)]) {
      const pixels = await rgba(png)
      for (const [index, entry] of cases.entries()) {
        const layer = layers[index]!
        const rect = calloutTextRect(layer.payload)
        const x = layer.transform.translateX + rect.x, y = layer.transform.translateY + rect.y
        const alpha = (px: number, py: number) => pixels[(Math.floor(py) * 800 + Math.floor(px)) * 4 + 3]!
        const vertical = entry.side === 'left' || entry.side === 'right'
        if (vertical) {
          expect(alpha(entry.side === 'left' ? x + 1 : x + rect.width - 1, y + 4)).toBeGreaterThan(128)
          expect(alpha(entry.side === 'left' ? x + rect.width - 1 : x + 1, y + 4)).toBe(0)
        } else {
          expect(alpha(x + 4, entry.side === 'top' ? y + 1 : y + rect.height - 1)).toBeGreaterThan(128)
          expect(alpha(x + 4, entry.side === 'top' ? y + rect.height - 1 : y + 1)).toBe(0)
        }
      }
    }
  })
  it('decodes full-size curved and empty callouts without leaking hidden decoration', async () => {
    const empty = createCalloutLayer({ id: '019c1f62-058e-7000-8000-000000000081', text: '',
      target: { x: 180, y: 600 }, label: { x: 700, y: 400 },
      style: { ...DEFAULT_CALLOUT_STYLE, frame: { ...DEFAULT_CALLOUT_STYLE.frame, padding: 256 } } })!
    const base = createCalloutLayer({ id: '019c1f62-058e-7000-8000-000000000082', text: 'Изогнутая подпись\nCurved annotation',
      target: { x: 1200, y: 900 }, label: { x: 1800, y: 500 },
      style: { ...DEFAULT_CALLOUT_STYLE, targetMarker: 'solidArrow', frame: { ...DEFAULT_CALLOUT_STYLE.frame, kind: 'accent' } } })!
    const curved = rebaseCalloutLayer(base, { ...base.payload, route: { path: 'quadratic',
      bend: { x: base.payload.target.x, y: base.payload.label.y - 250 } } })
    const document = { ...documentFixture, canvas: { width: 2560, height: 1440 }, layers: [empty, curved] }
    const decoded = parseEditorDocument(serializeEditorDocument(document))
    if (decoded.kind !== 'editable') throw new Error('expected editable revision')
    const scene = createDocumentRenderScene(decoded.document)
    const fallback = await canvas2dPngs(scene, 1)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts)
    expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)))
      .toEqual({ changedChannels: 0, maximumDelta: 0 })
    for (const png of [fallback.exported, kit]) {
      const image = await loadImage(png)
      expect([image.width, image.height]).toEqual([2560, 1440])
      const pixels = await rgba(png)
      // The giant stored card would cover this region if an empty caption leaked its frame.
      expect(pixels[(450 * 2560 + 750) * 4 + 3]).toBe(0)
      expect(alphaBounds(pixels, 2560, 1440).bottom).toBeGreaterThan(850)
    }
  })
  it.each(kinds)('decodes %s with every marker across Canvas2D and CanvasKit', async (kind) => {
    const scratch = createCanvas(1, 1).getContext('2d')
    const context = { measureText: (content: Parameters<typeof measureRichTextContent>[0]) => measureRichTextContent(
      content, Infinity, 24, (text, style) => {
        scratch.font = `${style.fontSize}px "Roboto ${/[\u0400-\u052f]/u.test(text) ? 'cyrillic' : 'latin'}"`
        const m = scratch.measureText(text)
        return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent,
          lineAscent: m.fontBoundingBoxAscent, lineDescent: m.fontBoundingBoxDescent }
      }) }
    const layers = markers.map((marker, i) => createCalloutLayer({ id: `019c1f62-058e-7000-8000-00000000009${i}`,
      text: 'Label\nПояснение', target: { x: 50, y: 90 + i * 100 }, label: { x: 280, y: 60 + i * 100 },
      style: { ...DEFAULT_CALLOUT_STYLE, frame: { ...DEFAULT_CALLOUT_STYLE.frame, kind }, targetMarker: marker,
        labelMarker: markers[(i + 1) % 5]!,
        targetMarkerStyle: { size: 14, color: { red: 1, green: 0.2, blue: 0, alpha: 1 } },
        labelMarkerStyle: { size: 12 } },
    })!)
    const parsed = parseEditorDocument(serializeEditorDocument({ ...documentFixture, layers }))
    if (parsed.kind !== 'editable') throw new Error('expected editable callouts')
    const scene = createDocumentRenderScene(parsed.document, context)
    const fallback = await canvas2dPngs(scene, 1)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts)
    expect(compareRgba(await rgba(fallback.preview),
      await rgba(fallback.exported))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    for (const png of [fallback.exported, kit]) {
      const image = await loadImage(png)
      expect([image.width, image.height]).toEqual([800, 600])
      const bounds = alphaBounds(await rgba(png), 800, 600)
      expect(bounds.right - bounds.left).toBeGreaterThan(300)
      expect(bounds.bottom - bounds.top).toBeGreaterThan(400)
    }
    const difference = compareRgba(await rgba(fallback.exported), await rgba(kit))
    expect(difference.changedChannels / (800 * 600 * 4))
      .toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
  })
})
