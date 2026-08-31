import path from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  baseId,
  m08Snapshot,
  openM08,
  chooseOption,
  dragCanvas,
  overlayStats,
  clickHistory,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('crops from canvas dimensions after a user-resized and deleted base layer and across flips', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    const mounted = await m08Snapshot()
    expect(mounted.document.canvas).toEqual({ width: 400, height: 300 })
    expect(mounted.decodedSource).toEqual({ width: 400, height: 300 })

    await $('button[aria-label="Show layers"]').click()
    const baseRow = $(`[data-layer-id="${baseId}"]`)
    await baseRow.$('button[aria-label="Unlock layer"]').click()
    await baseRow.$('.cs-layer-select').click()
    await dragCanvas({ x: 399, y: 299 }, { x: 300, y: 225 }, 'm08-base-resize')
    await browser.waitUntil(async () => {
      const base = (await m08Snapshot()).document.layers.find(
        (layer) => layer.id === baseId,
      )
      return Boolean(base && base.transform.scaleX < 0.9)
    })
    expect((await m08Snapshot()).document.canvas).toEqual({
      width: 400,
      height: 300,
    })

    const cropTool = $('button[aria-label="Crop"]')
    await cropTool.click()
    await expect(cropTool).toHaveAttribute('aria-pressed', 'true')
    expect(
      await browser.execute(() =>
        document.activeElement?.getAttribute('aria-label'),
      ),
    ).toBe('Scene canvas')
    const full = await overlayStats()
    expect(full.whitePixels).toBeGreaterThan(50)
    expect(full.dimPixels).toBe(0)

    await chooseOption('Preset', '1:1')
    const square = await overlayStats()
    expect(square.dimPixels).toBeGreaterThan(10_000)
    expect(square.whiteBounds?.minX).toBeGreaterThanOrEqual(44)
    expect(square.whiteBounds?.maxX).toBeLessThanOrEqual(356)

    await $('button=Reset').click()
    await chooseOption('Preset', '4:3')
    expect((await overlayStats()).dimPixels).toBe(0)
    await $('button=Reset').click()
    await chooseOption('Preset', 'Original')
    expect((await overlayStats()).dimPixels).toBe(0)
    await $('button=Reset').click()
    await chooseOption('Preset', '16:9')
    const widescreen = await overlayStats()
    expect(widescreen.dimPixels).toBeGreaterThan(20_000)
    expect(widescreen.whiteBounds?.minY).toBeGreaterThanOrEqual(31)
    expect(widescreen.whiteBounds?.maxY).toBeLessThanOrEqual(269)

    await chooseOption('Preset', '1:1')
    await dragCanvas(
      { x: 350, y: 150 },
      { x: 320, y: 150 },
      'm08-crop-east-handle',
    )
    expect((await overlayStats()).dimPixels).toBeGreaterThan(square.dimPixels)
    await $('button=Reset').click()
    expect((await overlayStats()).dimPixels).toBe(0)
    await chooseOption('Preset', '16:9')
    await browser.keys('Escape')
    expect((await m08Snapshot()).document.crop).toBeNull()
    await expect($('button[aria-label="Select"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await cropTool.click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await browser.waitUntil(async () =>
      Boolean((await m08Snapshot()).document.crop),
    )
    expect((await m08Snapshot()).document.crop).toEqual({
      x: 60,
      y: 0,
      width: 300,
      height: 300,
    })
    await clickHistory('Undo')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop === null,
    )

    const restoredBaseRow = $(`[data-layer-id="${baseId}"]`)
    if (!(await restoredBaseRow.isExisting())) {
      await $('button[aria-label="Show layers"]').click()
    }
    await $(`[data-layer-id="${baseId}"]`).$('.cs-layer-select').click()
    await browser.keys('Delete')
    await browser.waitUntil(async () =>
      (await m08Snapshot()).document.layers.every(
        (layer) => layer.id !== baseId,
      ),
    )
    expect((await m08Snapshot()).document.canvas).toEqual({
      width: 400,
      height: 300,
    })

    await $('button[aria-label="Select"]').click()
    await $('button=Flip vertically').click()
    await cropTool.click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await $('button=Apply').click()
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 60,
    )
    await $('button[aria-label="Select"]').click()
    await $('button=Flip horizontally').click()
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 40,
    )
    await clickHistory('Undo')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 60,
    )
    await clickHistory('Redo')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 40,
    )
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m08-crop-resized-deleted-base.png'),
    )
  })
})
