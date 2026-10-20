import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyHandDrawnLine } from '../hand-drawn-line'

describe('hand-drawn standalone line', () => {
  it('creates series and edits appearance through production controls', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyHandDrawnLine('artifacts/browser-e2e')
  }).timeout(120000)
})
