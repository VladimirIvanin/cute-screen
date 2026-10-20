import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyFrameSnapping } from '../frame-snap'

describe('general selection frame magnet', () => {
  it('moves and resizes an ordinary shape with held preview, bypass, cancel and undo/redo', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyFrameSnapping('artifacts/frame-snap/browser')
  }).timeout(120000)
})
