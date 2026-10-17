import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  selectionDocument,
  verifySelectionInteractions,
} from '../selection-interactions'

describe('selection policies through production capture', () => {
  it('moves annotations in Quick with non-origin crop and after the Editor handoff', async function () {
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const size = await scene.getSize()
    const origin = await scene.getLocation()
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(origin.x + 5), y: Math.round(origin.y + 5) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(size.width * .2), y: Math.round(size.height * .2), duration: 160 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => ((await selectionDocument()).crop?.x ?? 0) > 0)
    expect((await selectionDocument()).crop?.x).toBeGreaterThan(0)
    await verifySelectionInteractions('artifacts/tauri-e2e/selection-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await verifySelectionInteractions('artifacts/tauri-e2e/selection-editor')
  }).timeout(180_000)
})
