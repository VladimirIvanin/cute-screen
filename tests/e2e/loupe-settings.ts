import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'

export async function verifyLoupeSettings(output: string): Promise<void> {
  await waitForStableCanvas()
  await browser.execute(() => {
    document.addEventListener('contextmenu', (event) => {
      document.documentElement.dataset.loupeContextTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
    document.addEventListener('keydown', (event) => {
      document.documentElement.dataset.loupeKeyTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await $('.cs-toolrail button[aria-label="Loupe"]').click({ button: 'right' })
  await $('.cs-tool-configure-popover-host [data-loupe-control="loupeZoom"]').click()
  await setNumericInput($('[role="dialog"] input[aria-label="Zoom"]'), '4')
  await browser.keys('Enter')
  await browser.keys('Escape')
  await $('.cs-tool-configure-popover-host [data-loupe-control="loupeSize"]').click()
  await setNumericInput($('[role="dialog"] input[aria-label="Size"]'), '64')
  await browser.keys('Enter')
  await browser.keys('Escape')
  await browser.keys('Escape')
  await $('.cs-tool-configure-popover-host').waitForExist({ reverse: true })
  await waitForShapeAnimation()
  await waitForStableCanvas()
  const count = (await shapeDocument()).layers.length
  const c = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): {
        canvas: { width: number; height: number }
        crop: { x: number; y: number; width: number; height: number } | null
      } }
    }
    const quick = state.__cuteScreenE2eQuick?.snapshot()
    const crop = quick?.crop
    return {
      x: rect.x + (crop && quick ? crop.x / quick.canvas.width * rect.width : 0),
      y: rect.y + (crop && quick ? crop.y / quick.canvas.height * rect.height : 0),
      w: crop && quick ? crop.width / quick.canvas.width * rect.width : rect.width,
      h: crop && quick ? crop.height / quick.canvas.height * rect.height : rect.height,
    }
  })
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(c.x + c.w * .25), y: Math.round(c.y + c.h * .45) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(c.x + c.w * .6), y: Math.round(c.y + c.h * .5), duration: 180 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === count + 1)
  await expect($('.cs-selection-floating-toolbar .cs-loupe-toolbar')).toBeDisplayed()
  const loupe = async () => (await shapeDocument()).layers.at(-1)!
  expect((await loupe()).payload.zoom).toBe(4)
  await $('[data-loupe-control="loupeZoom"]').click()
  await setNumericInput($('[role="dialog"] input[aria-label="Zoom"]'), '12')
  await browser.keys('Escape')
  expect((await loupe()).payload.zoom).toBe(4)
  await expect($('[data-loupe-control="loupeZoom"]')).toBeFocused()
  await $('[data-loupe-control="loupeSize"]').click()
  await setNumericInput($('[role="dialog"] input[aria-label="Size"]'), '48')
  await browser.keys('Enter')
  await browser.keys('Escape')
  expect((await loupe()).payload.lens).toMatchObject({ size: 48 })
  await $('[data-loupe-control="loupeShape"]').click()
  await $('.cs-loupe-popover').$('button=Rectangle').click()
  expect((await loupe()).payload.lens).toMatchObject({ shape: 'rectangle' })
  await $('[data-loupe-control="loupeBorderWidth"]').click()
  await setNumericInput($('[role="dialog"] input[aria-label="Border width"]'), '4')
  await browser.keys('Enter')
  await $('.cs-loupe-popover button[aria-label="Red"]').click()
  await $('.cs-loupe-popover').$('button=Shadow').click()
  expect((await loupe()).payload.border).toMatchObject({ width: 4, color: { red: 1 } })
  await browser.saveScreenshot(`${output}-border.png`)
  await browser.keys('Escape')
  const shadow = (await loupe()).payload.shadow
  await browser.keys(['Control', 'z'])
  expect((await loupe()).payload.shadow).not.toEqual(shadow)
  await browser.keys(['Control', 'Shift', 'z'])
  expect((await loupe()).payload.shadow).toEqual(shadow)
  await browser.saveScreenshot(`${output}-compact.png`)
  expect(await $('html').getAttribute('data-loupe-context-trusted')).toBe('true')
  expect(await $('html').getAttribute('data-loupe-key-trusted')).toBe('true')
  await $('.cs-toolrail button[aria-label="Spotlight"]').click()
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(c.x + c.w * .15), y: Math.round(c.y + c.h * .15) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(c.x + c.w * .35), y: Math.round(c.y + c.h * .32), duration: 180 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === count + 2)
  for (const [x, y, kind] of [
    [.6, .5, 'loupe'],
    [.25, .23, 'spotlight'],
    [.6, .5, 'loupe'],
    [.25, .23, 'spotlight'],
  ] as const) {
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(c.x + c.w * x), y: Math.round(c.y + c.h * y) })
      .down({ button: 'left' }).up({ button: 'left' }).perform()
    await expect($(`.cs-selection-floating-toolbar [data-tool-settings="${kind}"]`)).toBeDisplayed()
    await browser.saveScreenshot(`${output}-selected-${kind}.png`)
  }
  await $('.cs-selection-floating-toolbar button[aria-label="Dimming"]').click()
  await setNumericInput($('[role="dialog"] input[aria-label="Dimming"]'), '80')
  await browser.keys('Enter')
  await browser.keys('Escape')
  expect((await shapeDocument()).layers.at(-1)!.payload.dimOpacity).toBe(.8)
  expect((await shapeDocument()).layers.at(-2)!.payload.zoom).toBe(4)
  // Keep the loupe selected for the shared layout matrix.
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(c.x + c.w * .6), y: Math.round(c.y + c.h * .5) })
    .down({ button: 'left' }).up({ button: 'left' }).perform()
  await expect($('.cs-selection-floating-toolbar .cs-loupe-toolbar')).toBeDisplayed()
}
