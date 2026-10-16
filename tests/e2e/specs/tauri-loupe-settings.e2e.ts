import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyLoupeSettings } from '../loupe-settings'

describe('loupe settings through production capture', () => {
  it('edits the loupe in Quick and the editor', async () => {
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyLoupeSettings('artifacts/tauri-e2e/loupe-settings-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await verifyLoupeSettings('artifacts/tauri-e2e/loupe-settings-editor')
  }).timeout(120000)
})
