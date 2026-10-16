import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyShapeDefaultsPlacement } from '../shape-defaults-placement'

describe('nested shape defaults after selecting a callout in WebView', () => {
  it('keeps menus beside their trigger through production Quick and Editor flows', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyShapeDefaultsPlacement('artifacts/tauri-e2e', 'callout-shape-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    await verifyShapeDefaultsPlacement('artifacts/tauri-e2e', 'callout-shape-editor')
  })
})
