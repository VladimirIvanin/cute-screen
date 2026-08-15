import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import {
  createRenderSceneSnapshot,
  type RenderCensorEffect,
  type RenderNode,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'
import CanvasKitInit from 'canvaskit-wasm'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { Canvas2DRenderer, type Canvas2DLike } from './canvas2d'
import { renderHeadlessCanvasKitPng, type CanvasKitApi } from './canvaskit'
import {
  formatRulerDisplayLabel,
  rulerBadgePalette,
  rulerBadgeRotationDegrees,
  rulerWorldEndpoints,
} from './precision-rendering'

function asHtmlCanvas(canvas: Canvas): HTMLCanvasElement {
  return canvas as unknown as HTMLCanvasElement
}

async function decodedPixels(bytes: Uint8Array): Promise<
  Readonly<{
    width: number
    height: number
    data: Uint8ClampedArray
  }>
> {
  const image = await loadImage(bytes)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
  }
}

function pixel(
  decoded: Readonly<{
    width: number
    height: number
    data: Uint8ClampedArray
  }>,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * decoded.width + x) * 4
  return [
    decoded.data[offset] ?? 0,
    decoded.data[offset + 1] ?? 0,
    decoded.data[offset + 2] ?? 0,
    decoded.data[offset + 3] ?? 0,
  ]
}

function expectPixelClose(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 0,
): void {
  expect(actual).toHaveLength(expected.length)
  for (const [index, channel] of actual.entries()) {
    expect(Math.abs(channel - expected[index]!)).toBeLessThanOrEqual(tolerance)
  }
}

async function canvas2dPng(
  scene: RenderSceneSnapshot,
  options: Readonly<{
    scale?: number
    overlay?: readonly RenderNode[]
    preview?: boolean
  }> = {},
): Promise<Uint8Array> {
  const renderer = new Canvas2DRenderer({
    exportCanvas: (width, height) =>
      createCanvas(width, height) as unknown as Canvas2DLike,
  })
  const preview = createCanvas(
    scene.outputBounds.width,
    scene.outputBounds.height,
  )
  await renderer.initialize({
    scene: asHtmlCanvas(preview),
    overlay: asHtmlCanvas(
      createCanvas(scene.outputBounds.width, scene.outputBounds.height),
    ),
    dpr: 1,
    correlationId: 'm08-precision-rendering',
  })
  renderer.setScene(scene)
  renderer.setOverlay(options.overlay ?? [])
  renderer.render(['scene', 'overlay'])
  const bytes = options.preview
    ? await preview.encode('png')
    : await renderer.exportPng({ scale: options.scale ?? 1 })
  renderer.dispose()
  return bytes
}

function rect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Extract<RenderNode, { kind: 'rect' }> {
  return {
    kind: 'rect',
    id,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: {
      red: color[0],
      green: color[1],
      blue: color[2],
      alpha: color[3],
    },
  }
}

function censorScene(effect: RenderCensorEffect): RenderSceneSnapshot {
  return createRenderSceneSnapshot({
    width: 40,
    height: 24,
    nodes: [
      rect('lower-black', 0, 0, 20, 24, [0, 0, 0, 1]),
      rect('lower-white', 20, 0, 20, 24, [1, 1, 1, 1]),
      {
        kind: 'censor',
        id: 'censor',
        region: { kind: 'rectangle', x: 8, y: 4, width: 24, height: 16 },
        effect,
        sampleSource: 'compositeBelow',
        rotation: 0,
        opacity: 1,
        visible: true,
      },
      rect('higher-green', 12, 8, 4, 4, [0, 1, 0, 1]),
    ],
  })
}

const RULER_PINK = {
  red: 227 / 255,
  green: 72 / 255,
  blue: 143 / 255,
  alpha: 1,
}

function horizontalRulerScene(): RenderSceneSnapshot {
  return createRenderSceneSnapshot({
    width: 100,
    height: 60,
    nodes: [
      {
        kind: 'ruler',
        id: 'horizontal-ruler',
        x1: 12,
        y1: 30,
        x2: 88,
        y2: 30,
        length: 76,
        angleDegrees: 0,
        percent: 65.17,
        percentBasis: 'canvasDiagonal',
        unit: 'pixels',
        label: '76 px',
        color: RULER_PINK,
        thickness: 2,
        fontSize: 14,
        rotation: 0,
        opacity: 1,
        visible: true,
      },
    ],
  })
}

function transformedHorizontalRulerScene(
  transform: Readonly<{
    rotation?: number
    scaleX?: number
    scaleY?: number
  }>,
): RenderSceneSnapshot {
  const ruler = horizontalRulerScene().nodes[0]
  if (ruler?.kind !== 'ruler') throw new Error('expected ruler node')
  return createRenderSceneSnapshot({
    width: 100,
    height: 60,
    nodes: [
      {
        ...ruler,
        ...transform,
        transformOriginX: 50,
        transformOriginY: 30,
      },
    ],
  })
}

function outsideLoupeScene(shape: 'circle' | 'rectangle'): RenderSceneSnapshot {
  return createRenderSceneSnapshot({
    width: 64,
    height: 40,
    nodes: [
      rect('old-destination', 0, 0, 64, 40, [0.1, 0.1, 0.1, 1]),
      rect('source-red', 0, 4, 8, 16, [1, 0, 0, 1]),
      {
        kind: 'loupe',
        id: `outside-${shape}`,
        sourceRegion: { x: -8, y: 4, width: 16, height: 16 },
        lens: { shape, x: 28, y: 4, size: 32 },
        zoom: 2,
        border: {
          color: { red: 1, green: 1, blue: 1, alpha: 1 },
          width: 0,
        },
        shadow: null,
        sampleSource: 'compositeBelow',
        rotation: 0,
        opacity: 1,
        visible: true,
      },
    ],
  })
}

function calloutLoupeScene(shape: 'circle' | 'rectangle'): RenderSceneSnapshot {
  return createRenderSceneSnapshot({
    width: 120,
    height: 60,
    nodes: [
      rect('background', 0, 0, 120, 60, [0, 0, 0, 1]),
      {
        kind: 'loupe',
        id: `callout-${shape}`,
        sourceRegion: { x: 5, y: 25, width: 10, height: 10 },
        lens: { shape, x: 70, y: 10, size: 40 },
        zoom: 4,
        border: {
          color: { red: 1, green: 1, blue: 1, alpha: 1 },
          width: 3,
        },
        shadow: null,
        sampleSource: 'compositeBelow',
        rotation: 0,
        opacity: 1,
        visible: true,
      },
    ],
  })
}

describe('M08 Canvas2D precision renderer/export', () => {
  it('chooses an automatic contrasting badge and keeps reversed labels upright', () => {
    expect(rulerBadgePalette(RULER_PINK)).toEqual({
      background: { red: 1, green: 1, blue: 1, alpha: 0.96 },
      text: { red: 0.08, green: 0.07, blue: 0.09, alpha: 1 },
    })
    expect(rulerBadgePalette({ red: 1, green: 1, blue: 1, alpha: 1 })).toEqual({
      background: { red: 0.08, green: 0.07, blue: 0.09, alpha: 0.94 },
      text: { red: 1, green: 1, blue: 1, alpha: 1 },
    })
    expect(rulerBadgeRotationDegrees({ x1: 0, y1: 0, x2: -10, y2: 1 })).toBe(
      -5.710593137499643,
    )
    expect(rulerBadgeRotationDegrees({ x1: 0, y1: 0, x2: -10, y2: -1 })).toBe(
      5.710593137499643,
    )

    const rotated = {
      x1: 20,
      y1: 30,
      x2: 80,
      y2: 30,
      rotation: 120,
      transformOriginX: 50,
      transformOriginY: 30,
    }
    expect(rulerWorldEndpoints(rotated)).toEqual({
      start: { x: expect.closeTo(65, 10), y: expect.closeTo(4.0192378865, 10) },
      end: { x: expect.closeTo(35, 10), y: expect.closeTo(55.9807621135, 10) },
    })
    expect(rulerBadgeRotationDegrees(rotated)).toBeCloseTo(-60, 10)

    const reflected = {
      x1: 20,
      y1: 20,
      x2: 80,
      y2: 40,
      scaleX: -1,
      scaleY: 1,
      transformOriginX: 50,
      transformOriginY: 30,
    }
    expect(rulerWorldEndpoints(reflected)).toEqual({
      start: { x: 80, y: 20 },
      end: { x: 20, y: 40 },
    })
    expect(rulerBadgeRotationDegrees(reflected)).toBeCloseTo(-18.4349488229, 10)

    const verticallyReflected = { ...reflected, scaleX: 1, scaleY: -1 }
    expect(rulerWorldEndpoints(verticallyReflected)).toEqual({
      start: { x: 20, y: 40 },
      end: { x: 80, y: 20 },
    })
    expect(rulerBadgeRotationDegrees(verticallyReflected)).toBeCloseTo(
      -18.4349488229,
      10,
    )
  })

  it('crops and scales decoded export pixels without mutating scene coordinates', async () => {
    const scene = createRenderSceneSnapshot({
      width: 32,
      height: 24,
      outputBounds: { x: 8, y: 4, width: 16, height: 12 },
      nodes: [
        rect('outside', 0, 0, 32, 24, [0, 0, 1, 1]),
        rect('inside', 8, 4, 8, 12, [1, 0, 0, 1]),
      ],
    })
    const before = JSON.stringify(scene)
    const decoded = await decodedPixels(await canvas2dPng(scene, { scale: 2 }))

    expect([decoded.width, decoded.height]).toEqual([32, 24])
    expectPixelClose(pixel(decoded, 2, 2), [255, 0, 0, 255])
    expectPixelClose(pixel(decoded, 20, 2), [0, 0, 255, 255])
    expect(JSON.stringify(scene)).toBe(before)
    expect(scene.nodes[1]).toMatchObject({ x: 8, y: 4 })
  })

  it('matches a full render when crop crosses an image-space pixelate block', async () => {
    const full = createRenderSceneSnapshot({
      width: 40,
      height: 24,
      nodes: censorScene({ mode: 'pixelate', blockSize: 8 }).nodes,
    })
    const cropped = createRenderSceneSnapshot({
      width: 40,
      height: 24,
      outputBounds: { x: 11, y: 3, width: 18, height: 16 },
      nodes: full.nodes,
    })
    const fullPixels = await decodedPixels(
      await canvas2dPng(full, { scale: 2 }),
    )
    const cropPixels = await decodedPixels(
      await canvas2dPng(cropped, { scale: 2 }),
    )

    expect([cropPixels.width, cropPixels.height]).toEqual([36, 32])
    for (const point of [
      { x: 1, y: 2 },
      { x: 9, y: 8 },
      { x: 30, y: 20 },
    ]) {
      expectPixelClose(
        pixel(cropPixels, point.x, point.y),
        pixel(fullPixels, point.x + 22, point.y + 6),
      )
    }
  })

  it('renders solid censor exactly and keeps a higher layer above it', async () => {
    const decoded = await decodedPixels(
      await canvas2dPng(
        censorScene({
          mode: 'solid',
          color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
        }),
      ),
    )

    expectPixelClose(pixel(decoded, 10, 10), [26, 51, 77, 255])
    expectPixelClose(pixel(decoded, 13, 9), [0, 255, 0, 255])
    expectPixelClose(pixel(decoded, 4, 10), [0, 0, 0, 255])
  })

  it('anchors pixelate blocks in image space and preserves their size at 2x export', async () => {
    const scene = censorScene({ mode: 'pixelate', blockSize: 8 })
    const one = await decodedPixels(await canvas2dPng(scene))
    const two = await decodedPixels(await canvas2dPng(scene, { scale: 2 }))

    expectPixelClose(pixel(one, 18, 6), pixel(one, 17, 6))
    expectPixelClose(pixel(one, 22, 6), pixel(one, 17, 6))
    expectPixelClose(pixel(two, 34, 12), pixel(two, 47, 12))
    expectPixelClose(pixel(two, 26, 18), [0, 255, 0, 255])
  })

  it('blurs only the lower composite with a stable toleranced transition', async () => {
    const decoded = await decodedPixels(
      await canvas2dPng(censorScene({ mode: 'blur', strength: 4 })),
    )
    const transition = pixel(decoded, 20, 6)

    expect(transition[0]).toBeGreaterThan(40)
    expect(transition[0]).toBeLessThan(230)
    expect(Math.abs(transition[0] - transition[1])).toBeLessThanOrEqual(2)
    expectPixelClose(pixel(decoded, 13, 9), [0, 255, 0, 255])
  })

  it('renders spotlight aperture/feather and ruler endpoints plus core values', async () => {
    const scene = createRenderSceneSnapshot({
      width: 80,
      height: 48,
      nodes: [
        rect('background', 0, 0, 80, 48, [1, 1, 1, 1]),
        {
          kind: 'spotlight',
          id: 'spotlight',
          aperture: {
            shape: 'ellipse',
            x: 12,
            y: 8,
            width: 32,
            height: 24,
          },
          dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
          dimOpacity: 0.6,
          feather: 'soft',
          rotation: 0,
          opacity: 1,
          visible: true,
        },
        {
          kind: 'ruler',
          id: 'ruler',
          x1: 50,
          y1: 12,
          x2: 74,
          y2: 30,
          length: 30,
          angleDegrees: 36.86989764584402,
          percent: 32.145,
          percentBasis: 'canvasDiagonal',
          unit: 'pixels',
          label: '30 px',
          color: RULER_PINK,
          thickness: 2,
          fontSize: 14,
          rotation: 0,
          opacity: 1,
          visible: true,
        },
      ],
    })
    const decoded = await decodedPixels(await canvas2dPng(scene))

    expect(pixel(decoded, 4, 4)[0]).toBeLessThan(130)
    expect(pixel(decoded, 28, 20)[0]).toBeGreaterThan(230)
    expect(pixel(decoded, 13, 20)[0]).toBeGreaterThan(130)
    expect(pixel(decoded, 50, 12)[3]).toBe(255)
    expect(pixel(decoded, 74, 30)[3]).toBe(255)
    const ruler = scene.nodes[2]
    if (ruler?.kind !== 'ruler') throw new Error('expected ruler node')
    expect(formatRulerDisplayLabel(ruler)).toBe('30 px')
  })

  it.each([1, 2] as const)(
    'renders a pink horizontal ruler with perpendicular ticks, no endpoint dots and an overlapping badge at scale %i',
    async (scale) => {
      const decoded = await decodedPixels(
        await canvas2dPng(horizontalRulerScene(), { scale }),
      )
      const at = (x: number, y: number) =>
        pixel(decoded, Math.round(x * scale), Math.round(y * scale))

      expectPixelClose(at(20, 30), [227, 72, 143, 255], 2)
      expectPixelClose(at(12, 25), [227, 72, 143, 255], 8)
      expect(at(9, 30)[3]).toBe(0)
      expect(at(50, 30).slice(0, 3)).not.toEqual([227, 72, 143])
    },
  )

  it.each([
    ['rotation 180°', { rotation: 180 }],
    ['horizontal reflection', { scaleX: -1 }],
    ['vertical reflection', { scaleY: -1 }],
  ] as const)(
    'keeps the ruler badge pixels world-upright after %s',
    async (_label, transform) => {
      const baseline = await decodedPixels(
        await canvas2dPng(horizontalRulerScene()),
      )
      const transformed = await decodedPixels(
        await canvas2dPng(transformedHorizontalRulerScene(transform)),
      )
      expect(Array.from(transformed.data)).toEqual(Array.from(baseline.data))
    },
  )

  it.each([
    ['circle', 1],
    ['circle', 2],
    ['rectangle', 1],
    ['rectangle', 2],
  ] as const)(
    'clears old destination pixels for a partially outside %s loupe at scale %i',
    async (shape, scale) => {
      const decoded = await decodedPixels(
        await canvas2dPng(outsideLoupeScene(shape), { scale }),
      )
      expectPixelClose(pixel(decoded, 32 * scale, 20 * scale), [0, 0, 0, 0])
      expectPixelClose(
        pixel(decoded, 52 * scale, 20 * scale),
        [255, 0, 0, 255],
        2,
      )
      if (scale === 1) {
        const preview = await decodedPixels(
          await canvas2dPng(outsideLoupeScene(shape), { preview: true }),
        )
        expectPixelClose(pixel(preview, 32, 20), [0, 0, 0, 0])
        expectPixelClose(pixel(preview, 52, 20), [255, 0, 0, 255], 2)
      }
    },
  )

  it.each([
    ['circle', 1],
    ['circle', 2],
    ['rectangle', 1],
    ['rectangle', 2],
  ] as const)(
    'renders a %s loupe callout connector at export scale %i',
    async (shape, scale) => {
      const decoded = await decodedPixels(
        await canvas2dPng(calloutLoupeScene(shape), { scale }),
      )
      expectPixelClose(
        pixel(decoded, 40 * scale, 30 * scale),
        [255, 255, 255, 255],
        3,
      )
    },
  )

  it('samples loupe below only, clips the lens, and excludes overlay from export', async () => {
    const scene = createRenderSceneSnapshot({
      width: 64,
      height: 40,
      nodes: [
        rect('background', 0, 0, 64, 40, [0.1, 0.1, 0.1, 1]),
        rect('source-red', 0, 8, 8, 16, [1, 0, 0, 1]),
        rect('source-blue', 8, 8, 8, 16, [0, 0, 1, 1]),
        {
          kind: 'loupe',
          id: 'loupe',
          sourceRegion: { x: -4, y: 8, width: 20, height: 20 },
          lens: { shape: 'circle', x: 28, y: 8, size: 40 },
          zoom: 2,
          border: {
            color: { red: 1, green: 1, blue: 1, alpha: 1 },
            width: 2,
          },
          shadow: {
            color: { red: 0, green: 0, blue: 0, alpha: 0.6 },
            offsetX: 2,
            offsetY: 3,
            blur: 3,
          },
          sampleSource: 'compositeBelow',
          rotation: 0,
          opacity: 1,
          visible: true,
        },
        rect('higher-yellow-source', 0, 8, 16, 16, [1, 1, 0, 1]),
        rect('higher-green-lens', 46, 18, 4, 4, [0, 1, 0, 1]),
      ],
    })
    const decoded = await decodedPixels(
      await canvas2dPng(scene, {
        overlay: [rect('selection-overlay', 32, 12, 8, 8, [1, 0, 1, 1])],
      }),
    )

    expectPixelClose(pixel(decoded, 38, 20), [255, 0, 0, 255], 2)
    expectPixelClose(pixel(decoded, 54, 20), [0, 0, 255, 255], 2)
    expectPixelClose(pixel(decoded, 47, 19), [0, 255, 0, 255])
    // The source sample at this in-lens point is outside the canvas. The lens
    // replaces the old destination with transparent black.
    expectPixelClose(pixel(decoded, 30, 28), [0, 0, 0, 0])
    expect(pixel(decoded, 34, 14)).not.toEqual([255, 0, 255, 255])
    expect(pixel(decoded, 48, 7)[3]).toBeGreaterThan(0)
  })
})

describe('M08 CanvasKit precision renderer/export', () => {
  let canvasKit: CanvasKitApi

  beforeAll(async () => {
    canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as CanvasKitApi
  })

  it('renders exact solid censor pixels before a higher CanvasKit layer', async () => {
    const decoded = await decodedPixels(
      renderHeadlessCanvasKitPng(
        canvasKit,
        censorScene({
          mode: 'solid',
          color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
        }),
      ),
    )

    expectPixelClose(pixel(decoded, 10, 10), [26, 51, 77, 255], 1)
    expectPixelClose(pixel(decoded, 13, 9), [0, 255, 0, 255], 1)
  })

  it.each([
    ['rotation 180°', { rotation: 180 }],
    ['horizontal reflection', { scaleX: -1 }],
    ['vertical reflection', { scaleY: -1 }],
  ] as const)(
    'keeps the ruler badge pixels world-upright after %s',
    async (_label, transform) => {
      const baseline = await decodedPixels(
        renderHeadlessCanvasKitPng(canvasKit, horizontalRulerScene()),
      )
      const transformed = await decodedPixels(
        renderHeadlessCanvasKitPng(
          canvasKit,
          transformedHorizontalRulerScene(transform),
        ),
      )
      expect(Array.from(transformed.data)).toEqual(Array.from(baseline.data))
    },
  )

  it.each([
    ['circle', 1],
    ['circle', 2],
    ['rectangle', 1],
    ['rectangle', 2],
  ] as const)(
    'clears old destination pixels for a partially outside %s loupe at scale %i',
    async (shape, scale) => {
      const decoded = await decodedPixels(
        renderHeadlessCanvasKitPng(canvasKit, outsideLoupeScene(shape), [], {
          scale,
        }),
      )
      expectPixelClose(pixel(decoded, 32 * scale, 20 * scale), [0, 0, 0, 0])
      expectPixelClose(
        pixel(decoded, 52 * scale, 20 * scale),
        [255, 0, 0, 255],
        3,
      )
    },
  )

  it.each([
    ['circle', 1],
    ['circle', 2],
    ['rectangle', 1],
    ['rectangle', 2],
  ] as const)(
    'renders a %s loupe callout connector at export scale %i',
    async (shape, scale) => {
      const decoded = await decodedPixels(
        renderHeadlessCanvasKitPng(canvasKit, calloutLoupeScene(shape), [], {
          scale,
        }),
      )
      expectPixelClose(
        pixel(decoded, 40 * scale, 30 * scale),
        [255, 255, 255, 255],
        4,
      )
    },
  )

  it('consumes censor/spotlight/ruler/loupe nodes with crop and below-layer order', async () => {
    const scene = createRenderSceneSnapshot({
      width: 64,
      height: 40,
      outputBounds: { x: 4, y: 4, width: 56, height: 32 },
      nodes: [
        rect('background', 0, 0, 64, 40, [0.1, 0.1, 0.1, 1]),
        rect('source-red', 4, 8, 8, 16, [1, 0, 0, 1]),
        rect('source-blue', 12, 8, 8, 16, [0, 0, 1, 1]),
        {
          kind: 'censor',
          id: 'censor',
          region: { kind: 'rectangle', x: 4, y: 8, width: 16, height: 16 },
          effect: { mode: 'pixelate', blockSize: 4 },
          sampleSource: 'compositeBelow',
          rotation: 0,
          opacity: 1,
          visible: true,
        },
        {
          kind: 'loupe',
          id: 'loupe',
          sourceRegion: { x: 4, y: 8, width: 16, height: 16 },
          lens: { shape: 'rectangle', x: 32, y: 8, size: 32 },
          zoom: 2,
          border: {
            color: { red: 1, green: 1, blue: 1, alpha: 1 },
            width: 2,
          },
          shadow: null,
          sampleSource: 'compositeBelow',
          rotation: 0,
          opacity: 1,
          visible: true,
        },
        {
          kind: 'spotlight',
          id: 'spotlight',
          aperture: {
            shape: 'diamond',
            x: 28,
            y: 6,
            width: 36,
            height: 36,
          },
          dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
          dimOpacity: 0.25,
          feather: null,
          rotation: 0,
          opacity: 1,
          visible: true,
        },
        {
          kind: 'ruler',
          id: 'ruler',
          x1: 24,
          y1: 4,
          x2: 52,
          y2: 4,
          length: 28,
          angleDegrees: 0,
          percent: 37.1,
          percentBasis: 'canvasDiagonal',
          unit: 'percent',
          label: '37.1%',
          color: RULER_PINK,
          thickness: 3,
          fontSize: 16,
          rotation: 0,
          opacity: 1,
          visible: true,
        },
        rect('higher-yellow-source', 4, 8, 16, 16, [1, 1, 0, 1]),
        rect('higher-green-lens', 44, 16, 4, 4, [0, 1, 0, 1]),
      ],
    })
    const png = renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale: 2 })
    const decoded = await decodedPixels(png)

    expect([decoded.width, decoded.height]).toEqual([112, 64])
    // This point is outside the later spotlight diamond, so the red loupe
    // sample is dimmed by 25% after proving the lower-only sample boundary.
    expectPixelClose(pixel(decoded, 62, 24), [191, 0, 0, 255], 15)
    expectPixelClose(pixel(decoded, 94, 24), [0, 0, 255, 255], 12)
    expectPixelClose(pixel(decoded, 82, 26), [0, 255, 0, 255], 2)
    expect(pixel(decoded, 40, 0)[3]).toBeGreaterThan(0)
  })
})
