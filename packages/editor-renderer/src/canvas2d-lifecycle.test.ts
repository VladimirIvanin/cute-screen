import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { describe, expect, it } from 'vitest'

import type { Canvas2DLike } from './backends/canvas2d/contracts'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'

function asHtmlCanvas(canvas: unknown): HTMLCanvasElement {
  return canvas as unknown as HTMLCanvasElement
}

describe('Canvas2D renderer lifecycle and vector nodes', () => {
  it('applies a shared negative layer scale to vector annotations', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(createCanvas(64, 64)),
      dpr: 1,
      correlationId: 'flipped-vector',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'rect',
            id: 'annotation',
            x: 8,
            y: 8,
            width: 8,
            height: 8,
            rotation: 0,
            scaleX: 1,
            scaleY: -1,
            transformOriginX: 0,
            transformOriginY: 32,
            opacity: 1,
            visible: true,
            fill: { red: 1, green: 0, blue: 0, alpha: 1 },
          },
        ],
      }),
    )

    renderer.render(['scene'])
    const context = sceneCanvas.getContext('2d')!
    expect(context.getImageData(12, 52, 1, 1).data[3]).toBeGreaterThan(0)
    expect(context.getImageData(12, 12, 1, 1).data[3]).toBe(0)
  })

  it('strokes a marker contour as one continuous path', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(64, 64)
    const overlayCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'marker-path',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'path',
            id: 'marker',
            points: [
              { x: 8, y: 8 },
              { x: 32, y: 40 },
              { x: 56, y: 8 },
            ],
            rotation: 0,
            opacity: 1,
            visible: true,
            blendMode: 'multiply',
            stroke: { red: 1, green: 0.8, blue: 0, alpha: 1 },
            strokeWidth: 12,
            lineCap: 'round',
            lineJoin: 'round',
          },
        ],
      }),
    )

    renderer.render(['scene'])
    expect(
      sceneCanvas.getContext('2d')?.getImageData(32, 40, 1, 1).data[3],
    ).toBeGreaterThan(0)
  })

  it('continues an arrow dash phase through an elbow corner', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(40, 40)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(createCanvas(40, 40)),
      dpr: 1,
      correlationId: 'dashed-elbow',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 40,
        height: 40,
        nodes: [
          {
            kind: 'path',
            id: 'arrow:body',
            points: [
              { x: 8, y: 8 },
              { x: 16, y: 8 },
              { x: 16, y: 32 },
            ],
            rotation: 0,
            opacity: 1,
            visible: true,
            stroke: { red: 1, green: 0, blue: 0, alpha: 1 },
            strokeWidth: 2,
            lineCap: 'butt',
            lineJoin: 'round',
            dash: [8, 4],
          },
        ],
      }),
    )

    renderer.render(['scene'])
    const context = sceneCanvas.getContext('2d')!
    expect(context.getImageData(16, 10, 1, 1).data[3]).toBe(0)
    expect(context.getImageData(16, 14, 1, 1).data[3]).toBeGreaterThan(0)
  })

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

  it('clips a rounded content-image placeholder and draws its border', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(64, 64)
    const overlayCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'rounded-image',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'image',
            id: 'missing-rounded',
            resourceId: 'not-loaded',
            x: 8,
            y: 8,
            width: 32,
            height: 32,
            scaleX: 1,
            scaleY: 1,
            cornerRadius: 12,
            stroke: { red: 0.2, green: 0.6, blue: 1, alpha: 1 },
            strokeWidth: 3,
            lineJoin: 'round',
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )

    renderer.render(['scene'])
    const context = sceneCanvas.getContext('2d')
    expect(context?.getImageData(8, 8, 1, 1).data[3]).toBe(0)
    expect(context?.getImageData(24, 8, 1, 1).data[2]).toBeGreaterThan(0)
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
