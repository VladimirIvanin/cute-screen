import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyNumericKeyboard } from '../numeric-keyboard'
import { setEditorPreferences } from '../editor-settings'

describe('numeric keyboard lifecycle', () => {
  it('previews gradient opacity until release and preserves editing and cancellation', async () => {
    await browser.setWindowSize(1024, 800)
    await openDrawingHarness(true)
    for (const locale of ['en', 'ru'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await verifyNumericKeyboard('artifacts/browser-e2e', 'gradient', `numeric-${locale}-${theme}`, locale)
    }
  }).timeout(120000)
})
