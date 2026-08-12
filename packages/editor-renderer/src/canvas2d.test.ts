import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { describe, expect, it } from 'vitest'

import { Canvas2DRenderer, type Canvas2DLike } from './canvas2d'

function asHtmlCanvas(canvas: unknown): HTMLCanvasElement {
  return canvas as unknown as HTMLCanvasElement
}

describe('Canvas2DRenderer', () => {
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

  it('renders committed multiline text through the same Canvas2D scene path', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(160, 80)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(createCanvas(160, 80)),
      dpr: 1,
      correlationId: 'text-render',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 160,
        height: 80,
        nodes: [
          {
            id: 'text',
            kind: 'text',
            text: 'A\nB',
            x: 12,
            y: 12,
            width: 60,
            height: 48,
            fontFamily: 'sans-serif',
            fontSize: 24,
            fontWeight: 400,
            fontStyle: 'normal',
            align: 'start',
            lineHeight: 28,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: { red: 1, green: 0, blue: 0, alpha: 1 },
          },
        ],
      }),
    )

    renderer.render(['scene'])
    const alpha = sceneCanvas
      .getContext('2d')
      ?.getImageData(12, 20, 24, 30).data
    expect(alpha?.some((value, index) => index % 4 === 3 && value > 0)).toBe(
      true,
    )
  })

  it('renders a bounded text shadow stack behind the final glyph pass', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(80, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(createCanvas(80, 64)),
      dpr: 1,
      correlationId: 'text-shadow',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 80,
        height: 64,
        nodes: [
          {
            kind: 'text',
            id: 'shadowed-i',
            text: 'I',
            x: 10,
            y: 10,
            width: 20,
            height: 36,
            fontFamily: 'sans-serif',
            fontSize: 32,
            fontWeight: 400,
            fontStyle: 'normal',
            align: 'start',
            lineHeight: 36,
            fill: { red: 1, green: 1, blue: 1, alpha: 1 },
            shadows: [
              {
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
                offsetX: 20,
                offsetY: 0,
                blur: 0,
              },
            ],
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )

    renderer.render(['scene'])
    const pixels = sceneCanvas
      .getContext('2d')
      ?.getImageData(28, 10, 24, 36).data
    expect(
      pixels?.some(
        (value, index) =>
          index % 4 === 0 &&
          value > (pixels[index + 1] ?? 0) &&
          (pixels[index + 3] ?? 0) > 0,
      ),
    ).toBe(true)
  })

  it('renders renderer-neutral linear gradients in exported output', async () => {
    const renderer = new Canvas2DRenderer({
      exportCanvas: (width, height) =>
        createCanvas(width, height) as unknown as Canvas2DLike,
    })
    const sceneCanvas = createCanvas(32, 8)
    const overlayCanvas = createCanvas(32, 8)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'gradient',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 32,
        height: 8,
        nodes: [
          {
            kind: 'rect',
            id: 'gradient',
            x: 0,
            y: 0,
            width: 32,
            height: 8,
            rotation: 0,
            opacity: 1,
            visible: true,
            blendMode: 'normal',
            fill: {
              kind: 'linearGradient',
              startX: 0,
              startY: 0,
              endX: 32,
              endY: 0,
              stops: [
                { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
                { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 1 } },
              ],
            },
          },
        ],
      }),
    )
    renderer.render(['scene'])
    const context = sceneCanvas.getContext('2d')!
    expect(context.getImageData(2, 4, 1, 1).data[0] ?? 0).toBeGreaterThan(
      context.getImageData(2, 4, 1, 1).data[2] ?? 0,
    )
    expect(context.getImageData(29, 4, 1, 1).data[2] ?? 0).toBeGreaterThan(
      context.getImageData(29, 4, 1, 1).data[0] ?? 0,
    )
  })

  it('uses a registered immutable resource for an image texture fill', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(16, 16)
    const overlayCanvas = createCanvas(16, 16)
    const texture = createCanvas(2, 2)
    texture.getContext('2d').fillStyle = '#00ff00'
    texture.getContext('2d').fillRect(0, 0, 2, 2)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(overlayCanvas),
      dpr: 1,
      correlationId: 'image-texture',
    })
    await renderer.createImageResource({
      id: 'texture',
      width: 2,
      height: 2,
      source: texture as unknown as HTMLImageElement,
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 16,
        height: 16,
        nodes: [
          {
            kind: 'rect',
            id: 'texture-shape',
            x: 0,
            y: 0,
            width: 16,
            height: 16,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: {
              kind: 'imageTexture',
              resourceId: 'texture',
              opacity: 1,
              scale: 1,
              rotation: 0,
              offsetX: 0,
              offsetY: 0,
            },
          },
        ],
      }),
    )
    renderer.render(['scene'])
    const pixel = sceneCanvas.getContext('2d')?.getImageData(8, 8, 1, 1).data
    expect(pixel?.[1]).toBeGreaterThan(200)
  })
})
