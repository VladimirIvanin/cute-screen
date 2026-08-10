import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { describe, expect, it } from 'vitest'

import { Canvas2DRenderer, type Canvas2DLike } from './canvas2d'

function asHtmlCanvas(canvas: unknown): HTMLCanvasElement {
  return canvas as unknown as HTMLCanvasElement
}

describe('Canvas2DRenderer', () => {
  it('renders and exports binary PNG without a continuous loop', async () => {
    let time = 10
    const renderer = new Canvas2DRenderer({
      now: () => time++,
      exportCanvas: (width, height) =>
        createCanvas(width, height) as unknown as Canvas2DLike,
    })
    const sceneCanvas = createCanvas(64, 64)
    const overlayCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'renderer-test',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'rect',
            id: 'red',
            x: 8,
            y: 8,
            width: 32,
            height: 24,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: { red: 1, green: 0, blue: 0, alpha: 1 },
          },
        ],
      }),
    )

    expect(renderer.render(['scene'])).toMatchObject({
      backend: 'canvas2d',
      correlationId: 'renderer-test',
      reasons: ['scene'],
      nodeCount: 1,
      duration: 1,
    })
    const png = await renderer.exportPng()
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const decoded = await loadImage(png)
    expect([decoded.width, decoded.height]).toEqual([64, 64])
  })

  it('draws a recoverable placeholder when an image resource is missing', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(64, 64)
    const overlayCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'missing-image',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'image',
            id: 'missing',
            resourceId: 'not-loaded',
            x: 8,
            y: 8,
            width: 32,
            height: 24,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )

    renderer.render(['scene'])
    expect(
      sceneCanvas.getContext('2d')?.getImageData(16, 16, 1, 1).data[3],
    ).toBeGreaterThan(0)
  })

  it('preserves scene-node z-order across image and vector nodes', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(64, 64)
    const overlayCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'mixed-z-order',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'rect',
            id: 'underlay',
            x: 12,
            y: 12,
            width: 32,
            height: 32,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: { red: 0, green: 1, blue: 0, alpha: 1 },
          },
          {
            kind: 'image',
            id: 'top-image',
            resourceId: 'missing',
            x: 12,
            y: 12,
            width: 32,
            height: 32,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )

    renderer.render(['scene'])
    const pixel = sceneCanvas.getContext('2d')?.getImageData(28, 28, 1, 1).data
    expect(pixel?.[0]).toBeGreaterThan(0)
  })
})
