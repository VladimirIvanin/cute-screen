import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyCompositionHighlighterPreview } from '../highlighter-live-preview'

describe('highlighter live composition preview', () => {
  it('updates held stroke pixels, commits once and restores cancellation through production controls', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyCompositionHighlighterPreview('artifacts/browser-e2e', 'highlighter-live')
  }).timeout(180000)
})
