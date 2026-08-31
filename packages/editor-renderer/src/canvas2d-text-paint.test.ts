import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { describe, expect, it } from 'vitest'

import type { Canvas2DLike } from './backends/canvas2d/contracts'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'

function asHtmlCanvas(canvas: unknown): HTMLCanvasElement {
  return canvas as unknown as HTMLCanvasElement
}

function verticalInkCenter(canvas: Canvas): number {
  const { data, width, height } = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height)
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (bottom < top) throw new Error('expected rendered text ink')
  return (top + bottom + 1) / 2
}

describe('Canvas2D renderer text and paints', () => {
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
            wrap: 'autoSize',
            runs: [
              {
                start: 0,
                end: 3,
                fontFamily: 'sans-serif',
                fontSize: 24,
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
                fontWeight: 400,
                fontStyle: 'normal',
                strikethrough: false,
              },
            ],
            paragraphs: [
              { start: 0, end: 2, alignment: 'start', listKind: 'none' },
              { start: 2, end: 3, alignment: 'start', listKind: 'none' },
            ],
            rotation: 0,
            opacity: 1,
            visible: true,
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

  it('visually centers numbered-marker digits from measured glyph ink', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(64, 64)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(createCanvas(64, 64)),
      dpr: 1,
      correlationId: 'numbered-marker-center',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            id: 'numbered-marker:label',
            kind: 'text',
            text: '1',
            x: 8,
            y: 8,
            width: 48,
            height: 48,
            wrap: 'autoSize',
            runs: [
              {
                start: 0,
                end: 1,
                fontFamily: 'Roboto',
                fontSize: 32,
                color: { red: 1, green: 1, blue: 1, alpha: 1 },
                fontWeight: 700,
                fontStyle: 'normal',
                strikethrough: false,
              },
            ],
            paragraphs: [
              { start: 0, end: 1, alignment: 'center', listKind: 'none' },
            ],
            verticalAlign: 'visualCenter',
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )

    renderer.render(['scene'])

    expect(Math.abs(verticalInkCenter(sceneCanvas) - 32)).toBeLessThanOrEqual(
      0.5,
    )
  })

  it('renders mixed run colors, a metadata bullet and strikethrough', async () => {
    const renderer = new Canvas2DRenderer()
    const sceneCanvas = createCanvas(160, 80)
    await renderer.initialize({
      scene: asHtmlCanvas(sceneCanvas),
      overlay: asHtmlCanvas(createCanvas(160, 80)),
      dpr: 1,
      correlationId: 'rich-text',
    })
    renderer.setScene(
      createRenderSceneSnapshot({
        width: 160,
        height: 80,
        nodes: [
          {
            kind: 'text',
            id: 'rich-text',
            text: 'A B',
            x: 10,
            y: 10,
            width: 120,
            height: 48,
            wrap: 'fixedWidth',
            fixedWidth: 120,
            runs: [
              {
                start: 0,
                end: 1,
                fontFamily: 'sans-serif',
                fontSize: 32,
                color: { red: 0, green: 0, blue: 1, alpha: 1 },
                fontWeight: 400,
                fontStyle: 'normal',
                strikethrough: false,
              },
              {
                start: 1,
                end: 3,
                fontFamily: 'serif',
                fontSize: 24,
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
                fontWeight: 700,
                fontStyle: 'italic',
                strikethrough: true,
              },
            ],
            paragraphs: [
              { start: 0, end: 3, alignment: 'start', listKind: 'bullet' },
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
      ?.getImageData(10, 10, 120, 48).data
    expect(
      pixels?.some(
        (value, index) =>
          index % 4 === 2 &&
          value > (pixels[index - 2] ?? 0) &&
          (pixels[index + 1] ?? 0) > 0,
      ),
    ).toBe(true)
    expect(
      pixels?.some(
        (value, index) =>
          index % 4 === 0 &&
          value > (pixels[index + 2] ?? 0) &&
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
