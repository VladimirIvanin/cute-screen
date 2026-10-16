import { browser } from '@wdio/globals'
import { openM08 } from './browser-m08-test-kit'
import { verifyRulerBounds } from '../ruler-bounds'

describe('ruler canvas bounds', () => {
  for (const width of [1280, 1024]) {
    it(`limits edits and fits existing rulers as one undoable crop at ${width}px`, async () => {
      await browser.setWindowSize(width, width === 1280 ? 900 : 700)
      await openM08()
      await verifyRulerBounds(`artifacts/browser-e2e/ruler-bounds-${width}`)
    }).timeout(120000)
  }
})
