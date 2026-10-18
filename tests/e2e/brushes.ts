import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { shapeDocument } from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyBrushes(
  directory: string,
  prefix: string,
): Promise<void> {
  await $('button[aria-label="Pencil"]').waitForEnabled()
  await $('button[aria-label="Pencil"]').click()
  await waitForStableCanvas()
  const bounds = await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      if (event.target instanceof HTMLCanvasElement && event.target.matches('.cs-canvas:not(.cs-canvas-overlay)')) {
        document.documentElement.dataset.brushPointerTrusted = String(event.isTrusted)
      }
    }, { capture: true })
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  })
  const initial = (await shapeDocument()).layers.length
  for (const [row, entry] of [
    ['Exact pen', 'pen'], ['Autocorrection', 'stabilized'],
  ].entries()) {
    await $('button[aria-label="Brush and width"]').click()
    await $(`.cs-brush-choices button[aria-label="${entry[0]}"]`).click()
    expect(await $('.cs-brush-choices button[aria-pressed="true"]').getAttribute('aria-label')).toBe(entry[0])
    await browser.saveScreenshot(path.resolve(directory, `${prefix}-${entry[1]}-settings.png`))
    await browser.keys('Escape')
    await $('.cs-tool-settings-popover').waitForDisplayed({ reverse: true })
    await browser.waitUntil(() => browser.execute(() => document.getAnimations().every((animation) =>
      animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running')))
    if (row === 0) await expect($('button[aria-label="Correction"]')).toBeDisabled()
    const x = Math.round(bounds.x + bounds.width * .15)
    const y = Math.round(bounds.y + bounds.height * (.3 + row * .17))
    const action = browser.action('pointer').move({ origin: 'viewport', x, y }).down({ button: 'left' })
    for (let i = 1; i <= 16; i++) {
      action.move({ origin: 'viewport', x: Math.round(x + bounds.width * .55 * i / 16),
        y: Math.round(y + Math.sin(i / 3) * bounds.height * .04 + (i % 2 ? 3 : -3)), duration: 20 })
    }
    await action.up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + row + 1,
      { timeoutMsg: `The ${entry[1]} stroke did not commit` })
    expect((await shapeDocument()).layers.at(-1)!.payload).toMatchObject({
      brush: entry[1], strokeVersion: 2, pressureMode: 'simulated',
    })
    await expect($('.cs-toolrail button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
  }
  expect(await $('html').getAttribute('data-brush-pointer-trusted')).toBe('true')
  await browser.saveScreenshot(path.resolve(directory, `${prefix}-strokes.png`))
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + 1)
  await $('button[aria-label="Redo"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + 2)
  const beforeCancel = await shapeDocument()
  const x = Math.round(bounds.x + bounds.width * .2)
  const y = Math.round(bounds.y + bounds.height * .8)
  await browser.action('pointer', { id: 'brush-cancel' }).move({ origin: 'viewport', x, y }).down({ button: 'left' })
    .move({ origin: 'pointer', x: 50, y: 0, duration: 100 }).perform(true)
  await browser.keys('Escape')
  await browser.action('pointer', { id: 'brush-cancel' }).up({ button: 'left' }).perform()
  expect(await shapeDocument()).toEqual(beforeCancel)
}
