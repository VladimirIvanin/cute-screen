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
