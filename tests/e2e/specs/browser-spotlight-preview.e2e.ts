import { browser } from '@wdio/globals'
import { openM08 } from './browser-m08-test-kit'
import { verifySpotlightPreview } from '../spotlight-preview'

describe('spotlight pixels during gestures', () => {
  it('previews creation, movement and aperture cancellation before pointer-up', async () => {
    await browser.setWindowSize(1280, 900)
    await openM08()
    await verifySpotlightPreview('artifacts/browser-e2e/spotlight')
  }).timeout(120000)
})
