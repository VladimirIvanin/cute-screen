import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyRulerBounds } from '../ruler-bounds'

describe('ruler bounds after production capture', () => {
  it('limits endpoint and move gestures and fits rulers after crop', async () => {
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await verifyRulerBounds('artifacts/tauri-e2e/ruler-bounds')
  }).timeout(120000)
})
