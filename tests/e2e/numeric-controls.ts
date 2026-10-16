import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { setNumericInput } from './numeric-input'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'

async function sceneChecksum(): Promise<number> {
  return browser.execute(() => {
    const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const context = scene.getContext('2d')
    if (!context) throw new Error('Numeric preview evidence requires the Canvas2D scene')
    const pixels = context.getImageData(0, 0, scene.width, scene.height).data
    let hash = 2166136261
    for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
    return hash >>> 0
  })
}

/** Runs after a filled shape is selected, through real pointer and keyboard input. */
export async function verifyNumericOpacity(
  directory: string,
  prefix: string,
): Promise<void> {
  const trigger = $('.cs-selection-floating-toolbar [data-shape-control="appearance"]')
  await trigger.click()
  await waitForShapeAnimation()
  const before = await shapeDocument()
  const originalPixels = await sceneChecksum()
  const zoom = await $('.cs-zoom-controls').isExisting()
    ? await $('.cs-zoom-controls').getAttribute('data-zoom')
    : undefined
  const points = await browser.execute(() => {
    const rail = document.querySelector('.cs-shape-popover .n-slider-rail')!.getBoundingClientRect()
    const handle = document.querySelector('.cs-shape-popover [role="slider"]')!.getBoundingClientRect()
    return {
      x: Math.round(handle.left + handle.width / 2),
      y: Math.round(handle.top + handle.height / 2),
      end: Math.round(rail.left + rail.width * 0.35),
    }
  })
  await browser.action('pointer').move({ origin: 'viewport', x: points.x, y: points.y }).down({ button: 'left' }).move({ origin: 'viewport', x: points.end, y: points.y, duration: 160 }).perform(true)
  await browser.waitUntil(async () => await sceneChecksum() !== originalPixels)
  expect(await shapeDocument()).toEqual(before)
  const previewPixels = await sceneChecksum()
  await browser.saveScreenshot(path.resolve(directory, `${prefix}-opacity-preview.png`))
  await browser.action('pointer').up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.opacity !== before.layers.at(-1)!.opacity)
  expect(await sceneChecksum()).toBe(previewPixels)
  await browser.keys('Escape')
  await $('button[aria-label="Undo"]').click()
  expect(await shapeDocument()).toEqual(before)
  await $('button[aria-label="Redo"]').click()
  const committed = await shapeDocument()
  await trigger.click()
  const input = $('.cs-shape-popover input[aria-label="Opacity"]')
  await setNumericInput(input, '12')
  await browser.waitUntil(async () => await sceneChecksum() !== previewPixels)
  expect(await shapeDocument()).toEqual(committed)
  await browser.keys('Escape')
  await browser.waitUntil(async () => await sceneChecksum() === previewPixels)
  expect(await shapeDocument()).toEqual(committed)
  if (zoom !== undefined) expect(await $('.cs-zoom-controls').getAttribute('data-zoom')).toBe(zoom)
  await $('button[aria-label="Undo"]').click()
  expect(await shapeDocument()).toEqual(before)
}
