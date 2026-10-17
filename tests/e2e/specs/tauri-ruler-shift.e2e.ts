import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyRulerShift } from '../ruler-shift'
import { waitForStableCanvas } from '../canvas-ready'

describe('Shift ruler through production capture', () => {
  it('snaps in Quick Capture and Editor with key-only preview and undo/redo', async function () {
    this.timeout(120000)
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyRulerShift('artifacts/tauri-e2e/ruler-shift-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyRulerShift('artifacts/tauri-e2e/ruler-shift-editor')
    await expect($('.cs-save-status')).not.toExist()
  })
})
