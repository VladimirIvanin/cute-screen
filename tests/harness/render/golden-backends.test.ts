import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  compareRgba,
  semanticParityTolerance,
} from './golden'
import {
  canvasKit,
  scene,
  canvas2dPngs,
  persistedArrowScene,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  rgba,
  alphaBounds,
  assertGolden,
} from './golden-assertion-test-kit'

beforeAll(prepareGoldenRuntime)

describe('renderer golden harness self-test', () => {
  it('matches highlighter blends on light, dark and mixed backgrounds across both backends', async () => {
    const nodes: import('@cute-screen/editor-core').RenderNode[] = []
    for (let column = 0; column < 3; column += 1) {
      const x = column * 140
      const dark = column === 1
      nodes.push({ kind: 'rect', id: `background-${column}`, x, y: 0, width: 140, height: 100, rotation: 0, opacity: 1, visible: true, fill: dark ? { red: 0.09, green: 0.1, blue: 0.11, alpha: 1 } : { red: 1, green: 1, blue: 1, alpha: 1 } })
      for (let stripe = 0; stripe < 5; stripe += 1) {
        nodes.push({ kind: 'rect', id: `text-${column}-${stripe}`, x: x + 18 + stripe * 20, y: 28, width: 8, height: 16, rotation: 0, opacity: 1, visible: true, fill: dark ? { red: 1, green: 1, blue: 1, alpha: 1 } : { red: 0, green: 0, blue: 0, alpha: 1 } })
      }
      nodes.push({ kind: 'path', id: `marker-${column}`, points: [{ x: x + 12, y: 36 }, { x: x + 125, y: 36 }, { x: x + 40, y: 65 }, { x: x + 100, y: 65 }], rotation: 0, opacity: 0.35, visible: true, blendMode: column === 0 ? 'multiply' : dark ? 'screen' : 'normal', stroke: { red: 1, green: 0.835, blue: 0.29, alpha: 1 }, strokeWidth: 18, lineCap: 'round', lineJoin: 'round' })
    }
    const snapshot = createRenderSceneSnapshot({ width: 420, height: 100, nodes })
    const skia = renderHeadlessCanvasKitPng(canvasKit, snapshot)
    const fallback = await canvas2dPngs(snapshot, 1)
    await assertGolden('highlighter-canvaskit', skia)
    await assertGolden('highlighter-canvas2d', fallback.exported)
    expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)))
      .toEqual({ changedChannels: 0, maximumDelta: 0 })
    const difference = compareRgba(await rgba(skia), await rgba(fallback.exported))
    expect(difference.changedChannels / (420 * 100 * 4))
      .toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
  })
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

      expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported))).toEqual({
        changedChannels: 0,
        maximumDelta: 0,
      })

      const difference = compareRgba(await rgba(canvasKitPng), await rgba(fallback.exported))
      expect(difference.changedChannels / (scene(dpr).width * scene(dpr).height * 4)).toBeLessThanOrEqual(
        semanticParityTolerance.maximumChangedChannelRatio,
      )
      expect(difference.maximumDelta).toBeLessThanOrEqual(semanticParityTolerance.maximumDelta)
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
      const canvasKitBounds = alphaBounds(await rgba(canvasKitPng), snapshot.width, snapshot.height)
      const canvas2dBounds = alphaBounds(await rgba(fallback.exported), snapshot.width, snapshot.height)
      expect(Math.abs(canvasKitBounds.left - canvas2dBounds.left)).toBeLessThanOrEqual(1)
      expect(Math.abs(canvasKitBounds.top - canvas2dBounds.top)).toBeLessThanOrEqual(1)
      expect(Math.abs(canvasKitBounds.right - canvas2dBounds.right)).toBeLessThanOrEqual(1)
      expect(Math.abs(canvasKitBounds.bottom - canvas2dBounds.bottom)).toBeLessThanOrEqual(1)
    })
  }

  for (const route of ['straight', 'quadratic', 'elbow'] as const) {
    it(`matches persisted ${route} arrow goldens for solid/dashed bodies and every endpoint`, async () => {
      const snapshot = persistedArrowScene(route)
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
      const fallback = await canvas2dPngs(snapshot, 1)

      await assertGolden(`arrow-${route}-canvaskit`, canvasKitPng)
      await assertGolden(`arrow-${route}-canvas2d`, fallback.exported)
      expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported))).toEqual({
        changedChannels: 0,
        maximumDelta: 0,
      })

      const difference = compareRgba(await rgba(canvasKitPng), await rgba(fallback.exported))
      expect(difference.changedChannels / (snapshot.width * snapshot.height * 4)).toBeLessThanOrEqual(
        semanticParityTolerance.maximumChangedChannelRatio,
      )
      expect(difference.maximumDelta).toBeLessThanOrEqual(semanticParityTolerance.maximumDelta)
    })
  }
})
