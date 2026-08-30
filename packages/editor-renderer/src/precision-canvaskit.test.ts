import CanvasKitInit from 'canvaskit-wasm'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CanvasKitApi } from './backends/canvaskit/contracts'
import { renderHeadlessCanvasKitPng } from './backends/canvaskit/renderer'
import {
  RULER_PINK,
  calloutLoupeScene,
  censorScene,
  decodedPixels,
  expectPixelClose,
  horizontalRulerScene,
  outsideLoupeScene,
  pixel,
  rect,
  transformedHorizontalRulerScene,
} from './precision-rendering.test-kit'

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
