import {
  beforeAll,
  expect,
  it,
} from 'vitest'
import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { loadImage } from '@napi-rs/canvas'
import {
  addCalloutStep,
  createCalloutLayer,
  createDocumentRenderScene,
  createRenderSceneSnapshot,
  DEFAULT_CALLOUT_STYLE,
  rebaseCalloutLayer,
  type CalloutLayer,
  type RenderNode,
} from '@cute-screen/editor-core'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)
const neutral = { red: 0.42, green: 0.45, blue: 0.48, alpha: 1 }
const green = { red: 0.1, green: 0.6, blue: 0.26, alpha: 1 }
const orange = { red: 1, green: 0.6, blue: 0.05, alpha: 1 }
const common = { rotation: 0, opacity: 1, visible: true, blendMode: 'normal' as const }
function box(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  shade: number,
): RenderNode {
  return { ...common, id, kind: 'rect', x, y, width, height,
    fill: { red: shade, green: shade, blue: shade, alpha: 1 } }
}
function label(
  id: string,
  text: string,
  x: number,
  y: number,
  size = 18,
): RenderNode {
  return { ...common, id, kind: 'text', text, x, y, width: 400, height: 40, wrap: 'autoSize',
    runs: [{ start: 0, end: text.length, fontFamily: 'Roboto', fontSize: size, color: neutral,
      fontWeight: 400, fontStyle: 'normal', strikethrough: false }],
    paragraphs: [{ start: 0, end: text.length, alignment: 'start', listKind: 'none' }] }
}
function annotation(
  index: number,
  text: string,
  target: { x: number; y: number },
  end: { x: number; y: number },
): CalloutLayer {
  const layer = createCalloutLayer({ id: `019c1f62-058e-7000-8000-${index.toString(16).padStart(12, '0')}`,
    text, target, label: end,
    style: { ...DEFAULT_CALLOUT_STYLE, frame: { ...DEFAULT_CALLOUT_STYLE.frame, kind: 'text' },
      targetMarkerStyle: { size: 9, color: orange }, labelMarker: 'circle',
      labelMarkerStyle: { size: 9, color: green } },
  })!
  const split = text.indexOf('\n')
  const base = layer.payload.content.spans[0]!
  const spans = split < 0 ? [{ ...base, fontSize: 18 }] : [
    { ...base, start: 0, end: split, fontSize: 18 },
    { ...base, start: split, end: text.length, fontSize: 14 },
  ]
  return rebaseCalloutLayer(layer, { ...layer.payload, content: { ...layer.payload.content, spans } })
}
it('exports a product annotation sheet with simple, stepped and extended routes', async () => {
  const shop: RenderNode[] = [
    box('page', 0, 0, 1280, 900, 1),
    label('title', 'Editable callouts', 60, 45, 28),
    label('subtitle', 'Technical labels, independent endpoints and cards', 60, 91),
    box('panel', 290, 175, 430, 460, .96),
    box('product', 312, 198, 170, 230, .88),
    label('product-name', 'Wool sweater', 503, 207),
    box('variant', 503, 257, 190, 38, .88),
    label('variant-label', 'Color: green', 516, 264, 16),
    box('size', 503, 317, 190, 38, .88),
    label('size-label', 'Size: M', 516, 324, 16),
    box('quantity', 503, 377, 190, 38, .88),
    label('quantity-label', '−     1     +', 516, 384, 16),
    label('stock', 'Available', 312, 455, 16),
    label('price', '$49.00', 312, 493, 26),
    box('buy', 312, 550, 220, 50, .82),
    label('buy-label', 'Add to cart', 364, 562, 18),
  ]
  const simple = annotation(1, 'data-product-variants\nВыбор варианта', { x: 690, y: 276 }, { x: 820, y: 200 })
  const stepped = addCalloutStep(annotation(2, 'data-quantity-change\nКоличество товара',
    { x: 690, y: 396 }, { x: 820, y: 360 }), 0, 35)
  const extended = addCalloutStep(addCalloutStep(annotation(3, 'data-item-add\nДобавление в корзину',
    { x: 530, y: 575 }, { x: 820, y: 540 }), 0, 30), 3, 30)
  const left = annotation(4, 'data-product-price\nАктуальная цена', { x: 314, y: 510 }, { x: 235, y: 420 })
  const cardBase = annotation(5, 'Карточка с пояснением\nЦель остаётся на месте при переносе подписи.',
    { x: 710, y: 620 }, { x: 810, y: 730 })
  const card = rebaseCalloutLayer(cardBase, { ...cardBase.payload, attachment: 'left',
    labelMarker: 'none', frame: DEFAULT_CALLOUT_STYLE.frame,
    content: { ...cardBase.payload.content, wrap: 'fixedWidth', fixedWidth: 330 } })
  const scene = createDocumentRenderScene({ ...documentFixture, canvas: { width: 1280, height: 900 },
    layers: [simple, stepped, extended, left, card] })
  const snapshot = createRenderSceneSnapshot({ ...scene, nodes: [...shop, ...scene.nodes] })
  const png = await canvas2dPngs(snapshot, 1)
  expect(compareRgba(await rgba(png.preview), await rgba(png.exported)))
    .toEqual({ changedChannels: 0, maximumDelta: 0 })
  const decoded = await loadImage(png.exported)
  expect([decoded.width, decoded.height]).toEqual([1280, 900])
  await mkdir('artifacts/callout', { recursive: true })
  await writeFile('artifacts/callout/examples.png', png.exported)
})
