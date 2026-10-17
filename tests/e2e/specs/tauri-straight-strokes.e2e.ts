import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyStraightStrokes } from '../straight-strokes'
import { waitForStableCanvas } from '../canvas-ready'

describe('Shift drawing through production capture', () => {
  it('creates constrained ink in Quick and Editor and persists it', async function () {
    this.timeout(120000)
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyStraightStrokes('artifacts/tauri-e2e', 'straight-strokes-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyStraightStrokes('artifacts/tauri-e2e', 'straight-strokes-editor')
    await expect($('.cs-save-status')).not.toExist()
  })
})
