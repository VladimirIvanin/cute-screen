import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type {
  EditorDocumentV1,
  RulerLayer,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'

export async function rulerDocument(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const result = state.__cuteScreenE2eQuick?.snapshot() ?? state.__cuteScreenE2eM05?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot().document
    if (!result) throw new Error('Ruler document is not mounted')
    return result
  })
}

export async function selectLastRuler(): Promise<RulerLayer> {
  const layer = (await rulerDocument()).layers.at(-1)
  if (layer?.kind !== 'ruler') throw new Error('Expected ruler')
  const row = $(`[data-layer-id="${layer.id}"] .cs-layer-select`)
  if (!(await row.isExisting())) await $('button[aria-label="Show layers"]').click()
  await row.click()
  return layer
}

async function canvasFractions(
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const coords = await browser.execute(({ from, to }) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const view = document.querySelector('.cs-viewport')!.getBoundingClientRect()
    const left = Math.max(rect.left, view.left)
    const top = Math.max(rect.top, view.top + 30)
    const width = Math.min(rect.right, view.right) - left
    const height = Math.min(rect.bottom, view.bottom - 150) - top
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.rulerUxTrusted = String(event.isTrusted)
    }, { capture: true, once: true })
    return {
      x: Math.round(left + from[0] * width),
      y: Math.round(top + from[1] * height),
      endX: Math.round(left + to[0] * width),
      endY: Math.round(top + to[1] * height),
    }
  }, { from, to })
  await browser.waitUntil(() => browser.execute(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', coords))
  await browser.action('pointer').move({ origin: 'viewport', x: coords.x, y: coords.y }).down({ button: 'left' })
    .move({ origin: 'viewport', x: coords.endX, y: coords.endY, duration: 180 }).up({ button: 'left' }).perform()
}

export async function assertRulerLength(mode: string): Promise<void> {
  const document = await rulerDocument()
  const layer = document.layers.at(-1) as RulerLayer
  const { start, end } = layer.payload
  const length = Math.hypot((end.x - start.x) * layer.transform.scaleX, (end.y - start.y) * layer.transform.scaleY)
  const area = document.crop ?? document.canvas
  const denominator = mode === 'canvasWidth' ? area.width : mode === 'canvasHeight' ? area.height : Math.hypot(area.width, area.height)
  const value = mode === 'pixels' ? `${Math.round(length)} px` : `${Number((length / denominator * 100).toFixed(2))}%`
  const localized = await browser.execute(() => window.document.documentElement.lang === 'ru') ? value.replace('.', ',') : value
  await expect($('.cs-ruler-measure-trigger')).toHaveText(expect.stringContaining(localized))
}

export async function verifyRulerToolbar(
  prefix: string,
  cropChange = false,
): Promise<void> {
  const initial = (await rulerDocument()).layers.length
  await $('button[aria-label="Ruler"]').click()
  await waitForStableCanvas()
  await canvasFractions([.25, .35], [.65, .45])
  await browser.waitUntil(async () => (await rulerDocument()).layers.length === initial + 1)
  expect(await $('html').getAttribute('data-ruler-ux-trusted')).toBe('true')
  await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
  const created = (await rulerDocument()).layers.at(-1)
  await $('.cs-ruler-measure-trigger').click()
  for (const mode of ['canvasWidth', 'canvasHeight', 'canvasDiagonal', 'pixels', 'canvasWidth']) {
    await $(`[data-ruler-mode="${mode}"]`).click()
    const ruler = (await rulerDocument()).layers.at(-1) as RulerLayer
    expect(ruler.payload.unit).toBe(mode === 'pixels' ? 'pixels' : 'percent')
    if (mode !== 'pixels') expect(ruler.payload.percentBasis).toBe(mode)
    await assertRulerLength(mode)
  }
  await browser.keys('Escape')
  await expect($('.cs-ruler-measure-trigger')).toBeFocused()
  await $('button[aria-label="Undo"]').click()
  expect((await rulerDocument()).layers.at(-1)).toMatchObject({ payload: { unit: 'pixels' } })
  await $('button[aria-label="Redo"]').click()
  expect((await rulerDocument()).layers.at(-1)?.payload).toMatchObject({ unit: 'percent', percentBasis: 'canvasWidth' })
  expect(created?.kind).toBe('ruler')
  await browser.saveScreenshot(`${prefix}-closed.png`)
  if (!cropChange) return
  const before = await rulerDocument()
  await $('button[aria-label="Crop"]').click()
  await waitForStableCanvas()
  const corner = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return { x: Math.round(rect.left + 1), y: Math.round(rect.top + 1),
      endX: Math.round(rect.left + rect.width * .15), endY: Math.round(rect.top + rect.height * .15) }
  })
  await browser.action('pointer').move({ origin: 'viewport', x: corner.x, y: corner.y }).down({ button: 'left' })
    .move({ origin: 'viewport', x: corner.endX, y: corner.endY, duration: 180 }).up({ button: 'left' }).perform()
  await browser.saveScreenshot(`${prefix}-crop-draft.png`)
  await $('button=Apply').click()
  await browser.waitUntil(async () => JSON.stringify((await rulerDocument()).crop) !== JSON.stringify(before.crop))
  await $('button[aria-label="Select"]').click()
  await selectLastRuler()
  await assertRulerLength('canvasWidth')
  const cropped = await rulerDocument()
  await $('.cs-ruler-measure-trigger').click()
  await expect($('.cs-ruler-reference')).toHaveText(expect.stringContaining('Crop area'))
  await browser.saveScreenshot(`${prefix}-crop-menu.png`)
  await browser.keys('Escape')
  await $('button[aria-label="Undo"]').click()
  expect((await rulerDocument()).crop).toEqual(before.crop)
  expect((await rulerDocument()).layers).toEqual(before.layers)
  await $('button[aria-label="Redo"]').click()
  expect((await rulerDocument()).layers).toEqual(cropped.layers)
  await assertRulerLength('canvasWidth')
}
