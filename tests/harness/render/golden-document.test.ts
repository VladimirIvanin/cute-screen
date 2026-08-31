import { loadImage } from '@napi-rs/canvas'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compareRgba, semanticParityTolerance } from './golden'
import {
  canvasKit,
  canvasKitFonts,
  canvas2dPngs,
  precisionScene,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  curvedStartCapRepairScene,
  persistedRichTextScene,
} from './golden-document-test-kit'
import { rgba, assertGolden } from './golden-assertion-test-kit'

beforeAll(prepareGoldenRuntime)

describe('renderer golden harness self-test', () => {
  it('matches the repaired curved left solid-cap golden', async () => {
    const snapshot = curvedStartCapRepairScene()
    const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
    const fallback = await canvas2dPngs(snapshot, 1)

    await assertGolden(
      'arrow-quadratic-start-cap-repair-canvaskit',
      canvasKitPng,
    )
    await assertGolden(
      'arrow-quadratic-start-cap-repair-canvas2d',
      fallback.exported,
    )
    expect(
      compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)),
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

  it('matches v7 rich-text layout goldens across Text, Callout and Numbered Marker', async () => {
    const snapshot = persistedRichTextScene()
    const canvasKitPng = renderHeadlessCanvasKitPng(
      canvasKit,
      snapshot,
      canvasKitFonts,
    )
    const fallback = await canvas2dPngs(snapshot, 1)

    await assertGolden('rich-text-v7-canvaskit', canvasKitPng)
    await assertGolden('rich-text-v7-canvas2d', fallback.exported)
    expect(
      compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)),
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

  for (const exportScale of [1, 2] as const) {
    it(`matches cropped M08 precision goldens at export scale ${exportScale}`, async () => {
      const snapshot = precisionScene()
      const canvasKitPng = renderHeadlessCanvasKitPng(
        canvasKit,
        snapshot,
        canvasKitFonts,
        { scale: exportScale },
      )
      const fallback = await canvas2dPngs(snapshot, 1, exportScale)
      await assertGolden(
        `precision-m08-scale-${exportScale}-canvaskit`,
        canvasKitPng,
      )
      await assertGolden(
        `precision-m08-scale-${exportScale}-canvas2d`,
        fallback.exported,
      )

      const outputPixels =
        Math.round(snapshot.outputBounds.width * exportScale) *
        Math.round(snapshot.outputBounds.height * exportScale)
      const difference = compareRgba(
        await rgba(canvasKitPng),
        await rgba(fallback.exported),
        24,
      )
      // Canvas2D uses a deterministic box blur while CanvasKit uses its
      // Gaussian image filter. Solid areas and sampling order are asserted by
      // focused pixel tests; this broader visual comparison allows their edge
      // kernels and native ruler glyph rasterizers to differ honestly.
      expect(difference.changedChannels / (outputPixels * 4)).toBeLessThan(0.09)
      expect(difference.maximumDelta).toBeLessThanOrEqual(
        semanticParityTolerance.maximumDelta,
      )
    })
  }

  it('rejects the deterministic corrupted PNG fixture', async () => {
    await expect(
      loadImage(path.resolve('tests/fixtures/generated/corrupted.png')),
    ).rejects.toThrow()
  })
})
