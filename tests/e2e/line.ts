import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type {
  EditorDocumentV1,
  ArrowLayer,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'

export async function lineDocument(): Promise<EditorDocumentV1> {
  const read = () => browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 | undefined }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 | undefined }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } | undefined }
    }
    return state.__cuteScreenE2eQuick?.snapshot() ?? state.__cuteScreenE2eM05?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot()?.document
  })
  let result = await read()
  if (!result) await browser.waitUntil(async () => Boolean(result = await read()),
    { timeoutMsg: 'Line document did not finish the production mount flow' })
  if (!result) throw new Error('Line workspace is not ready')
  return result
}

export async function lineOrigin() {
  const scene = await lineDocument()
  return browser.execute(({ canvas, crop }) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const viewport = document.querySelector('.cs-viewport')!.getBoundingClientRect()
    const quick = Boolean((window as typeof window & { __cuteScreenE2eQuick?: unknown }).__cuteScreenE2eQuick)
    const bounds = crop ?? { x: 0, y: 0, ...canvas }
    const output = quick ? { x: 0, y: 0, ...canvas } : bounds
    const left = Math.max(rect.left + (bounds.x - output.x) / output.width * rect.width, viewport.left, 0)
    const top = Math.max(rect.top + (bounds.y - output.y) / output.height * rect.height, viewport.top, 0)
    const right = Math.min(rect.left + (bounds.x + bounds.width - output.x) / output.width * rect.width,
      viewport.right, innerWidth)
    const bottom = Math.min(rect.top + (bounds.y + bounds.height - output.y) / output.height * rect.height,
      viewport.bottom, innerHeight - 180)
    return { x: Math.round(left + (right - left) * .18), y: Math.round(top + (bottom - top) * .45) }
  }, { canvas: scene.canvas, crop: scene.crop })
}

export async function lineDrag(
  x: number,
  y: number,
  dx: number,
  dy: number,
  shift = false,
): Promise<void> {
  await browser.waitUntil(() => browser.execute(({ x, y }) =>
    document.elementFromPoint(x, y)?.matches('.cs-canvas') === true, { x, y }),
  { timeoutMsg: 'Line gesture start is covered by chrome' })
  await browser.performActions([
    { type: 'pointer', id: 'line-pointer', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', origin: 'viewport', x, y, duration: 0 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', origin: 'viewport', x: x + dx, y: y + dy, duration: 150 },
      { type: 'pointerUp', button: 0 },
    ] },
    { type: 'key', id: 'line-keys', actions: [
      shift ? { type: 'keyDown', value: '\uE008' } : { type: 'pause', duration: 0 },
      { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
      shift ? { type: 'keyUp', value: '\uE008' } : { type: 'pause', duration: 0 },
    ] },
  ])
  await browser.releaseActions()
}

export async function lineDefaultsHost(): Promise<string> {
  const collapsed = await $('.cs-quick-settings-button').isDisplayed()
  if (collapsed) await $('.cs-quick-settings-button').click()
  return collapsed ? '.cs-tool-configure-popover-host' : '.cs-tool-defaults-toolbar'
}

export async function verifyLine(prefix: string): Promise<void> {
  const initial = (await lineDocument()).layers.length
  await $('.cs-toolrail [data-tool-id="line"]').click()
  await waitForStableCanvas()
  await browser.execute(() => {
    document.documentElement.dataset.lineTrusted = ''
    document.addEventListener('pointerdown', (event) => {
      if ((event.target as Element)?.matches('.cs-canvas')) document.documentElement.dataset.lineTrusted = String(event.isTrusted)
    }, { capture: true })
  })
  const host = await lineDefaultsHost()
  const alignment = $(`${host} [data-control="autoAlignAxes"]`)
  if (await alignment.getAttribute('aria-pressed') !== 'true') await alignment.click()
  await $(`${host} [data-control="stroke"] button`).click()
  await setNumericInput($('input[aria-label="Thickness"]'), '6')
  await browser.keys('Enter')
  await browser.keys('Escape')
  if (host.includes('popover')) await browser.keys('Escape')
  await waitForStableCanvas()
  const origin = await lineOrigin()
  await lineDrag(origin.x, origin.y, 140, 4)
  await lineDrag(origin.x + 190, origin.y, 3, 95)
  await lineDrag(origin.x + 260, origin.y, 95, 60, true)
  await browser.waitUntil(async () => (await lineDocument()).layers.length === initial + 3)
  const lines = (await lineDocument()).layers.slice(-3) as ArrowLayer[]
  for (const layer of lines) expect(layer.payload).toMatchObject({ annotationTool: 'line', path: 'straight', startCap: 'none', endCap: 'none', stroke: { width: 6 } })
  expect(lines[0]!.payload.start.y).toBeCloseTo(lines[0]!.payload.end.y, 8)
  expect(lines[1]!.payload.start.x).toBeCloseTo(lines[1]!.payload.end.x, 8)
  expect(lines[2]!.payload.end.x - lines[2]!.payload.start.x).toBeCloseTo(
    lines[2]!.payload.end.y - lines[2]!.payload.start.y,
    8,
  )
  await expect($('.cs-toolrail [data-tool-id="line"]')).toHaveAttribute('aria-pressed', 'true')
  expect(await $('html').getAttribute('data-line-trusted')).toBe('true')
  await lineDrag(origin.x, origin.y + 70, 2, 0)
  expect((await lineDocument()).layers.length).toBe(initial + 3)
  const before = await lineDocument()
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await lineDocument()).layers.length === initial + 2)
  await $('button[aria-label="Redo"]').click()
  expect((await lineDocument()).layers).toEqual(before.layers)
  // Escape must cancel before Quick's terminal Close handler, even with canvas focus.
  await browser.performActions([
    { type: 'pointer', id: 'line-pointer', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', origin: 'viewport', x: origin.x, y: origin.y + 100, duration: 0 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', origin: 'viewport', x: origin.x + 90, y: origin.y + 102, duration: 100 },
      { type: 'pause', duration: 0 }, { type: 'pointerUp', button: 0 },
    ] },
    { type: 'key', id: 'line-keys', actions: [
      { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 }, { type: 'pause', duration: 0 },
      { type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' },
    ] },
  ])
  await browser.releaseActions()
  expect((await lineDocument()).layers).toEqual(before.layers)
  await browser.saveScreenshot(`${prefix}-series.png`)
  // Change a selected line, then prove its defaults remain independent of Arrow.
  await browser.keys('v')
  await browser.action('pointer').move({ origin: 'viewport', x: origin.x + 65, y: origin.y }).down({ button: 'left' }).up({ button: 'left' }).perform()
  const selection = $('.cs-selection-floating-toolbar')
  await expect(selection).toBeDisplayed()
  await selection.$('[data-control="stroke"] button').click()
  await $('.cs-arrow-toolbar-options button[aria-label="Dotted"]').click()
  expect(((await lineDocument()).layers.at(-3)! as ArrowLayer).payload.stroke).toMatchObject({ style: 'dotted' })
  const endpointBefore = (await lineDocument()).layers.at(-3)! as ArrowLayer
  const fixed = { x: endpointBefore.transform.translateX + endpointBefore.payload.start.x,
    y: endpointBefore.transform.translateY + endpointBefore.payload.start.y }
  await lineDrag(origin.x + 140, origin.y, 35, 2)
  const endpointAfter = (await lineDocument()).layers.at(-3)! as ArrowLayer
  expect(endpointAfter.transform.translateX + endpointAfter.payload.start.x).toBeCloseTo(fixed.x, 8)
  expect(endpointAfter.transform.translateY + endpointAfter.payload.start.y).toBeCloseTo(fixed.y, 8)
  expect(endpointAfter.payload.start.y).toBeCloseTo(endpointAfter.payload.end.y, 8)
  expect(endpointAfter.payload.end.x - endpointAfter.payload.start.x).toBeGreaterThan(
    endpointBefore.payload.end.x - endpointBefore.payload.start.x)
  await $('.cs-toolrail [data-tool-id="line"]').click()
  const rememberedHost = await lineDefaultsHost()
  await $(`${rememberedHost} [data-control="autoAlignAxes"]`).click()
  await $(`${rememberedHost} [data-control="stroke"] button`).click()
  await expect($('.cs-arrow-toolbar-options button[aria-label="Dotted"]')).toHaveAttribute('aria-pressed', 'true')
  await browser.saveScreenshot(`${prefix}-defaults.png`)
  await browser.keys('Escape')
  if (rememberedHost.includes('popover')) await browser.keys('Escape')
}
