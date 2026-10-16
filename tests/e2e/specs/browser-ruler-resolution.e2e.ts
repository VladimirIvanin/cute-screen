import { browser } from '@wdio/globals'
import { openM08 } from './browser-m08-test-kit'
import { verifyRulerResolution } from '../ruler-resolution'

describe('ruler label display density', () => {
  for (const dpr of [1, 2]) {
    it(`renders sharp labels and keeps document coordinates at DPR ${dpr}`, async () => {
      await browser.setViewport({ width: 1280, height: 900, devicePixelRatio: dpr })
      await openM08()
      await verifyRulerResolution(`artifacts/browser-e2e/ruler-dpr-${dpr}`)
    })
  }
})
