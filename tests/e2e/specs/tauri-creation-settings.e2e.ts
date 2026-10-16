import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'

async function frame() {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eQuick?: { snapshot(): {
      canvas: { width: number; height: number }
      crop: { x: number; y: number; width: number; height: number } | null
      layers: readonly unknown[]
    } | undefined } }
    const document = state.__cuteScreenE2eQuick?.snapshot()
    if (!document?.crop) throw new Error('Quick capture frame missing')
    const sceneElement = window.document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!
    const scene = sceneElement.getBoundingClientRect()
    return {
      ...document,
      crop: document.crop,
      scene: { x: scene.x, y: scene.y, width: scene.width, height: scene.height },
    }
  })
}
async function resizeCorner(
  corner: 'nw' | 'se',
  x: number,
  y: number,
): Promise<void> {
  const state = await frame()
  const crop = state.crop
  const cx = corner === 'nw' ? crop.x : crop.x + crop.width
  const cy = corner === 'nw' ? crop.y : crop.y + crop.height
  const point = (px: number, py: number) => ({
    x: Math.min(
      Math.round(state.scene.x + px * state.scene.width / state.canvas.width),
      Math.round(state.scene.x + state.scene.width - 1),
    ),
    y: Math.min(
      Math.round(state.scene.y + py * state.scene.height / state.canvas.height),
      Math.round(state.scene.y + state.scene.height - 1),
    ),
  })
  const before = await $('.cs-quick-toolrail-group').getAttribute('style')
  await browser.action('pointer').move({ origin: 'viewport', ...point(cx, cy) }).down({ button: 'left' })
    .move({ origin: 'viewport', ...point(x * state.canvas.width, y * state.canvas.height), duration: 150 }).perform(true)
  expect(await $('.cs-quick-toolrail-group').getAttribute('style')).toBe(before)
  await browser.action('pointer').up({ button: 'left' }).perform()
}
describe('Quick settings keep the drawing area free', () => {
  it('fits outside a small frame, collapses for a full frame and draws through outside dismissal', async function () {
    this.timeout(120000)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    await resizeCorner('se', .9, .9)
    await resizeCorner('nw', .25, .25)
    await resizeCorner('se', .65, .6)
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-quick-defaults')).toBeDisplayed()
    const geometry = await browser.execute(() => {
      const row = document.querySelector('.cs-quick-defaults')!.getBoundingClientRect()
      const tools = document.querySelector('.cs-quick-toolrail-group')!.getBoundingClientRect()
      return { top: Math.min(row.top, tools.top), bottom: Math.max(row.bottom, tools.bottom) }
    })
    const small = await frame()
    const cropTop = small.scene.y + small.crop.y * small.scene.height / small.canvas.height
    const cropBottom = cropTop + small.crop.height * small.scene.height / small.canvas.height
    expect(geometry.bottom <= cropTop - 11 || geometry.top >= cropBottom + 11).toBe(true)
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-quick-outside.png')

    await $('button[aria-label="Select"]').click()
    await resizeCorner('nw', 0, 0)
    await resizeCorner('se', 1, 1)
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-quick-defaults')).not.toBeDisplayed()
    await expect($('.cs-quick-settings-button')).toBeDisplayed()
    await $('.cs-quick-settings-button').click()
    await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-quick-manual.png')
    const before = await frame()
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(before.scene.x + before.scene.width * .35), y: Math.round(before.scene.y + before.scene.height * .45) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 100, y: 50, duration: 200 })
      .up({ button: 'left' }).perform()
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    await browser.waitUntil(async () => (await frame()).layers.length === before.layers.length + 1)
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-quick-first-stroke.png')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-editor.png')
  })
})
