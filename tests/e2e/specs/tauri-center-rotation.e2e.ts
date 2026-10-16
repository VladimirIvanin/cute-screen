import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyCenterRotation } from '../center-rotation'

describe('rotation center through production capture', () => {
  it('keeps the center fixed in Quick and after the editor handoff', async () => {
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyCenterRotation('artifacts/tauri-e2e/center-rotation-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await verifyCenterRotation('artifacts/tauri-e2e/center-rotation-editor')
  }).timeout(120000)
})
