import {
  beforeAll,
  expect,
  it,
} from 'vitest'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { renderCanvasKitPng } from '../../../packages/editor-renderer/src/backends/canvaskit/scene'
import { CanvasKitTypefaceStore } from '../../../packages/editor-renderer/src/backends/canvaskit/geometry'
import {
  canvasKit,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'

beforeAll(prepareGoldenRuntime)
it('exports an enlarged tiny crop of an 8K content group without allocating a gigapixel source', async () => {
  const base = { visible: true, opacity: 1, rotation: 0 } as const
  const content = createRenderSceneSnapshot({ width: 7680, height: 4320,
    outputBounds: { x: 200, y: 300, width: 100, height: 100 }, nodes: [
      { ...base, id: 'red', kind: 'rect', x: 0, y: 0, width: 7680, height: 4320,
        fill: { red: 1, green: 0, blue: 0, alpha: 1 } },
      { ...base, id: 'blue-crop', kind: 'rect', x: 200, y: 300, width: 100, height: 100,
        fill: { red: 0, green: 0, blue: 1, alpha: 1 } },
    ] })
  const bounds = { x: 0, y: 0, width: 1080, height: 1080 }
  const scene = createRenderSceneSnapshot({ width: 1080, height: 1080, nodes: [
    { ...base, id: 'content', kind: 'group', scene: content, destination: bounds, clip: bounds, cornerRadius: 0, blur: 0 },
  ] })
  const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
  const typefaces = new CanvasKitTypefaceStore(canvasKit, [])
  await renderer.initialize({ scene: createCanvas(1, 1) as unknown as HTMLCanvasElement,
    overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'crop-card' })
  try {
    renderer.setScene(scene)
    const outputs = [await renderer.exportPng({ scale: 2 }),
      renderCanvasKitPng(canvasKit, scene, new Map(), typefaces, { scale: 2 })]
    for (const bytes of outputs) {
      const image = await loadImage(bytes)
      expect([image.width, image.height]).toEqual([2160, 2160])
      const canvas = createCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      expect([...context.getImageData(1000, 1000, 1, 1).data]).toEqual([0, 0, 255, 255])
    }
  } finally {
    renderer.dispose()
    typefaces.dispose()
  }
}, 30000)
