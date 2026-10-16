import {
  createRenderSceneSnapshot,
  type RenderTextNode,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import { TEXT_FONT_FAMILIES } from '../../../packages/editor-vue/src/text-fonts'
import {
  canvasKit,
  canvasKitFonts,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  assertGolden,
  rgba,
} from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)

function sample(
  family: string,
  index: number,
  text: string,
  boldItalic = false,
): RenderTextNode {
  return { kind: 'text', id: `${family}-${text}-${boldItalic}`, text, x: 12 + (boldItalic ? 380 : 0), y: index * 52 + 4,
    width: 360, height: 48, wrap: 'autoSize', rotation: 0, visible: true, opacity: 1,
    runs: [{ start: 0, end: text.length, fontFamily: family, fontSize: 22, fontWeight: boldItalic ? 700 : 400,
      fontStyle: boldItalic ? 'italic' : 'normal', strikethrough: false, color: { red: 0, green: 0, blue: 0, alpha: 1 } }],
    paragraphs: [{ start: 0, end: text.length, alignment: 'start', listKind: 'none' }] }
}

describe('bundled text font assets', () => {
  for (const text of ['Пример текста 123', 'Sample text 123']) {
    it(`renders all twelve distinct families and B/I to decoded PNG: ${text}`, async () => {
      const nodes = TEXT_FONT_FAMILIES.flatMap((family, index) => [
        sample(family, index, text), sample(family, index, text, true),
      ])
      const scene = createRenderSceneSnapshot({ width: 780, height: 640, nodes: [{
        kind: 'rect', id: 'background', x: 0, y: 0, width: 780, height: 640,
        rotation: 0, opacity: 1, visible: true, fill: { red: 1, green: 1, blue: 1, alpha: 1 },
      }, ...nodes] })
      const canvas2d = await canvas2dPngs(scene, 1)
      const skia = renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts)
      const pixels = await rgba(canvas2d.exported)
      expect(compareRgba(await rgba(canvas2d.preview), pixels)).toEqual({ changedChannels: 0, maximumDelta: 0 })
      const skiaPixels = await rgba(skia)
      for (let row = 0; row < 12; row += 1) {
        for (const image of [pixels, skiaPixels]) {
          for (const startX of [0, 380]) {
            let ink = 0
            for (let y = row * 52; y < row * 52 + 52; y += 1) {
              for (let x = startX; x < startX + 380; x += 1) if (
                image[(y * 780 + x) * 4 + 3]! > 0 &&
                image[(y * 780 + x) * 4]! < 128
              ) ink += 1
            }
            expect(ink, `Missing ${TEXT_FONT_FAMILIES[row]} ${startX ? 'B/I' : 'regular'} ink`).toBeGreaterThan(80)
          }
        }
      }
      const script = text.startsWith('Пример') ? 'cyrillic' : 'latin'
      await assertGolden(`text-fonts-${script}-canvas2d`, canvas2d.exported)
      await assertGolden(`text-fonts-${script}-canvaskit`, skia)
    })
  }
})
