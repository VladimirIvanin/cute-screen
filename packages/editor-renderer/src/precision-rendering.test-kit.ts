import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import {
  createRenderSceneSnapshot,
  type RenderCensorEffect,
  type RenderNode,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'
import { expect } from 'vitest'
import type { Canvas2DLike } from './backends/canvas2d/contracts'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'

export function asHtmlCanvas(canvas: Canvas): HTMLCanvasElement {
  return canvas as unknown as HTMLCanvasElement
}

export async function decodedPixels(bytes: Uint8Array): Promise<
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

export function pixel(
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

export function expectPixelClose(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 0,
): void {
  expect(actual).toHaveLength(expected.length)
  for (const [index, channel] of actual.entries()) {
    expect(Math.abs(channel - expected[index]!)).toBeLessThanOrEqual(tolerance)
  }
}

export async function canvas2dPng(
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

export function rect(
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

export function censorScene(effect: RenderCensorEffect): RenderSceneSnapshot {
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

export const RULER_PINK = {
  red: 227 / 255,
  green: 72 / 255,
  blue: 143 / 255,
  alpha: 1,
}

export function horizontalRulerScene(): RenderSceneSnapshot {
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

export function transformedHorizontalRulerScene(
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

export function outsideLoupeScene(
  shape: 'circle' | 'rectangle',
): RenderSceneSnapshot {
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

export function calloutLoupeScene(
  shape: 'circle' | 'rectangle',
): RenderSceneSnapshot {
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
