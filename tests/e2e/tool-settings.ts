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
import { setNumericInput } from './numeric-input'
async function enterNumber(
  selector: string,
  value: string,
): Promise<void> {
  await setNumericInput($(selector), value)
  await browser.keys('Enter')
}
async function drag(
  x: number,
  y: number,
  endX: number,
  endY: number,
): Promise<void> {
  await browser.action('pointer').move({
    origin: 'viewport', x: Math.round(x), y: Math.round(y),
  }).down({
    button: 'left',
  }).move({
    origin: 'viewport', x: Math.round(endX), y: Math.round(endY), duration: 180,
  }).up({
    button: 'left',
  }).perform()
}
async function bounds() {
  await waitForStableCanvas()
  return browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): {
        canvas: { width: number; height: number }
        crop: { x: number; y: number; width: number; height: number } | null
      } | undefined }
    }
    const quick = state.__cuteScreenE2eQuick?.snapshot()
    if (quick?.crop) {
      return {
        x: rect.left + rect.width * quick.crop.x / quick.canvas.width,
        y: rect.top + rect.height * quick.crop.y / quick.canvas.height,
        w: rect.width * quick.crop.width / quick.canvas.width,
        h: rect.height * quick.crop.height / quick.canvas.height,
      }
    }
    return {
      x: rect.left, y: rect.top, w: rect.width, h: rect.height,
    }
  })
}
async function tool(name: string): Promise<void> {
  await $(`.cs-toolrail button[aria-label="${name}"]`).click()
}
async function verifyRulerLabelSize(
  output: string,
  prefix: string,
): Promise<void> {
  await $('button[aria-label="Label and units"]').click()
  const labelSize = $('.cs-tool-settings-popover input[aria-label="Label size"]')
  await setNumericInput(labelSize, '16')
  await browser.keys('Enter')
  await $('.cs-tool-settings-popover button[aria-label="Label size +"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.fontSize).toBe(17)
  await $('.cs-tool-settings-popover button[aria-label="Label size −"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.fontSize).toBe(16)
  await setNumericInput(labelSize, '24')
  await browser.keys('Escape')
  expect((await shapeDocument()).layers.at(-1)!.payload.fontSize).toBe(16)
  await $('button[aria-label="Label and units"]').click()
  await browser.saveScreenshot(path.resolve(output, `${prefix}-numeric-label.png`))
}
export async function verifyToolSettings(
  output: string,
  prefix: string,
): Promise<void> {
  await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.toolSettingsPointerTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
    document.addEventListener('keydown', (event) => {
      document.documentElement.dataset.toolSettingsKeyTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await tool('Pencil')
  const c = await bounds()
  const count = (await shapeDocument()).layers.length
  await drag(c.x + c.w * .12, c.y + c.h * .3, c.x + c.w * .3, c.y + c.h * .4)
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === count + 1)
  expect((await shapeDocument()).layers.at(-1)!.kind).toBe('pencil')
  await expect($('[data-tool-settings="pencil"]')).toExist()
  await $('.cs-toolrail button[aria-label="Pencil"]').click({ button: 'right' })
  await expect($('[data-tool-settings="pencil"]')).toBeDisplayed()
  await $('button[aria-label="Correction"]').click()
  await enterNumber('[role="dialog"] input[aria-label="Correction"]', '75')
  await browser.keys('Escape')
  await $('button[aria-label="Brush and width"]').click()
  await $('[role="dialog"] button[aria-label="Expressive brush"]').click()
  await enterNumber('[role="dialog"] input[aria-label="Width"]', '6')
  await browser.keys('Escape')
  await drag(c.x + c.w * .12, c.y + c.h * .45, c.x + c.w * .3, c.y + c.h * .5)
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === count + 2)
  expect((await shapeDocument()).layers.at(-1)!.payload).toMatchObject({
    brush: 'brush', width: 6, smoothing: .35,
  })
  await tool('Spotlight')
  await drag(c.x + c.w * .32, c.y + c.h * .22, c.x + c.w * .5, c.y + c.h * .42)
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.kind === 'spotlight')
  await expect($('.cs-selection-floating-toolbar [data-tool-settings="spotlight"]')).toBeDisplayed()
  await $('button[aria-label="Apertures"]').click()
  await $('[data-settings-action="spotlightAdd"]').click()
  await drag(c.x + c.w * .55, c.y + c.h * .22, c.x + c.w * .72, c.y + c.h * .42)
  const apertures = () => shapeDocument().then((doc) => doc.layers.at(-1)!.payload.apertures as {
    id: string
    shape: string
    bounds: {
      x: number
      y: number
      width: number
      height: number
    }
  }[])
  await browser.waitUntil(async () => (await apertures()).length === 2)
  const original = await apertures()
  await $('button[aria-label="Aperture shape"]').click()
  await $('[role="dialog"] button[aria-label="Ellipse"]').click()
  expect((await apertures())[0]!.shape).toBe('rectangle')
  expect((await apertures())[1]!.shape).toBe('ellipse')
  await waitForShapeAnimation()
  await drag(c.x + c.w * .63, c.y + c.h * .32, c.x + c.w * .67, c.y + c.h * .36)
  await browser.waitUntil(async () => (await apertures())[1]!.bounds.x !== original[1]!.bounds.x)
  const moved = await apertures()
  await drag(c.x + c.w * .76, c.y + c.h * .46, c.x + c.w * .8, c.y + c.h * .49)
  await browser.waitUntil(async () => (await apertures())[1]!.bounds.width > moved[1]!.bounds.width)
  await browser.keys('Escape')
  await browser.saveScreenshot(path.resolve(output, `${prefix}-spotlight.png`))
  await $('button[aria-label="Apertures"]').click()
  await $('.cs-tool-settings-regions button[data-aperture-id]:nth-child(2)').click()
  // Choosing an aperture closes the nested panel; Delete edits that aperture.
  await browser.keys('Delete')
  await browser.waitUntil(async () => (await apertures()).length === 1)
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => (await apertures()).length === 2)
  await tool('Ruler')
  await drag(c.x + c.w * .3, c.y + c.h * .55, c.x + c.w * .65, c.y + c.h * .6)
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.kind === 'ruler')
  await $('button[aria-label="Measurement and snapping"]').click()
  await expect($('.cs-tool-measurement output')).toHaveText(expect.stringContaining('px'))
  await $('[data-settings-action="rulerCopyLength"]').click()
  if (output.includes('tauri')) await expect($('.cs-eyedropper-feedback')).toHaveText(expect.stringContaining('Copied:'))
  else await expect($('.cs-tool-error')).toHaveText(expect.stringContaining('Could not copy measurement'))
  await browser.saveScreenshot(path.resolve(output, `${prefix}-ruler.png`))
  await browser.keys('Escape')
  await $('button[aria-label="Thickness"]').click()
  await enterNumber('[role="dialog"] input[aria-label="Thickness"]', '4')
  expect((await shapeDocument()).layers.at(-1)!.payload.thickness).toBe(4)
  await browser.keys('Escape')
  await verifyRulerLabelSize(output, prefix)
  const beforeSnap = (await shapeDocument()).layers.at(-1)!
  await browser.keys('Escape')
  for (const [startX, startY, nextX, nextY] of [
    [.65, .6, .68, .7],
    [.3, .55, .25, .5],
  ]) {
    await browser.performActions([
      { type: 'key', id: 'ruler-alt', actions: [
        { type: 'keyDown', value: '\uE00A' }, { type: 'pause', duration: 0 },
        { type: 'pause', duration: 180 }, { type: 'pause', duration: 0 }, { type: 'keyUp', value: '\uE00A' },
      ] },
      { type: 'pointer', id: 'ruler-endpoint', parameters: { pointerType: 'mouse' }, actions: [
        { type: 'pointerMove', origin: 'viewport', x: Math.round(c.x + c.w * startX!), y: Math.round(c.y + c.h * startY!) },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', origin: 'viewport', x: Math.round(c.x + c.w * nextX!), y: Math.round(c.y + c.h * nextY!), duration: 180 },
        { type: 'pointerUp', button: 0 }, { type: 'pause', duration: 0 },
      ] },
    ])
    await browser.releaseActions()
    const after = (await shapeDocument()).layers.at(-1)!
    const start = after.payload.start as { x: number; y: number }
    const end = after.payload.end as { x: number; y: number }
    const steps = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI / 15
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(.001)
    expect(after.payload.thickness).toBe(beforeSnap.payload.thickness)
  }
  expect(await $('html').getAttribute('data-tool-settings-pointer-trusted')).toBe('true')
  expect(await $('html').getAttribute('data-tool-settings-key-trusted')).toBe('true')
}
