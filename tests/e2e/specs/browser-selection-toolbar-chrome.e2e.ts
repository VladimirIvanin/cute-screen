import { browser } from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifySelectionToolbarChrome } from '../selection-toolbar-chrome'

describe('selection settings clear system toolbars', () => {
  for (const locale of ['en', 'ru'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      it(`clears top actions and bottom controls at 1024 px (${locale}/${theme})`, async function () {
        this.timeout(60000)
        await browser.setWindowSize(1024, 800)
        await openDrawingHarness(true)
        await setShellPreferences(locale, theme)
        await verifySelectionToolbarChrome(`artifacts/browser-e2e/toolbar-chrome-${locale}-${theme}`, locale)
      })
    }
  }
})
