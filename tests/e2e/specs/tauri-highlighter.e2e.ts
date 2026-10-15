import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyHighlighter } from '../highlighter-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('highlighter through production capture', () => {
  it('draws and configures the highlighter in Quick Capture and the editor', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyHighlighter('artifacts/tauri-e2e', 'highlighter-quick', true)
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    await verifyHighlighter('artifacts/tauri-e2e', 'highlighter-editor', true)
  })
})
