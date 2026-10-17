import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyRulerToolbar } from '../ruler-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('ruler toolbar through production capture', () => {
  it('changes bases in Quick and Editor and saves a cropped ruler', async function () {
    this.timeout(120000)
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyRulerToolbar('artifacts/tauri-e2e/ruler-ux-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyRulerToolbar('artifacts/tauri-e2e/ruler-ux-editor', true)
    await expect($('.cs-save-status')).not.toExist()
  })
})
