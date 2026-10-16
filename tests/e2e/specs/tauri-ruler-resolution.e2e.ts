import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyRulerResolution } from '../ruler-resolution'

describe('ruler label through production capture', () => {
  it('keeps labels sharp in Quick and after editor handoff', async () => {
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyRulerResolution('artifacts/tauri-e2e/ruler-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await verifyRulerResolution('artifacts/tauri-e2e/ruler-editor')
  }).timeout(120000)
})
