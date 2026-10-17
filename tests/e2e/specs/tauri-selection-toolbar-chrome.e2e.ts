import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifySelectionToolbarChrome } from '../selection-toolbar-chrome'

describe('selection toolbar clears chrome through production capture', () => {
  it('keeps selection settings and nested menus accessible below system actions', async function () {
    this.timeout(90000)
    await browser.setWindowSize(1280, 900)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await verifySelectionToolbarChrome('artifacts/tauri-e2e/toolbar-chrome')
  })
})
