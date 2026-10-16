import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from './canvas-ready'
import { shapeDocument } from './shape-toolbar'

type Point = { x: number; y: number }
async function layerSnapshot() {
  return { layers: (await shapeDocument()).layers }
}
async function pixel(point: Point): Promise<number[]> {
  return browser.execute(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const rect = canvas.getBoundingClientRect()
    return [...canvas.getContext('2d')!.getImageData(
      Math.floor((x - rect.left) * canvas.width / rect.width),
      Math.floor((y - rect.top) * canvas.height / rect.height), 1, 1,
    ).data]
  }, point)
}
async function move(point: Point): Promise<void> {
  await browser.action('pointer', { id: 'spotlight-pointer' }).move({ origin: 'viewport', ...point, duration: 180 }).perform(true)
}
async function hold(point: Point): Promise<void> {
  await browser.action('pointer', { id: 'spotlight-pointer' }).move({ origin: 'viewport', ...point }).down({ button: 'left' }).perform(true)
}
async function release(): Promise<void> {
  await browser.action('pointer', { id: 'spotlight-pointer' }).up({ button: 'left' }).perform()
  await browser.releaseActions()
}
function brightness(rgba: number[]): number {
  return rgba[0]! + rgba[1]! + rgba[2]!
}
async function expectDimmed(
  point: Point,
  original: number[],
): Promise<void> {
  await browser.waitUntil(async () => brightness(await pixel(point)) < brightness(original) * .75, {
    timeoutMsg: `Spotlight did not dim canvas at ${JSON.stringify(point)}`,
  })
}
export async function verifySpotlightPreview(prefix: string): Promise<void> {
  await $('button[aria-label="Spotlight"]').click()
  await waitForStableCanvas()
  const area = await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.spotlightPointerTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
    const scene = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const viewport = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
    const left = Math.max(scene.left, viewport.left)
    const top = Math.max(scene.top, viewport.top)
    const width = Math.min(scene.right, viewport.right) - left
    const height = Math.min(scene.bottom, viewport.bottom) - top
    return { left, top, width, height }
  })
  const at = (
    x: number,
    y: number,
  ) => ({
    x: Math.round(area.left + area.width * x),
    y: Math.round(area.top + area.height * y),
  })
  const points = { start: at(.2, .4), end: at(.4, .7), center: at(.3, .55), moved: at(.65, .55), outside: at(.8, .8) }
  const initial = await layerSnapshot()
  const outside = await pixel(points.outside)
  const center = await pixel(points.center)
  const moved = await pixel(points.moved)
  await hold(points.start)
  await expect($('html')).toHaveAttribute('data-spotlight-pointer-trusted', 'true')
  await move(points.end)
  await expectDimmed(points.outside, outside)
  expect(await pixel(points.center)).toEqual(center)
  expect(await layerSnapshot()).toEqual(initial)
  await browser.saveScreenshot(`${prefix}-creating.png`)
  await release()
  await browser.waitUntil(async () => (await layerSnapshot()).layers.length === initial.layers.length + 1)
  await expect($('.cs-selection-floating-toolbar [data-tool-settings="spotlight"]')).toBeDisplayed()
  const created = await layerSnapshot()
  await hold(points.center)
  await move(points.moved)
  await expectDimmed(points.center, center)
  expect(await pixel(points.moved)).toEqual(moved)
  expect(await layerSnapshot()).toEqual(created)
  await browser.saveScreenshot(`${prefix}-moving.png`)
  await release()
  await browser.waitUntil(async () => JSON.stringify(await layerSnapshot()) !== JSON.stringify(created))
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => JSON.stringify(await layerSnapshot()) === JSON.stringify(created))
  await expectDimmed(points.moved, moved)
  await browser.keys(['Control', 'Shift', 'z'])
  await browser.waitUntil(async () => JSON.stringify(await layerSnapshot()) !== JSON.stringify(created))
  expect(await pixel(points.moved)).toEqual(moved)
  // The same drag in aperture-editing mode must also redraw before commit.
  await browser.action('pointer', { id: 'spotlight-pointer' }).move({ origin: 'viewport', ...points.moved })
    .down({ button: 'left' }).up({ button: 'left' })
    .down({ button: 'left' }).up({ button: 'left' }).perform()
  const beforeCancel = await layerSnapshot()
  await hold(points.moved)
  await move(points.center)
  await expectDimmed(points.moved, moved)
  expect(await pixel(points.center)).toEqual(center)
  await browser.keys('Escape')
  await release()
  expect(await layerSnapshot()).toEqual(beforeCancel)
  expect(await pixel(points.moved)).toEqual(moved)
  await browser.saveScreenshot(`${prefix}-cancelled.png`)
  // Leave a clean background for the next surface's verification.
  await browser.keys(['Control', 'z'])
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => (await layerSnapshot()).layers.length === initial.layers.length)
}
