import {
  browser,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyFrameSeams } from '../frame-seams'

describe('frame screen compositing', () => {
  it('hides the screen fill beneath an opaque screenshot including every antialiased edge', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyFrameSeams('artifacts/frame-seams/browser')
  }).timeout(120000)
})
