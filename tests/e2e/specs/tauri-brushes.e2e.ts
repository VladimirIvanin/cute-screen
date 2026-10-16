import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyBrushes } from '../brushes'
import { waitForStableCanvas } from '../canvas-ready'

describe('brushes through production capture', () => {
  it('draws and cancels in Quick, then draws again after editor handoff', async function () {
    this.timeout(120000)
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyBrushes('artifacts/tauri-e2e', 'brushes-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await $('.cs-toolrail button[aria-label="Pencil"]').waitForEnabled()
    await verifyBrushes('artifacts/tauri-e2e', 'brushes-editor')
    await expect($('.cs-save-status')).not.toExist()
  })
})
