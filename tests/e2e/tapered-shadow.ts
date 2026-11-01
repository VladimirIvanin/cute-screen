import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { shapeDocument } from './shape-toolbar'
import { drawingDefaultsHost } from './hand-drawn'
import { waitForStableCanvas } from './canvas-ready'
import { verifyTaperedInteractions } from './tapered-interactions'

type Layer = Awaited<ReturnType<typeof shapeDocument>>['layers'][number] & { annotationShadow?: string }
export async function shadowLayers(): Promise<Layer[]> {
  return (await shapeDocument()).layers as Layer[]
}

async function chooseShadow(
  host: string,
  name: 'Soft' | 'Strong' | 'No shadow',
): Promise<void> {
  await $(`${host} .cs-annotation-shadow-trigger`).click()
  const popup = $('.cs-annotation-shadow-popup')
  await popup.waitForDisplayed()
  await popup.$(`button=${name}`).click()
  await popup.waitForExist({ reverse: true })
}

export async function verifyTaperedShadow(directory: string): Promise<void> {
  await $('button[aria-label="Arrow"]').click()
  const defaults = await drawingDefaultsHost()
  await $(`${defaults} [data-control="stroke"] button`).click()
  await $('.cs-arrow-toolbar-popover').$('button=Tapered').click()
  await chooseShadow(defaults, 'Soft')
  if (await $('.cs-tool-configure-popover-host').isDisplayed()) await browser.keys('Escape')
  await browser.action('pointer').move({ origin: 'viewport', x: 12, y: 12 }).perform()
  await waitForStableCanvas()
  const bounds = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  const before = (await shadowLayers()).length
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(bounds.left + bounds.width * .22), y: Math.round(bounds.top + bounds.height * .65) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(bounds.left + bounds.width * .64), y: Math.round(bounds.top + bounds.height * .3), duration: 250 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shadowLayers()).length === before + 1)
  const arrow = (await shadowLayers()).at(-1)!
  expect(arrow).toMatchObject({ kind: 'arrow', annotationShadow: 'soft', payload: { appearance: 'tapered' } })
  const selection = '.cs-selection-floating-toolbar'
  await chooseShadow(selection, 'Strong')
  await browser.waitUntil(async () => (await shadowLayers()).at(-1)!.annotationShadow === 'strong')
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await shadowLayers()).at(-1)!.annotationShadow === 'soft')
  await $('button[aria-label="Redo"]').click()
  await browser.waitUntil(async () => (await shadowLayers()).at(-1)!.annotationShadow === 'strong')
  await $(`${selection} [data-control="arrowPath"] button`).click()
  await $('.cs-arrow-toolbar-popover button[aria-label="Curved"]').click()
  await browser.waitUntil(async () => (await shadowLayers()).at(-1)!.payload.path === 'quadratic')
  await $(`${selection} .cs-annotation-shadow-trigger`).click()
  await $('.cs-annotation-shadow-popup').waitForDisplayed()
  await browser.keys('ArrowRight')
  await browser.keys('Escape')
  await expect($('.cs-annotation-shadow-popup')).not.toExist()
  expect(await browser.execute(() => document.activeElement?.classList.contains('cs-annotation-shadow-trigger'))).toBe(true)
  await $(`${selection} .cs-annotation-shadow-trigger`).click()
  const geometry = await browser.execute(() => {
    const object = document.querySelector<HTMLElement>('.cs-selection-floating-toolbar')!
    const popup = document.querySelector<HTMLElement>('.cs-annotation-shadow-popup')!
    const p = popup.getBoundingClientRect(), t = object.getBoundingClientRect()
    return { popup: p.toJSON(), toolbar: t.toJSON(),
      fits: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight,
      overlapsToolbar: p.left < t.right && p.right > t.left && p.top < t.bottom && p.bottom > t.top }
  })
  expect(geometry.fits).toBe(true)
  expect(geometry.overlapsToolbar).toBe(false)
  await browser.saveScreenshot(`${directory}/tapered-shadow-popup.png`)
  await browser.keys('Escape')
  await verifyTaperedInteractions(directory)
  await browser.saveScreenshot(`${directory}/tapered-shadow-arrow.png`)
  await writeFile(`${directory}/tapered-shadow-geometry.json`, JSON.stringify(geometry, null, 2))
  await writeFile(`${directory}/tapered-shadow-document.json`, JSON.stringify(await shapeDocument(), null, 2))
}
