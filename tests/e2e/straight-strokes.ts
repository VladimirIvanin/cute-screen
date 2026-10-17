import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'

type Sample = { x: number; y: number; pressure: number }

export async function verifyStraightStrokes(
  directory: string,
  prefix: string,
): Promise<void> {
  const initial = (await shapeDocument()).layers.length
  let cancelOrigin = { x: 0, y: 0 }
  for (const [index, brush] of ['marker', 'pen', 'stabilized', 'brush'].entries()) {
    const label = brush === 'marker' ? 'Highlighter' : 'Pencil'
    await $(`.cs-toolrail button[aria-label="${label}"]`).click()
    if (brush !== 'marker') {
      const quickSettings = $('.cs-quick-settings-button')
      const collapsed = await quickSettings.isDisplayed()
      if (collapsed) await quickSettings.click()
      const settingsHost = collapsed ? '.cs-tool-configure-popover-host' : '.cs-tool-defaults-toolbar'
      await $(`${settingsHost} button[aria-label="Brush and width"]`).click()
      const name = brush === 'pen' ? 'Exact pen' : brush === 'stabilized' ? 'Autocorrection' : 'Expressive brush'
      await $(`.cs-brush-choices button[aria-label="${name}"]`).click()
      await browser.keys('Escape')
      if (collapsed) await browser.keys('Escape')
    }
    await waitForShapeAnimation()
    await waitForStableCanvas()
    const origin = await browser.execute((row) => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const rect = canvas.getBoundingClientRect()
      const viewport = document.querySelector('.cs-viewport')!.getBoundingClientRect()
      const left = Math.max(rect.left, viewport.left, 0)
      const top = Math.max(rect.top, viewport.top + 60, 0)
      const right = Math.min(rect.right, viewport.right, innerWidth)
      const bottom = Math.min(rect.bottom, viewport.bottom - 130, innerHeight - 130)
      document.addEventListener('pointerdown', (event) => {
        if (event.target === canvas) document.documentElement.dataset.straightInputTrusted = String(event.isTrusted)
      }, { once: true, capture: true })
      return { x: Math.round(left + (right - left) * .15),
        y: Math.round(top + (bottom - top) * (.25 + row * .12)) }
    }, index)
    cancelOrigin = origin
    const shift = index % 2 ? '\uE050' : '\uE008'
    await browser.performActions([
      { type: 'pointer', id: 'straight-pen', parameters: { pointerType: 'mouse' }, actions: [
        { type: 'pointerMove', origin: 'viewport', x: origin.x, y: origin.y, duration: 0 },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', origin: 'viewport', x: origin.x + 25, y: origin.y + 8, duration: 80 },
        { type: 'pause', duration: 0 },
        { type: 'pointerMove', origin: 'viewport', x: origin.x + 80, y: origin.y + 11, duration: 80 },
        { type: 'pointerMove', origin: 'viewport', x: origin.x + 130, y: origin.y + 15, duration: 80 },
        { type: 'pause', duration: 0 },
        { type: 'pointerMove', origin: 'viewport', x: origin.x + 150, y: origin.y + 35, duration: 80 },
        { type: 'pointerUp', button: 0 },
      ] },
      { type: 'key', id: 'straight-keyboard', actions: [
        index === 1 ? { type: 'keyDown', value: shift } : { type: 'pause', duration: 0 },
        { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
        index === 1 ? { type: 'pause', duration: 0 } : { type: 'keyDown', value: shift }, { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
        { type: 'keyUp', value: shift }, { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
      ] },
    ])
    await browser.releaseActions()
    await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + index + 1,
      { timeoutMsg: `${brush} stroke did not commit at ${origin.x},${origin.y}` })
    const layer = (await shapeDocument()).layers.at(-1)!
    const points = layer.payload.points as Sample[]
    if (brush !== 'marker') {
      expect(layer.payload).toMatchObject({ brush, strokeVersion: 3 })
      const ranges = layer.payload.straightSegments as { start: number; end: number }[]
      expect(ranges).toHaveLength(1)
      const range = ranges[0]!
      if (index === 1) expect(range.start).toBe(0)
      else expect(range.start).toBeGreaterThan(0)
      expect(range.end).toBeLessThan(points.length - 1)
      expect(points.slice(range.start, range.end + 1)
        .every((p) => Math.abs(p.y - points[range.start]!.y) < 1e-8)).toBe(true)
    } else {
      expect(layer.kind).toBe('marker')
      expect(layer.payload.strokeVersion).toBeUndefined()
      // The suffix resumes freely after a horizontal section.
      expect(points.filter((p) => Math.abs(p.y - points[1]!.y) < 1e-8).length).toBeGreaterThan(2)
    }
    expect(points.at(-1)!.y).toBeGreaterThan(points.at(-2)!.y)
    await expect($(`.cs-toolrail button[aria-label="${label}"]`)).toHaveAttribute('aria-pressed', 'true')
    expect(await $('html').getAttribute('data-straight-input-trusted')).toBe('true')
  }
  const before = await shapeDocument()
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + 3)
  await $('button[aria-label="Redo"]').click()
  expect(await shapeDocument()).toEqual(before)
  await browser.performActions([
    { type: 'pointer', id: 'straight-pen', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', origin: 'viewport', x: cancelOrigin.x, y: cancelOrigin.y, duration: 0 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', origin: 'viewport', x: cancelOrigin.x + 50, y: cancelOrigin.y + 4, duration: 100 },
      { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
      { type: 'pointerUp', button: 0 },
    ] },
    { type: 'key', id: 'straight-keyboard', actions: [
      { type: 'keyDown', value: '\uE008' }, { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
      { type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' },
      { type: 'keyUp', value: '\uE008' },
    ] },
  ])
  await browser.releaseActions()
  expect(await shapeDocument()).toEqual(before)
  await browser.saveScreenshot(path.resolve(directory, `${prefix}.png`))
}
