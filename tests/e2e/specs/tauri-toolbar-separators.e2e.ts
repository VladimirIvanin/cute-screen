import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyToolbarSeparators } from '../toolbar-separators'
import { waitForStableCanvas } from '../canvas-ready'

async function verifyPanels(surface: 'quick' | 'editor'): Promise<void> {
  for (const tool of ['Shape', 'Highlighter'] as const) {
    await $(`.cs-toolrail button[aria-label="${tool}"]`).click()
    const selector = tool === 'Shape' ? '.cs-shape-toolbar' : '.cs-highlighter-toolbar'
    if (!(await $(selector).isDisplayed()) && await $('.cs-quick-settings-button').isDisplayed()) {
      await $('.cs-quick-settings-button').click()
    }
    await expect($(selector)).toBeDisplayed()
    await verifyToolbarSeparators(selector, tool === 'Shape' ? 3 : 2)
    await browser.saveScreenshot(`artifacts/tauri-e2e/separators-${surface}-${tool.toLowerCase()}.png`)
  }
}

describe('straight toolbar separators in production WebView', () => {
  it('uses centered straight lines through Capture, Quick and Editor', async () => {
    await browser.setWindowSize(1024, 800)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await verifyPanels('quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    await verifyPanels('editor')
  })
})
