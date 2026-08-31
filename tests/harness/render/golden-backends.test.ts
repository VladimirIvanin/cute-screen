import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import { beforeAll, describe, expect, it } from 'vitest'
import { compareRgba, semanticParityTolerance } from './golden'
import {
  canvasKit,
  scene,
  canvas2dPngs,
  persistedArrowScene,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba, alphaBounds, assertGolden } from './golden-assertion-test-kit'

beforeAll(prepareGoldenRuntime)

describe('renderer golden harness self-test', () => {
  it('reports channel changes on a synthetic RGBA pixel', () => {
    const expected = Uint8Array.from([255, 0, 0, 255])
    const actual = Uint8Array.from([250, 0, 2, 255])

    expect(compareRgba(actual, expected)).toEqual({
      changedChannels: 2,
      maximumDelta: 5,
    })
  })

  for (const dpr of [1, 2] as const) {
    it(`matches CanvasKit and Canvas2D goldens at DPR ${dpr}`, async () => {
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, scene(dpr))
      const fallback = await canvas2dPngs(scene(dpr), dpr)
      await assertGolden(`canvaskit-dpr-${dpr}`, canvasKitPng)
      await assertGolden(`canvas2d-dpr-${dpr}`, fallback.exported)

      expect(
        compareRgba(
          await rgba(fallback.preview),
          await rgba(fallback.exported),
        ),
      ).toEqual({ changedChannels: 0, maximumDelta: 0 })

      const difference = compareRgba(
        await rgba(canvasKitPng),
        await rgba(fallback.exported),
      )
      expect(
        difference.changedChannels / (scene(dpr).width * scene(dpr).height * 4),
      ).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
      expect(difference.maximumDelta).toBeLessThanOrEqual(
        semanticParityTolerance.maximumDelta,
      )
    })
  }

  for (const dpr of [1, 2] as const) {
    it(`keeps transformed missing-image bounds aligned at DPR ${dpr}`, async () => {
      const scale = (value: number) => value * dpr
      const snapshot = createRenderSceneSnapshot({
        width: scale(128),
        height: scale(96),
        nodes: [
          {
            kind: 'image',
            id: 'flipped-base',
            resourceId: 'missing-base',
            x: scale(112),
            y: scale(12),
            width: scale(64),
            height: scale(48),
            scaleX: 1,
            scaleY: -1,
            rotation: 180,
            opacity: 0.8,
            visible: true,
          },
        ],
      })
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
      const fallback = await canvas2dPngs(snapshot, dpr)
      const canvasKitBounds = alphaBounds(
        await rgba(canvasKitPng),
        snapshot.width,
        snapshot.height,
      )
      const canvas2dBounds = alphaBounds(
        await rgba(fallback.exported),
        snapshot.width,
        snapshot.height,
      )
      expect(
        Math.abs(canvasKitBounds.left - canvas2dBounds.left),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(canvasKitBounds.top - canvas2dBounds.top),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(canvasKitBounds.right - canvas2dBounds.right),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(canvasKitBounds.bottom - canvas2dBounds.bottom),
      ).toBeLessThanOrEqual(1)
    })
  }

  for (const route of ['straight', 'quadratic', 'elbow'] as const) {
    it(`matches persisted ${route} arrow goldens for solid/dashed bodies and every endpoint`, async () => {
      const snapshot = persistedArrowScene(route)
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
      const fallback = await canvas2dPngs(snapshot, 1)

      await assertGolden(`arrow-${route}-canvaskit`, canvasKitPng)
      await assertGolden(`arrow-${route}-canvas2d`, fallback.exported)
      expect(
        compareRgba(
          await rgba(fallback.preview),
          await rgba(fallback.exported),
        ),
      ).toEqual({ changedChannels: 0, maximumDelta: 0 })

      const difference = compareRgba(
        await rgba(canvasKitPng),
        await rgba(fallback.exported),
      )
      expect(
        difference.changedChannels / (snapshot.width * snapshot.height * 4),
      ).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
      expect(difference.maximumDelta).toBeLessThanOrEqual(
        semanticParityTolerance.maximumDelta,
      )
    })
  }
})
