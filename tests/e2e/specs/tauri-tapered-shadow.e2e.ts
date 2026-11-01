import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  verifyTaperedShadow,
  shadowLayers,
} from '../tapered-shadow'
import { waitForStableCanvas } from '../canvas-ready'

describe('tapered shadows through native capture', () => {
  it('creates the arrow in Quick and preserves the effect in Editor', async () => {
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await verifyTaperedShadow('artifacts/tauri-e2e')
    const before = (await shadowLayers()).at(-1)!
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    expect((await shadowLayers()).find((layer) => layer.id === before.id)).toEqual(before)
    await expect($('.cs-save-status')).not.toExist()
    await browser.saveScreenshot('artifacts/tauri-e2e/tapered-shadow-editor.png')
  }).timeout(180000)
})
