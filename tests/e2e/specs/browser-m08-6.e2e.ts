import path from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import {
  transformedLayerPoint,
  baseId,
  m08Snapshot,
  m08VersionToken,
  openM08,
  canvasPoint,
  dragCanvas,
  overlayAlphaBounds,
  clickHistory,
  clickSliderProgress,
  drawPrecisionTool,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('keeps the ruler frame and badge hittable through style growth and intrinsic endpoint resize with undo/redo', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()
    await drawPrecisionTool('Ruler', 'ruler', 0)
    const created = (await m08Snapshot()).document.layers.at(-1)
    if (!created || created.kind !== 'ruler') throw new Error('expected ruler')
    await $(`[data-layer-id="${created.id}"] .cs-layer-select`).click()
    await browser.waitUntil(async () => Boolean(await overlayAlphaBounds()))
    const initialFrame = await overlayAlphaBounds()

    await clickSliderProgress('Label size', 0.95, 'm08-ruler-font-size')
    await browser.waitUntil(async () => {
      const ruler = (await m08Snapshot()).document.layers.at(-1)
      return Number(ruler?.payload.fontSize) > 14
    })
    const afterFont = (await m08Snapshot()).document.layers.at(-1)!
    const fontFrame = await overlayAlphaBounds()
    expect(
      afterFont.localBounds.width > created.localBounds.width ||
        afterFont.localBounds.height > created.localBounds.height,
    ).toBe(true)
    expect(
      (fontFrame?.width ?? 0) > (initialFrame?.width ?? 0) ||
        (fontFrame?.height ?? 0) > (initialFrame?.height ?? 0),
    ).toBe(true)

    await clickSliderProgress('Thickness', 0.95, 'm08-ruler-thickness')
    await browser.waitUntil(async () => {
      const ruler = (await m08Snapshot()).document.layers.at(-1)
      return Number(ruler?.payload.thickness) > 6
    })
    const afterThickness = (await m08Snapshot()).document.layers.at(-1)!
    expect(
      afterThickness.localBounds.width > afterFont.localBounds.width ||
        afterThickness.localBounds.height > afterFont.localBounds.height,
    ).toBe(true)

    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)?.payload).toMatchObject(
      {
        thickness: 2,
        fontSize: afterFont.payload.fontSize,
      },
    )
    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)?.localBounds).toEqual(
      created.localBounds,
    )
    await clickHistory('Redo')
    await clickHistory('Redo')
    expect((await m08Snapshot()).document.layers.at(-1)?.localBounds).toEqual(
      afterThickness.localBounds,
    )

    await $('button[aria-label="Select"]').click()
    const beforeResize = (await m08Snapshot()).document.layers.at(-1)!
    const payloadBefore = beforeResize.payload as {
      readonly start: { readonly x: number; readonly y: number }
      readonly end: { readonly x: number; readonly y: number }
      readonly thickness: number
      readonly fontSize: number
    }
    const fixedStart = transformedLayerPoint(beforeResize, payloadBefore.start)
    const resizeStart = transformedLayerPoint(beforeResize, payloadBefore.end)
    const resizeEnd = { x: resizeStart.x + 35, y: resizeStart.y + 24 }
    const versionBeforeResize = await m08VersionToken()
    await dragCanvas(resizeStart, resizeEnd, 'm08-ruler-endpoint-resize')
    await browser.waitUntil(
      async () => (await m08VersionToken()) === versionBeforeResize + 1,
    )
    expect(await m08VersionToken()).toBe(versionBeforeResize + 1)
    const afterResize = (await m08Snapshot()).document.layers.at(-1)!
    expect(afterResize.transform.scaleX).toBe(1)
    expect(afterResize.transform.scaleY).toBe(1)
    expect(afterResize.payload).toMatchObject({
      thickness: payloadBefore.thickness,
      fontSize: payloadBefore.fontSize,
    })
    const resizedFrame = await overlayAlphaBounds()
    expect(
      Math.max(resizedFrame?.width ?? 0, resizedFrame?.height ?? 0),
    ).toBeGreaterThan(50)
    expect(
      Math.min(resizedFrame?.width ?? 0, resizedFrame?.height ?? 0),
    ).toBeGreaterThan(16)

    const payloadAfter = afterResize.payload as typeof payloadBefore
    const actualEndpoints = [
      transformedLayerPoint(afterResize, payloadAfter.start),
      transformedLayerPoint(afterResize, payloadAfter.end),
    ] as const
    expect(actualEndpoints[0].x).toBeCloseTo(fixedStart.x, 5)
    expect(actualEndpoints[0].y).toBeCloseTo(fixedStart.y, 5)
    // WebDriver pointer coordinates are rounded through the zoomed CSS surface.
    expect(actualEndpoints[1].x).toBeCloseTo(resizeEnd.x, 0)
    expect(actualEndpoints[1].y).toBeCloseTo(resizeEnd.y, 0)

    await $(`[data-layer-id="${baseId}"] .cs-layer-select`).click()
    const [start, end] = actualEndpoints
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    const badgePoint = {
      x: (start.x + end.x) / 2 - ((end.y - start.y) / length) * 8,
      y: (start.y + end.y) / 2 + ((end.x - start.x) / length) * 8,
    }
    const badgeClientPoint = await canvasPoint(badgePoint.x, badgePoint.y)
    await browser
      .action('pointer', { id: 'm08-ruler-badge-hit' })
      .move({
        origin: 'viewport',
        x: badgeClientPoint.x,
        y: badgeClientPoint.y,
        duration: 0,
      })
      .down({ button: 'left' })
      .up({ button: 'left' })
      .perform()
    await expect($(`[data-layer-id="${afterResize.id}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)).toEqual(beforeResize)
    await clickHistory('Redo')
    expect((await m08Snapshot()).document.layers.at(-1)).toEqual(afterResize)
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m08-ruler-bounds-after-style.png'),
    )
  })
})
