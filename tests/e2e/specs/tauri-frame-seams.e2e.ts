import {
  copyFile,
  readFile,
  stat,
} from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  cardDocument,
  cardNative,
} from '../publication-card'
import { nativeImageIngress } from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyFrameSeams } from '../frame-seams'
import { setEditorPreferences } from '../editor-settings'

async function outputStamp(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
}

describe('native frame screen compositing', () => {
  it('exports the same opaque 4K screenshot with white and black screen fills', async () => {
    await browser.setWindowSize(1280, 900)
    await setEditorPreferences('en', 'dark')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await nativeImageIngress('picker', 'ui-4k.png')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await cardDocument()).canvas.width === 3840)
    await waitForStableCanvas()
    await verifyFrameSeams('artifacts/frame-seams/webview2', async (name) => {
      const output = await cardNative<string>('test_result_export', { cancel: false })
      const previous = await outputStamp(output)
      await $('button[aria-label="Export"]').click()
      await browser.waitUntil(async () => await outputStamp(output) > previous,
        { timeout: 90000, timeoutMsg: 'Export must write a fresh PNG before pixel comparison' })
      await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
      const bytes = await readFile(output)
      if (name === 'landscape-dark-white') await copyFile(output, 'artifacts/frame-seams/webview2/export.png')
      return bytes
    })
  }).timeout(180000)
})
