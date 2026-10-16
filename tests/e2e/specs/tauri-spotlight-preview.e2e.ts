import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifySpotlightPreview } from '../spotlight-preview'

describe('spotlight through production capture', () => {
  it('previews gestures in Quick and the editor', async () => {
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifySpotlightPreview('artifacts/tauri-e2e/spotlight-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await verifySpotlightPreview('artifacts/tauri-e2e/spotlight-editor')
  }).timeout(120000)
})
