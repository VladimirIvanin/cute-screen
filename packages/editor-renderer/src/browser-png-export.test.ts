import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'
import type { Canvas2DLike } from './backends/canvas2d/contracts'

describe('browser Canvas2D PNG encoding', () => {
  it('encodes an OffscreenCanvas surface through convertToBlob and decodes its pixels', async () => {
    const convert = vi.fn()
    const renderer = new Canvas2DRenderer({
      exportCanvas: (width, height) => {
        const target = createCanvas(width, height)
        return {
          get width() {
            return target.width
          },
          set width(value) {
            target.width = value
          },
          get height() {
            return target.height
          },
          set height(value) {
            target.height = value
          },
          getContext: () => target.getContext('2d'),
          convertToBlob: async (options: ImageEncodeOptions) => {
            convert(options)
            return new Blob([Uint8Array.from(await target.encode('png')).buffer], { type: 'image/png' })
          },
        } as unknown as Canvas2DLike
      },
    })
    await renderer.initialize({
      scene: createCanvas(16, 8) as unknown as HTMLCanvasElement,
      overlay: createCanvas(16, 8) as unknown as HTMLCanvasElement,
      dpr: 2,
      correlationId: 'offscreen-png',
    })
    renderer.setScene(createRenderSceneSnapshot({ width: 16, height: 8, nodes: [{
      kind: 'rect', id: 'red', x: 0, y: 0, width: 16, height: 8,
      rotation: 0, opacity: 1, visible: true, fill: { red: 1, green: 0, blue: 0, alpha: 1 },
    }] }))
    const image = await loadImage(await renderer.exportPng())
    expect(convert).toHaveBeenCalledWith({ type: 'image/png' })
    expect([image.width, image.height]).toEqual([16, 8])
    const decoded = createCanvas(16, 8)
    decoded.getContext('2d').drawImage(image, 0, 0)
    expect([...decoded.getContext('2d').getImageData(8, 4, 1, 1).data]).toEqual([255, 0, 0, 255])
    renderer.dispose()
  })
})
