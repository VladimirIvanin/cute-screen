import {
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyHandDrawn } from '../hand-drawn'
import { shapeDocument } from '../shape-toolbar'

describe('hand-drawn annotation tools', () => {
  it('creates circling and independently styles arrows through production controls', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyHandDrawn('artifacts/browser-e2e')
    const annotations = (await shapeDocument()).layers.slice(-3)
    expect(annotations[0]!.payload.shape).toBe('rectangularCircling')
    expect(annotations[1]!.payload.shape).toBe('circling')
    expect(annotations[2]!.payload.appearance).toBe('handDrawn')
  }).timeout(120000)
})
