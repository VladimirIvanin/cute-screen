import path from 'node:path'

import { $, browser, expect } from '@wdio/globals'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'

describe('M08 eyedropper native clipboard in a real Tauri webview', () => {
  it('samples the decoded scene and reads uppercase HEX back from the system clipboard', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await finishAreaQuickCaptureInEditor()
    await expect($('[aria-label="Scene canvas"]')).toExist()
    await $('button[aria-label="Zoom in"]').click()
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #7F7F7F',
    )
    await expect($('[aria-label="Colour swatch #7F7F7F"]')).toExist()

    const clipboardText = await browser.execute(async () => {
      const harness = (
        window as typeof window & {
          __cuteScreenE2eM08?: {
            readClipboardText(): Promise<string | undefined>
          }
        }
      ).__cuteScreenE2eM08
      if (!harness) throw new Error('M08 clipboard harness is not ready')
      return harness.readClipboardText()
    })
    expect(clipboardText).toBe('#7F7F7F')
    await browser.saveScreenshot(
      path.resolve(
        process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e',
        'm08-eyedropper-native-clipboard.png',
      ),
    )
  })
})
