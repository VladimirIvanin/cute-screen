import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'

export async function verifyRemoveAppearance(
  readDocument: () => Promise<EditorDocumentV1>,
  directory: string,
  verifyExport?: () => Promise<void>,
): Promise<void> {
  const panel = $('.cs-composition-panel')
  const remove = panel.$('[data-composition-reset]')
  const before = await readDocument()
  expect(before.presentation.composition).toBeDefined()
  const initial = await remove.getLocation()
  await browser.action('wheel').scroll({ origin: await $('.cs-composition-body').getElement(),
    x: 0, y: 0, deltaY: 2000, deltaX: 0, duration: 100 }).perform()
  expect(Math.abs((await remove.getLocation()).y - initial.y)).toBeLessThan(1)
  const geometry = await browser.execute(() => ({
    bodyBottom: document.querySelector('.cs-composition-body')!.getBoundingClientRect().bottom,
    footerTop: document.querySelector('.cs-composition-footer')!.getBoundingClientRect().top,
    footerBottom: document.querySelector('.cs-composition-footer')!.getBoundingClientRect().bottom,
    panelBottom: document.querySelector('.cs-composition-panel')!.getBoundingClientRect().bottom,
  }))
  expect(geometry.bodyBottom).toBeLessThanOrEqual(geometry.footerTop + 1)
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.panelBottom)
  await browser.saveScreenshot(`${directory}/appearance-remove-fixed.png`)
  await setNumericInput(panel.$('input[aria-label="Shadow strength"]'), '92')
  expect(await readDocument()).toEqual(before)
  await remove.click()
  await browser.waitUntil(async () => (await readDocument()).presentation.composition === undefined)
  await expect(remove).toBeDisabled()
  const off = await readDocument()
  expect(off.layers).toEqual(before.layers)
  expect(off.canvas).toEqual(before.canvas)
  expect(off.crop).toEqual(before.crop)
  const presentation = { ...before.presentation }
  delete presentation.composition
  expect(off.presentation).toEqual(presentation)
  await waitForStableCanvas()
  await browser.saveScreenshot(`${directory}/appearance-removed.png`)
  await verifyExport?.()

  // The previous selection can belong to the card; new drawing must target content.
  await $('.cs-toolrail [data-tool-id="arrow"]').click()
  await $('.cs-zoom-fit').click()
  await waitForStableCanvas()
  const canvas = await browser.execute(() =>
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  const x = Math.round(canvas.left + canvas.width * 0.3)
  const y = Math.round(canvas.top + canvas.height * 0.3)
  await browser.action('pointer').move({ origin: 'viewport', x, y }).down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(canvas.left + canvas.width * 0.5), y, duration: 150 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await readDocument()).layers.length === before.layers.length + 1)
  expect((await readDocument()).layers.at(-1)?.space ?? 'content').toBe('content')
  await $('button[aria-label="Undo"]').click()
  expect(await readDocument()).toEqual(off)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await readDocument()).presentation.composition !== undefined)
  expect(await readDocument()).toEqual(before)
  await expect(remove).toBeEnabled()
  await $('button[aria-label="Redo"]').click()
  await browser.waitUntil(async () => (await readDocument()).presentation.composition === undefined)
  await $('button[aria-label="Undo"]').click()
  await expect(remove).toBeEnabled()

  // A closed last section precedes the fixed action in the native Tab order.
  const presets = panel.$('.cs-composition-body > details:last-child')
  if (await presets.getAttribute('open') !== null) await presets.$('summary').click()
  await presets.$('summary').click()
  await presets.$('summary').click()
  await browser.keys('Tab')
  expect(await browser.execute(() => document.activeElement?.hasAttribute('data-composition-reset'))).toBe(true)
  await browser.keys('Enter')
  await browser.waitUntil(async () => (await readDocument()).presentation.composition === undefined)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await readDocument()).presentation.composition !== undefined)
  expect(await readDocument()).toEqual(before)
  await browser.action('wheel').scroll({ origin: await $('.cs-composition-body').getElement(),
    x: 0, y: 0, deltaY: -2000, deltaX: 0, duration: 100 }).perform()
}
