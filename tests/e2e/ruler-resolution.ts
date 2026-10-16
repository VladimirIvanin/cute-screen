import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from './canvas-ready'
import { shapeDocument } from './shape-toolbar'

export async function verifyRulerResolution(prefix: string): Promise<void> {
  const hasZoomControls = await $('.cs-zoom-value').isExisting()
  if (hasZoomControls) {
    await $('.cs-zoom-value').click()
    for (let step = 0; step < 6; step += 1) await $('.cs-zoom-controls button:last-child').click()
  }
  await $('button[aria-label="Ruler"]').click()
  await waitForStableCanvas()
  const points = await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.rulerPointerTrusted = String(event.isTrusted)
      document.documentElement.dataset.rulerPointerTarget = (event.target as HTMLElement).tagName
    }, { once: true, capture: true })
    const scene = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const viewport = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
    type Snapshot = { canvas: { width: number; height: number }; crop: { width: number; height: number } | null }
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): Snapshot }
      __cuteScreenE2eM08?: { snapshot(): { document: Snapshot } }
    }
    const quick = state.__cuteScreenE2eQuick?.snapshot()
    const snapshot = quick ?? state.__cuteScreenE2eM08!.snapshot().document
    const output = quick ? snapshot.canvas : snapshot.crop ?? snapshot.canvas
    const visibleWidth = Math.min(scene.right, viewport.right) - Math.max(scene.left, viewport.left)
    const visibleHeight = Math.min(scene.bottom, viewport.bottom) - Math.max(scene.top, viewport.top)
    const left = Math.max(scene.left, viewport.left) + visibleWidth * .3
    const top = Math.max(scene.top, viewport.top) + visibleHeight * .4
    return {
      x: Math.round(left), y: Math.round(top), endX: Math.round(left + 260), endY: Math.round(top + 80),
      zoom: scene.width / output.width, width: output.width, height: output.height,
    }
  })
  const before = (await shapeDocument()).layers.length
  await browser.action('pointer').move({ origin: 'viewport', x: points.x, y: points.y })
    .down({ button: 'left' }).move({ origin: 'viewport', x: points.endX, y: points.endY, duration: 200 })
    .up({ button: 'left' }).perform()
  expect(await $('html').getAttribute('data-ruler-pointer-target')).toBe('CANVAS')
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === before + 1)
  const ruler = (await shapeDocument()).layers.at(-1)!
  expect(ruler.kind).toBe('ruler')
  const start = ruler.payload.start as { x: number; y: number }
  const end = ruler.payload.end as { x: number; y: number }
  expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(Math.hypot(260, 80) / points.zoom, 0)
  await browser.waitUntil(() => browser.execute(({ zoom, width, height }) => {
    const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const density = Math.max(1, devicePixelRatio * zoom)
    return Math.abs(scene.width - width * density) < 2 && Math.abs(scene.height - height * density) < 2
  }, points))
  expect(await $('html').getAttribute('data-ruler-pointer-trusted')).toBe('true')
  await browser.saveScreenshot(`${prefix}-angled.png`)
  if (hasZoomControls) {
    await $('.cs-zoom-value').click()
    await waitForStableCanvas()
  }
  expect((await shapeDocument()).layers.at(-1)!.payload).toEqual(ruler.payload)
  await browser.saveScreenshot(`${prefix}-100.png`)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === before)
  await $('button[aria-label="Redo"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === before + 1)
}
