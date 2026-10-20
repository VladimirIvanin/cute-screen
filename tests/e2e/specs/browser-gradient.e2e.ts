import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyGradient } from '../gradient'
import { setEditorPreferences } from '../editor-settings'

describe('gradient backdrops', () => {
  it('creates, stretches, edits and places text through production input', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyGradient('artifacts/browser-e2e')
    await browser.setWindowSize(1024, 768)
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      await $('.cs-toolrail [data-tool-id="gradient"]').click()
      const toolbar = $('.cs-tool-defaults-toolbar .cs-gradient-toolbar')
      await expect(toolbar).toBeDisplayed()
      const rect = await toolbar.getSize()
      expect(rect.width).toBeLessThan(1024)
      await browser.saveScreenshot(`artifacts/browser-e2e/gradient-${locale}-${theme}.png`)
    }
  }).timeout(120000)
})
