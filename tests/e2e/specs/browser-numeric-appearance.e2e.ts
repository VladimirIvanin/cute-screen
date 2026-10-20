import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyNumericAppearance } from '../numeric-appearance'
import { setEditorPreferences } from '../editor-settings'

describe('appearance numeric lifecycle', () => {
  it('commits on release, cancels with Escape and leaves wheel to scrolling', async () => {
    await browser.setWindowSize(1024, 800)
    await openDrawingHarness(true)
    for (const locale of ['en', 'ru'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await verifyNumericAppearance('artifacts/browser-e2e', locale)
    }
  }).timeout(120000)
})
