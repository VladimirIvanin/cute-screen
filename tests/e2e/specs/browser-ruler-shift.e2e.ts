import {
  $,
  browser,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyRulerShift } from '../ruler-shift'
import { expectToolTooltip } from '../tool-tooltip'

describe('Shift ruler', () => {
  afterEach(async function () {
    if (this.currentTest?.state === 'failed') console.log('Ruler input trace', await browser.execute(() =>
      document.documentElement.dataset.rulerInputTrace))
    await browser.releaseActions()
  })
  for (const dpr of [1, 2]) {
    for (const actual of [false, true]) {
      it(`snaps creation and endpoint resize at DPR ${dpr}, ${actual ? '1:1' : 'Fit'}`, async () => {
        await browser.setViewport({ width: 1280, height: 900, devicePixelRatio: dpr })
        await openDrawingHarness(true)
        if (actual) await $('.cs-zoom-value').click()
        await verifyRulerShift(`artifacts/browser-e2e/ruler-shift-${dpr}-${actual ? 'actual' : 'fit'}`)
      })
    }
  }
  it('keeps RU/EN tooltips concise', async () => {
    await openDrawingHarness(true)
    for (const locale of ['en', 'ru'] as const) {
      await setShellPreferences(locale, 'light')
      await $('.cs-toolrail button[data-tool-id="ruler"]').moveTo()
      await expectToolTooltip(locale === 'ru' ? 'Линейка (R)' : 'Ruler (R)')
      await $('.cs-brand').moveTo()
    }
  })
})
