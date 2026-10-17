import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import type {
  EditorDocumentV1,
  LayerNode,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'

type Point = { x: number; y: number }
export async function selectionDocument(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const result = state.__cuteScreenE2eQuick?.snapshot() ?? state.__cuteScreenE2eM05?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot()?.document
    if (!result) throw new Error('Selection document is not mounted')
    return result
  })
}

async function draw(
  tool: string,
  small = false,
): Promise<LayerNode> {
  await $(`.cs-toolrail button[aria-label="${tool}"]`).click()
  await waitForStableCanvas()
  const mounted = await selectionDocument()
  const area = await browser.execute((doc) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const view = document.querySelector('.cs-viewport')!.getBoundingClientRect()
    const quick = Boolean(document.querySelector('.cs-quick-actions'))
    const output = quick ? { x: 0, y: 0, ...doc.canvas } : doc.crop ?? { x: 0, y: 0, ...doc.canvas }
    const crop = doc.crop ?? output
    const sx = rect.width / output.width
    const sy = rect.height / output.height
    const left = Math.max(rect.left + (crop.x - output.x) * sx, view.left)
    const top = Math.max(rect.top + (crop.y - output.y) * sy, view.top)
    const right = Math.min(rect.left + (crop.x + crop.width - output.x) * sx, view.right)
    const bottom = Math.min(rect.top + (crop.y + crop.height - output.y) * sy, view.bottom - 90)
    return { x: Math.round(left + Math.min(70, (right - left) * .15)),
      y: Math.round(top + Math.min(80, (bottom - top) * .2)),
      dx: Math.round(Math.min(170, (right - left) * .45)),
      dy: Math.round(Math.min(90, (bottom - top) * .35)) }
  }, mounted)
  const count = (await selectionDocument()).layers.length
  await browser.action('pointer').move({ origin: 'viewport', x: area.x, y: area.y }).down({ button: 'left' })
    .move({ origin: 'viewport', x: area.x + (small ? 12 : area.dx), y: area.y + (small ? 12 : area.dy), duration: 160 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await selectionDocument()).layers.length === count + 1)
  return (await selectionDocument()).layers.at(-1)!
}

async function screenPoint(
  layer: LayerNode,
  local: Point,
): Promise<Point> {
  const doc = await selectionDocument()
  return browser.execute(({ layer, local, doc }) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const output = document.querySelector('.cs-quick-actions')
      ? { x: 0, y: 0, ...doc.canvas }
      : doc.crop ?? { x: 0, y: 0, ...doc.canvas }
    const t = layer.transform
    const angle = t.rotation * Math.PI / 180
    const x = t.translateX + local.x * t.scaleX * Math.cos(angle) - local.y * t.scaleY * Math.sin(angle)
    const y = t.translateY + local.x * t.scaleX * Math.sin(angle) + local.y * t.scaleY * Math.cos(angle)
    return { x: rect.left + (x - output.x) * rect.width / output.width,
      y: rect.top + (y - output.y) * rect.height / output.height }
  }, { layer, local, doc })
}

async function drag(
  start: Point,
  dx: number,
  dy: number,
  cancel = false,
): Promise<void> {
  const action = browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(start.x), y: Math.round(start.y) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(start.x + dx), y: Math.round(start.y + dy), duration: 180 })
  if (cancel) {
    await action.perform(true)
    await browser.keys('Escape')
    await browser.action('pointer').up({ button: 'left' }).perform()
  } else await action.up({ button: 'left' }).perform()

}

async function undo(): Promise<void> {
  await browser.keys([Key.Control, 'z'])
}
async function redo(): Promise<void> {
  await browser.keys([Key.Control, Key.Shift, 'z'])
}

export async function verifySelectionInteractions(
  output: string,
  locale: 'en' | 'ru' = 'en',
): Promise<void> {
  await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.selectionPointerTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
    document.addEventListener('keydown', (event) => {
      document.documentElement.dataset.selectionKeyTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  console.info(`Selection interactions: ${output}`)
  const created = await draw(locale === 'ru' ? 'Стрелка' : 'Arrow')
  if (created.kind !== 'arrow') throw new Error('Arrow creation did not commit an arrow')
  await browser.keys('Escape')
  const start = await screenPoint(created, created.payload.start)
  const end = await screenPoint(created, created.payload.end)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const normal = { x: -dy / Math.hypot(dx, dy), y: dx / Math.hypot(dx, dy) }
  const modelLength = Math.hypot(
    created.payload.end.x - created.payload.start.x,
    created.payload.end.y - created.payload.start.y,
  )
  const padding = created.payload.stroke.width / 2 * Math.hypot(dx, dy) / modelLength + 4.5
  const padded = { x: (start.x + end.x) / 2 + normal.x * padding, y: (start.y + end.y) / 2 + normal.y * padding }
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(padded.x), y: Math.round(padded.y) }).perform()
  await browser.waitUntil(() => browser.execute(() => {
    return document.querySelector<HTMLElement>('.cs-canvas:not(.cs-canvas-overlay)')!.style.cursor === 'move'
  }), { timeout: 3000, timeoutMsg: 'Padded contour hover must show the move cursor' })
  await drag(padded, 2, 1)
  expect((await selectionDocument()).layers.at(-1)).toEqual(created)
  await browser.keys('Escape')
  await drag(padded, 18, 13)
  console.info('Selection contour drag completed')
  const moved = (await selectionDocument()).layers.at(-1)!
  expect(moved.payload).toEqual(created.payload)
  expect(moved.transform).not.toEqual(created.transform)
  await undo()
  expect((await selectionDocument()).layers.at(-1)).toEqual(created)
  await redo()
  expect((await selectionDocument()).layers.at(-1)).toEqual(moved)
  const b = moved.localBounds
  const gap = await screenPoint(moved, { x: b.x + b.width * .25, y: b.y + b.height * .8 })
  await drag(gap, 13, 9, true)
  expect((await selectionDocument()).layers.at(-1)).toEqual(moved)
  await drag(gap, 13, 9)
  console.info('Selection frame drag completed')
  const frameMoved = (await selectionDocument()).layers.at(-1)!
  expect(frameMoved.payload).toEqual(moved.payload)
  expect(frameMoved.transform).not.toEqual(moved.transform)
  if (frameMoved.kind !== 'arrow') throw new Error('Arrow was replaced during movement')
  const endpoint = await screenPoint(frameMoved, frameMoved.payload.start)
  await drag(endpoint, 14, -9)
  const edited = (await selectionDocument()).layers.at(-1)!
  expect(edited.payload).not.toEqual(frameMoved.payload)
  await undo()
  expect((await selectionDocument()).layers.at(-1)).toEqual(frameMoved)
  await browser.saveScreenshot(`${output}-arrow.png`)
  console.info('Selection handle and history completed')
  const small = await draw(locale === 'ru' ? 'Фигура' : 'Shape', true)
  const grip = $('.cs-selection-move-grip')
  await expect(grip).toBeDisplayed()
  expect(await grip.getSize('width')).toBe(28)
  expect(await grip.getSize('height')).toBe(28)
  const location = await grip.getLocation()
  await drag({ x: location.x + 14, y: location.y + 14 }, 15, 11)
  const smallMoved = (await selectionDocument()).layers.at(-1)!
  expect(smallMoved.payload).toEqual(small.payload)
  expect(smallMoved.transform).not.toEqual(small.transform)
  await grip.click()
  await browser.keys('ArrowRight')
  const nudged = (await selectionDocument()).layers.at(-1)!
  expect(nudged.transform.translateX).toBeCloseTo(smallMoved.transform.translateX + 1)
  await browser.saveScreenshot(`${output}-small.png`)
  expect(await $('html').getAttribute('data-selection-pointer-trusted')).toBe('true')
  expect(await $('html').getAttribute('data-selection-key-trusted')).toBe('true')
}
