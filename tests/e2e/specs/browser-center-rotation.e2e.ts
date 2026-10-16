import {
  browser,
} from '@wdio/globals'
import { verifyCenterRotation } from '../center-rotation'
import { openDrawingHarness } from './browser-m06-test-kit'

describe('rotation center', () => {
  it('keeps newly drawn elements centered through gestures, numeric edits and history', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness()
    await verifyCenterRotation('artifacts/browser-e2e/center-rotation')
  }).timeout(120000)
})
