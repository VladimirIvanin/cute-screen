import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyStraightStrokes } from '../straight-strokes'
import { waitForStableCanvas } from '../canvas-ready'

describe('Shift straight drawing', () => {
  for (const dpr of [1, 2]) {
    for (const actualSize of [false, true]) {
      it(`draws mixed strokes at DPR ${dpr}, ${actualSize ? '1:1' : 'Fit'} with both Shift keys`, async () => {
        await browser.setViewport({ width: 1280, height: 900, devicePixelRatio: dpr })
        await openDrawingHarness(true)
        if (actualSize) await $('.cs-zoom-value').click()
        await waitForStableCanvas()
        await verifyStraightStrokes('artifacts/browser-e2e', `straight-strokes-${dpr}-${actualSize ? 'actual' : 'fit'}`)
      })
    }
  }
  it('explains Shift in localized tooltips at 1024px', async () => {
    await browser.setViewport({ width: 1024, height: 800, devicePixelRatio: 1 })
    await openDrawingHarness(true)
    for (const locale of ['en', 'ru'] as const) {
      await setShellPreferences(locale, locale === 'ru' ? 'dark' : 'light')
      for (const tool of ['pencil', 'marker']) {
        await $(`.cs-toolrail button[data-tool-id="${tool}"]`).moveTo()
        await expect($('.n-tooltip')).toHaveText(expect.stringContaining(locale === 'ru'
          ? 'Shift — прямой участок, шаг 45°' : 'Shift — straight segment, 45° steps'))
        await $('.cs-brand').moveTo()
      }
    }
  })
})
