import { browser } from '@wdio/globals'
import { verifyEmoji } from '../emoji'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'

describe('Noto emoji through the mounted editor', () => {
  for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
    it(`places, replaces, undoes and searches bundled artwork: ${locale}/${theme}`, async () => {
      await browser.setWindowSize(1024, 800)
      await openDrawingHarness(true)
      await setShellPreferences(locale, theme)
      await verifyEmoji('artifacts/browser-e2e', `emoji-${locale}-${theme}`)
    })
  }
})
