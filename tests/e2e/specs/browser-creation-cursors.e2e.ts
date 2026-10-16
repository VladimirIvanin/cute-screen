import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyCreationCursors } from '../highlighter-toolbar'

describe('creation tool cursors', () => {
  it('uses the marker preview as cursor and keeps the crosshair for strokes across hover and pan', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await verifyCreationCursors('artifacts/browser-e2e', 'creation-cursors')
  })
})
