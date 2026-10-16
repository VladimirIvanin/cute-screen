import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type {
  EditorDocumentV1,
  RulerLayer,
  Point,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'

async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const document = state.__cuteScreenE2eM05?.snapshot() ?? state.__cuteScreenE2eM08?.snapshot().document
    if (!document) throw new Error('Ruler document is not mounted')
    return document
  })
}

function endpoints(layer: RulerLayer): readonly Point[] {
  const t = layer.transform
  const angle = t.rotation * Math.PI / 180
  return [layer.payload.start, layer.payload.end].map((point) => ({
    x: t.translateX + point.x * t.scaleX * Math.cos(angle) - point.y * t.scaleY * Math.sin(angle),
    y: t.translateY + point.x * t.scaleX * Math.sin(angle) + point.y * t.scaleY * Math.cos(angle),
  }))
}

async function client(point: Point): Promise<Point> {
  const current = await snapshot()
  const output = current.crop ?? { x: 0, y: 0, ...current.canvas }
  return browser.execute(({ point, output }) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return {
      x: Math.round(rect.left + (point.x - output.x) / output.width * rect.width),
      y: Math.round(rect.top + (point.y - output.y) / output.height * rect.height),
    }
  }, { point, output })
}

async function drag(
  from: Point,
  to: Point,
  hold = false,
): Promise<void> {
  await waitForStableCanvas()
  const start = await client(from)
  const end = await client(to)
  await browser.waitUntil(() => browser.execute(({ x, y }) =>
    document.elementFromPoint(x, y)?.tagName === 'CANVAS', start), {
    timeoutMsg: 'Canvas drag start is obscured by a floating control',
  })
  const action = browser.action('pointer', { id: 'ruler-bounds' })
    .move({ origin: 'viewport', ...start }).down({ button: 'left' })
    .move({ origin: 'viewport', ...end, duration: 180 })
  if (hold) await action.perform(true)
  else await action.up({ button: 'left' }).perform()
}

async function release(): Promise<void> {
  await browser.action('pointer', { id: 'ruler-bounds' }).up({ button: 'left' }).perform()
  await browser.releaseActions()
}

function lastRuler(document: EditorDocumentV1): RulerLayer {
  const layer = document.layers.at(-1)
  if (layer?.kind !== 'ruler') throw new Error('Expected last layer to be a ruler')
  return layer
}

export async function verifyRulerBounds(prefix: string): Promise<void> {
  if (await $('.cs-zoom-value').isExisting()) await $('.cs-zoom-value').click()
  await $('button[aria-label="Ruler"]').click()
  await waitForStableCanvas()
  await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.rulerBoundsTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
    document.addEventListener('pointermove', (event) => {
      if (event.buttons) {
        document.documentElement.dataset.rulerBoundsMove = JSON.stringify({ x: event.clientX, y: event.clientY })
      }
    }, { capture: true })
  })
  const initial = await snapshot()
  await drag({ x: 20, y: 70 }, { x: 350, y: 70 })
  await browser.waitUntil(async () => (await snapshot()).layers.length === initial.layers.length + 1)
  expect(await $('html').getAttribute('data-ruler-bounds-trusted')).toBe('true')
  await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
  const created = lastRuler(await snapshot())
  const length = endpoints(created)[1]!.x - endpoints(created)[0]!.x
  await drag({ x: 185, y: 70 }, { x: 460, y: -40 }, true)
  expect((await snapshot()).layers.at(-1)).toEqual(created)
  await browser.saveScreenshot(`${prefix}-moving.png`)
  console.log('ruler pointer observation', await $('html').getAttribute('data-ruler-bounds-move'))
  await release()
  await browser.waitUntil(async () => JSON.stringify((await snapshot()).layers.at(-1)) !== JSON.stringify(created))
  const moved = lastRuler(await snapshot())
  const [start, end] = endpoints(moved)
  expect(end!.x).toBeCloseTo(400, 5)
  expect(start!.y).toBeCloseTo(created.payload.fontSize / 2 + 4, 5)
  expect(end!.x - start!.x).toBeCloseTo(length, 5)
  await $('button[aria-label="Undo"]').click()
  expect((await snapshot()).layers.at(-1)).toEqual(created)
  await drag(endpoints(created)[1]!, { x: 460, y: 340 })
  const resized = lastRuler(await snapshot())
  expect(endpoints(resized)[0]!.x).toBeCloseTo(endpoints(created)[0]!.x, 5)
  expect(endpoints(resized)[1]!.x).toBeCloseTo(400, 5)
  expect(endpoints(resized)[1]!.y).toBeCloseTo(300, 5)
  await browser.saveScreenshot(`${prefix}-endpoint.png`)
  await $('button[aria-label="Undo"]').click()
  expect((await snapshot()).layers.at(-1)).toEqual(created)
  await drag({ x: 185, y: 70 }, { x: -40, y: 340 }, true)
  await browser.keys('Escape')
  await release()
  expect((await snapshot()).layers.at(-1)).toEqual(created)
  await $('button[aria-label="Crop"]').click()
  await expect($('button[aria-label="Crop"]')).toHaveAttribute('aria-pressed', 'true')
  await waitForStableCanvas()
  await drag({ x: 1, y: 1 }, { x: 180, y: 120 })
  await browser.saveScreenshot(`${prefix}-crop-draft.png`)
  await expect($('button[aria-label="Crop"]')).toHaveAttribute('aria-pressed', 'true')
  await $('button=Apply').click()
  await browser.waitUntil(async () => (await snapshot()).crop !== null)
  await $('button[aria-label="Select"]').click()
  await waitForStableCanvas()
  const cropped = await snapshot()
  const crop = cropped.crop!
  const fitted = lastRuler(cropped)
  for (const point of endpoints(fitted)) {
    expect(point.x).toBeGreaterThanOrEqual(crop.x - 1e-6)
    expect(point.x).toBeLessThanOrEqual(crop.x + crop.width + 1e-6)
    expect(point.y).toBeGreaterThanOrEqual(crop.y - 1e-6)
    expect(point.y).toBeLessThanOrEqual(crop.y + crop.height + 1e-6)
  }
  expect(endpoints(fitted)[1]!.x - endpoints(fitted)[0]!.x).toBeCloseTo(crop.width, 4)
  expect(fitted.payload.thickness).toBe(created.payload.thickness)
  expect(fitted.payload.fontSize).toBe(created.payload.fontSize)
  await browser.saveScreenshot(`${prefix}-cropped.png`)
  await $('button[aria-label="Undo"]').click()
  expect((await snapshot()).crop).toBeNull()
  expect((await snapshot()).layers.at(-1)).toEqual(created)
  await $('button[aria-label="Redo"]').click()
  expect((await snapshot()).crop).toEqual(crop)
  expect((await snapshot()).layers.at(-1)).toEqual(fitted)
  await browser.saveScreenshot(`${prefix}-redo.png`)
}
